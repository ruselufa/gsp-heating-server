import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as mqtt from 'mqtt';

@Injectable()
export class MqttService implements OnModuleInit, OnModuleDestroy {
	private readonly logger = new Logger(MqttService.name);
	private client: mqtt.MqttClient | null = null;
	private readonly subscriptions = new Map<string, (topic: string, message: Buffer) => void>();

	constructor(private readonly configService: ConfigService) {}

	async onModuleInit() {
		const brokerUrl = this.configService.get<string>('MQTT_BROKER_URL', 'mqtt://localhost:1883');
		const username = this.configService.get<string>('MQTT_USERNAME');
		const password = this.configService.get<string>('MQTT_PASSWORD');

		const options: mqtt.IClientOptions = {
			clientId: `gsp-heating-server-${Date.now()}`,
			clean: true,
			connectTimeout: 4000,
			reconnectPeriod: 1000,
		};

		if (username && password) {
			options.username = username;
			options.password = password;
		}

		try {
			this.client = mqtt.connect(brokerUrl, options);

			this.client.on('connect', () => {
				this.logger.log('Connected to MQTT broker');
			});

			this.client.on('error', (error) => {
				this.logger.error('MQTT connection error:', error);
			});

			this.client.on('message', (topic, message) => {
				const handler = this.subscriptions.get(topic);
				if (handler) {
					handler(topic, message);
				}
			});

			this.client.on('reconnect', () => {
				this.logger.log('Reconnecting to MQTT broker...');
			});

		} catch (error) {
			this.logger.error('Failed to connect to MQTT broker:', error);
		}
	}

	async onModuleDestroy() {
		if (this.client) {
			await this.client.end();
			this.logger.log('Disconnected from MQTT broker');
		}
	}

	subscribe(topic: string, handler: (topic: string, message: Buffer) => void): void {
		if (!this.client || !this.client.connected) {
			this.logger.warn('MQTT client not connected, cannot subscribe to topic:', topic);
			return;
		}

		this.subscriptions.set(topic, handler);
		this.client.subscribe(topic, (error) => {
			if (error) {
				this.logger.error(`Failed to subscribe to topic ${topic}:`, error);
			} else {
				this.logger.log(`Subscribed to topic: ${topic}`);
			}
		});
	}

	unsubscribe(topic: string): void {
		if (!this.client || !this.client.connected) {
			return;
		}

		this.subscriptions.delete(topic);
		this.client.unsubscribe(topic, (error) => {
			if (error) {
				this.logger.error(`Failed to unsubscribe from topic ${topic}:`, error);
			} else {
				this.logger.log(`Unsubscribed from topic: ${topic}`);
			}
		});
	}

	publish(topic: string, message: string | Buffer): void {
		if (!this.client || !this.client.connected) {
			this.logger.warn('MQTT client not connected, cannot publish to topic:', topic);
			return;
		}

		this.client.publish(topic, message, (error) => {
			if (error) {
				this.logger.error(`Failed to publish to topic ${topic}:`, error);
			} else {
				this.logger.debug(`Published to topic: ${topic}, message: ${message}`);
			}
		});
	}

	isConnected(): boolean {
		return this.client ? this.client.connected : false;
	}
}
