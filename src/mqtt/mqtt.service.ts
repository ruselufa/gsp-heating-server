import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { MqttClient, connect } from 'mqtt';
import { mqttConfigs } from './mqtt.config';
import { EventEmitter2 } from '@nestjs/event-emitter';

interface MqttClientState {
	client: MqttClient;
	reconnectAttempts: number;
	topics: string[];
}

@Injectable()
export class MqttService implements OnModuleInit, OnModuleDestroy {
	private clientStates: Record<string, MqttClientState> = {};
	private readonly logger = new Logger(MqttService.name);
	private readonly maxReconnectAttempts = 5;
	private readonly reconnectInterval = 5000; // 5 секунд

	constructor(private eventEmitter: EventEmitter2) { }

	async onModuleInit() {
		await this.connectToAllBrokers();
	}

	async onModuleDestroy() {
		await this.disconnectAll();
	}

	private async connectToAllBrokers() {
		for (const [name, config] of Object.entries(mqttConfigs)) {
			await this.connectToBroker(name, config);
		}
	}

	private async connectToBroker(
		name: string,
		config: (typeof mqttConfigs)[keyof typeof mqttConfigs],
	) {
		try {
			const client = connect({
				host: config.host,
				port: config.port,
				protocol: config.protocol,
				clientId: config.clientId,
				username: config.username,
				password: config.password,
				reconnectPeriod: 0, // Отключаем автоматическое переподключение
			});

			this.clientStates[name] = {
				client,
				reconnectAttempts: 0,
				topics: [],
			};

			client.on('connect', () => {
				this.logger.log(`Connected to MQTT broker "${name}" at ${config.host}:${config.port}`);
				this.clientStates[name].reconnectAttempts = 0;
				this.resubscribeToTopics(name);
				this.eventEmitter.emit(`mqtt.${name}.connected`);
			});

			client.on('message', (topic, message) => {
				this.handleMessage(name, topic, message);
			});

			client.on('error', (error) => {
				this.logger.error(`MQTT ${name} error: ${error.message}`);
				this.eventEmitter.emit(`mqtt.${name}.error`, error);
			});

			client.on('close', () => {
				this.logger.warn(`MQTT connection closed for ${name}`);
				this.handleReconnect(name, config);
			});

			client.on('offline', () => {
				this.logger.warn(`MQTT client went offline for ${name}`);
				this.handleReconnect(name, config);
			});
		} catch (error) {
			this.logger.error(`Failed to connect to MQTT broker ${name}: ${error.message}`);
		}
	}

	private handleMessage(brokerName: string, topic: string, message: Buffer) {
		// Эмитируем событие для каждого сообщения
		this.eventEmitter.emit(`mqtt.${brokerName}.message`, {
			topic,
			message: message.toString(),
		});

		// Эмитируем событие для конкретного топика
		this.eventEmitter.emit(`mqtt.${brokerName}.topic.${topic}`, {
			topic,
			message: message.toString(),
		});
	}

	private async handleReconnect(
		name: string,
		config: (typeof mqttConfigs)[keyof typeof mqttConfigs],
	) {
		const state = this.clientStates[name];
		if (!state || state.reconnectAttempts >= this.maxReconnectAttempts) {
			this.logger.error(`Max reconnect attempts reached for ${name}`);
			return;
		}

		state.reconnectAttempts++;
		this.logger.log(`Reconnecting to ${name} (attempt ${state.reconnectAttempts}/${this.maxReconnectAttempts})...`);

		setTimeout(async () => {
			await this.connectToBroker(name, config);
		}, this.reconnectInterval);
	}

	private resubscribeToTopics(brokerName: string) {
		const state = this.clientStates[brokerName];
		if (!state || !state.client.connected) return;

		for (const topic of state.topics) {
			state.client.subscribe(topic, (error) => {
				if (error) {
					this.logger.error(`Failed to resubscribe to topic ${topic} on ${brokerName}: ${error.message}`);
				} else {
					this.logger.debug(`Resubscribed to topic ${topic} on ${brokerName}`);
				}
			});
		}
	}

	subscribe(brokerName: string, topic: string) {
		const state = this.clientStates[brokerName];
		if (!state) {
			this.logger.error(`Broker ${brokerName} not found`);
			return;
		}

		if (!state.topics.includes(topic)) {
			this.logger.log(`[MQTT] Subscribing to ${topic} on broker ${brokerName}`);
			state.client.subscribe(topic, (err) => {
				if (err) {
					this.logger.error(`Failed to subscribe to ${topic} on ${brokerName}: ${err.message}`);
				} else {
					this.logger.log(`Successfully subscribed to ${topic} on ${brokerName}`);
					state.topics.push(topic);
				}
			});
		} else {
			this.logger.debug(`Already subscribed to ${topic} on ${brokerName}`);
		}
	}

	unsubscribe(topic: string, brokerName: string = 'heating') {
		const state = this.clientStates[brokerName];
		if (!state) {
			this.logger.warn(`MQTT client "${brokerName}" not found`);
			return;
		}

		// Удаляем топик из списка для переподписки
		const index = state.topics.indexOf(topic);
		if (index > -1) {
			state.topics.splice(index, 1);
		}

		state.client.unsubscribe(topic, (error) => {
			if (error) {
				this.logger.error(`Failed to unsubscribe from topic "${topic}" on broker "${brokerName}": ${error.message}`);
			} else {
				this.logger.debug(`Unsubscribed from topic "${topic}" on broker "${brokerName}"`);
			}
		});

		// Отписываемся от события
		this.eventEmitter.removeAllListeners(`mqtt.${brokerName}.topic.${topic}`);
	}

	publish(
		brokerName: string,
		topic: string,
		message: string | Record<string, unknown> | boolean | number,
		options: { retain?: boolean } = {},
	) {
		const state = this.clientStates[brokerName];
		if (!state) {
			this.logger.error(`Broker ${brokerName} not found`);
			return;
		}

		if (!state.client.connected) {
			this.logger.warn(`MQTT client "${brokerName}" not connected, cannot publish to topic: ${topic}`);
			return;
		}

		// Преобразуем сообщение в строку
		let payload: string;
		if (typeof message === 'boolean') {
			payload = message ? '1' : '0';
		} else if (typeof message === 'object') {
			payload = JSON.stringify(message);
		} else {
			payload = String(message);
		}

		state.client.publish(topic, payload, { qos: 1, retain: options.retain || false }, (err) => {
			if (err) {
				this.logger.error(`Failed to publish to ${topic} on ${brokerName}: ${err.message}`);
			} else {
				this.logger.log(`✅ MQTT Published to "${topic}" on broker "${brokerName}": ${payload}`);
			}
		});
	}

	isConnected(brokerName: string = 'heating'): boolean {
		const state = this.clientStates[brokerName];
		return state ? state.client.connected : false;
	}

	getConnectedClients(): string[] {
		const connected: string[] = [];
		for (const [brokerName, state] of Object.entries(this.clientStates)) {
			if (state.client.connected) {
				connected.push(brokerName);
			}
		}
		return connected;
	}

	getBrokerConfigs() {
		return mqttConfigs;
	}

	private async disconnectAll() {
		for (const [brokerName, state] of Object.entries(this.clientStates)) {
			try {
				await state.client.endAsync();
				this.logger.log(`Disconnected from MQTT broker "${brokerName}"`);
			} catch (error) {
				this.logger.error(`Error disconnecting from MQTT broker "${brokerName}": ${error.message}`);
			}
		}
		this.clientStates = {};
	}
}