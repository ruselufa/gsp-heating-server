import {
	WebSocketGateway,
	WebSocketServer,
	OnGatewayInit,
	OnGatewayConnection,
	OnGatewayDisconnect,
	SubscribeMessage,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Device } from '../devices/interfaces/device.interface';
import { Logger } from '@nestjs/common';
import { HeatingService } from '../devices/heating/heating.service';
import { TemperatureSensorService } from '../devices/temperature-sensor/temperature-sensor.service';
import { heatingConfigs } from '../devices/heating/heating.config';

interface ClientSubscription {
	clientId: string;
	heating: Set<string>;
	temperatureSensors: Set<string>;
	devices: Set<string>;
}

interface HeatingCommand {
	heatingId: string;
	command: 'TURN_ON' | 'TURN_OFF' | 'SET_TEMPERATURE' | 'SET_PUMP_SPEED' | 'SET_VALVE' | 'EMERGENCY_STOP';
	value?: string | number;
}

@WebSocketGateway({
	cors: {
		origin: '*',
	},
	namespace: '/heating-selective',
})
export class SelectiveWebsocketGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
	@WebSocketServer()
	server: Server;

	private readonly logger = new Logger(SelectiveWebsocketGateway.name);
	private clientSubscriptions: Map<string, ClientSubscription> = new Map();

	constructor(
		private readonly eventEmitter: EventEmitter2,
		private readonly heatingService: HeatingService,
		private readonly temperatureSensorService: TemperatureSensorService,
	) {
		// Подписываемся на события обновления устройств
		this.eventEmitter.on('device.updated', (device: Device) => this.handleDeviceUpdate(device));
		
		// События системы отопления
		this.eventEmitter.on('heating.temperature.updated', (data: { heatingId: string; temperature: number }) =>
			this.sendHeatingUpdate(data.heatingId),
		);
		this.eventEmitter.on('heating.setpoint.changed', (data: { heatingId: string; temperature: number }) =>
			this.sendHeatingUpdate(data.heatingId),
		);
		this.eventEmitter.on('heating.pump.speed.changed', (data: { heatingId: string; speed: number }) =>
			this.sendHeatingUpdate(data.heatingId),
		);
		this.eventEmitter.on('heating.valve.state.changed', (data: { heatingId: string; action: string; state: string }) =>
			this.sendHeatingUpdate(data.heatingId),
		);
		this.eventEmitter.on('heating.alarm', (data: { heatingId: string; isAlarm: boolean }) =>
			this.sendHeatingUpdate(data.heatingId),
		);

		// События датчиков температуры
		this.eventEmitter.on('temperature.sensor.updated', (data: { sensorId: string; data: any }) =>
			this.sendTemperatureSensorUpdate(data.sensorId),
		);
	}

	afterInit() {
		this.logger.log('Selective WebSocket Gateway для системы отопления инициализирован');
	}

	handleConnection(client: Socket) {
		this.logger.log(`Client connected: ${client.id}`);
		
		// Инициализируем подписки для нового клиента
		this.clientSubscriptions.set(client.id, {
			clientId: client.id,
			heating: new Set(),
			temperatureSensors: new Set(),
			devices: new Set(),
		});

		// Отправляем подтверждение подключения
		client.emit('connected', { 
			clientId: client.id, 
			message: 'Connected to Heating System Selective WebSocket',
			namespace: '/heating-selective',
		});
	}

	handleDisconnect(client: Socket) {
		this.logger.log(`Client disconnected: ${client.id}`);
		
		// Удаляем подписки клиента
		this.clientSubscriptions.delete(client.id);
	}

	@SubscribeMessage('subscribeToHeating')
	async handleHeatingSubscription(client: Socket, heatingIds: string[]) {
		const subscription = this.clientSubscriptions.get(client.id);
		if (subscription) {
			subscription.heating.clear();
			heatingIds.forEach(id => subscription.heating.add(id));
			
			this.logger.log(`Client ${client.id} subscribed to heating systems: ${heatingIds.join(', ')}`);
			
			// Отправляем подтверждение подписки
			client.emit('heatingSubscriptionConfirmed', { 
				subscribedTo: heatingIds,
				message: 'Heating subscription confirmed' 
			});

			// Сразу отсылаем текущие данные
			const list = heatingIds.map(id => {
				const state = this.heatingService.getState(id);
				const config = heatingConfigs[id];
				return {
					heatingId: id,
					name: config?.deviceRealName || id,
					...state,
				};
			}).filter(item => item !== null);
			
			client.emit('heating', list);
		}
	}

	@SubscribeMessage('subscribeToTemperatureSensors')
	handleTemperatureSensorSubscription(client: Socket, sensorIds: string[]) {
		const subscription = this.clientSubscriptions.get(client.id);
		if (subscription) {
			subscription.temperatureSensors.clear();
			sensorIds.forEach(id => subscription.temperatureSensors.add(id));
			
			this.logger.log(`Client ${client.id} subscribed to temperature sensors: ${sensorIds.join(', ')}`);
			
			client.emit('temperatureSensorSubscriptionConfirmed', { 
				subscribedTo: sensorIds,
				message: 'Temperature sensor subscription confirmed' 
			});

			// Отправляем текущие данные датчиков
			const list = sensorIds.map(id => ({
				sensorId: id,
				...this.temperatureSensorService.getSensorData(id),
			})).filter(item => item !== null);
			
			client.emit('temperatureSensors', list);
		}
	}

	@SubscribeMessage('subscribeToDevices')
	handleDeviceSubscription(client: Socket, deviceIds: string[]) {
		const subscription = this.clientSubscriptions.get(client.id);
		if (subscription) {
			subscription.devices.clear();
			deviceIds.forEach(id => subscription.devices.add(id));
			
			this.logger.log(`Client ${client.id} subscribed to devices: ${deviceIds.join(', ')}`);
			
			client.emit('deviceSubscriptionConfirmed', { 
				subscribedTo: deviceIds,
				message: 'Device subscription confirmed' 
			});
		}
	}

	@SubscribeMessage('unsubscribeFromAll')
	handleUnsubscribeAll(client: Socket) {
		const subscription = this.clientSubscriptions.get(client.id);
		if (subscription) {
			subscription.heating.clear();
			subscription.temperatureSensors.clear();
			subscription.devices.clear();
			
			this.logger.log(`Client ${client.id} unsubscribed from all devices`);
			
			client.emit('unsubscribedFromAll', { message: 'Unsubscribed from all devices' });
		}
	}

	@SubscribeMessage('getSubscriptions')
	handleGetSubscriptions(client: Socket) {
		const subscription = this.clientSubscriptions.get(client.id);
		if (subscription) {
			client.emit('subscriptions', {
				heating: Array.from(subscription.heating),
				temperatureSensors: Array.from(subscription.temperatureSensors),
				devices: Array.from(subscription.devices),
			});
		}
	}

	@SubscribeMessage('getHeating')
	async handleGetHeating(client: Socket) {
		const subs = this.clientSubscriptions.get(client.id);
		if (!subs || subs.heating.size === 0) return;

		const list = Array.from(subs.heating).map(id => {
			const state = this.heatingService.getState(id);
			const config = heatingConfigs[id];
			return {
				heatingId: id,
				name: config?.deviceRealName || id,
				...state,
			};
		}).filter(item => item !== null);

		client.emit('heating', list);
	}

	@SubscribeMessage('getTemperatureSensors')
	handleGetTemperatureSensors(client: Socket) {
		const subs = this.clientSubscriptions.get(client.id);
		if (!subs || subs.temperatureSensors.size === 0) return;
		
		const list = Array.from(subs.temperatureSensors).map(id => ({
			sensorId: id,
			...this.temperatureSensorService.getSensorData(id),
		})).filter(item => item !== null);
		
		client.emit('temperatureSensors', list);
	}

	@SubscribeMessage('heating:command')
	async handleHeatingCommand(client: Socket, payload: HeatingCommand) {
		try {
			const { heatingId, command, value } = payload;
			this.logger.log(`Получена команда для системы отопления ${heatingId}: ${command} = ${value}`);

			switch (command) {
				case 'TURN_ON':
					this.heatingService.enableAutoControl(heatingId);
					break;
				case 'TURN_OFF':
					this.heatingService.disableAutoControl(heatingId);
					break;
				case 'SET_TEMPERATURE':
					if (typeof value === 'number') {
						this.heatingService.setTemperature(heatingId, value);
					}
					break;
				case 'SET_PUMP_SPEED':
					if (typeof value === 'number') {
						this.heatingService.setPumpSpeed(heatingId, value);
					}
					break;
				case 'SET_VALVE':
					if (value === 'OPEN') {
						this.heatingService.setValve(heatingId, 'open');
					} else if (value === 'CLOSE') {
						this.heatingService.setValve(heatingId, 'close');
					}
					break;
				case 'EMERGENCY_STOP':
					this.heatingService.emergencyStop(heatingId);
					break;
				default:
					this.logger.warn(`Неизвестная команда для системы отопления ${heatingId}: ${command}`);
					return;
			}

			// Отправляем подтверждение выполнения команды
			client.emit('heating:command:response', {
				heatingId,
				command,
				value,
				success: true,
				timestamp: new Date().toISOString(),
			});

			// Через короткую задержку отправляем обновление состояния
			setTimeout(() => this.sendHeatingUpdate(heatingId), 100);
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			this.logger.error(`Ошибка обработки команды для системы отопления: ${errorMessage}`);
			
			client.emit('heating:command:response', {
				heatingId: payload.heatingId,
				command: payload.command,
				success: false,
				error: errorMessage,
				timestamp: new Date().toISOString(),
			});
		}
	}

	@SubscribeMessage('getSystemStats')
	handleGetSystemStats(client: Socket) {
		const heatingStats = this.heatingService.getSystemStats();
		const sensorStats = this.temperatureSensorService.getAllSensorData();
		
		client.emit('systemStats', {
			heating: heatingStats,
			temperatureSensors: {
				total: Object.keys(sensorStats).length,
				online: Object.values(sensorStats).filter(data => 
					new Date().getTime() - data.timestamp.getTime() < 300000 // 5 минут
				).length,
			},
			websocket: this.getSubscriptionsStats(),
			timestamp: new Date().toISOString(),
		});
	}

	// Отправка обновлённого состояния конкретной системы отопления всем подписанным клиентам
	private sendHeatingUpdate(heatingId: string) {
		try {
			const state = this.heatingService.getState(heatingId);
			const config = heatingConfigs[heatingId];
			const data = {
				heatingId,
				name: config?.deviceRealName || heatingId,
				...state,
			};

			this.clientSubscriptions.forEach((subscription, clientId) => {
				if (subscription.heating.has(heatingId)) {
					const clientSocket = (this.server.sockets as any).get(clientId);
					clientSocket?.emit('heating:updated', data);
				}
			});
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			this.logger.error(`Ошибка отправки обновления системы отопления ${heatingId}: ${errorMessage}`);
		}
	}

	// Отправка обновлённых данных датчика температуры всем подписанным клиентам
	private sendTemperatureSensorUpdate(sensorId: string) {
		try {
			const data = this.temperatureSensorService.getSensorData(sensorId);
			if (!data) return;

			const sensorData = {
				sensorId,
				...data,
			};

			this.clientSubscriptions.forEach((subscription, clientId) => {
				if (subscription.temperatureSensors.has(sensorId)) {
					const clientSocket = (this.server.sockets as any).get(clientId);
					clientSocket?.emit('temperatureSensor:updated', sensorData);
				}
			});
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			this.logger.error(`Ошибка отправки обновления датчика температуры ${sensorId}: ${errorMessage}`);
		}
	}

	private handleDeviceUpdate(device: Device) {
		// Отправляем обновление только подписанным клиентам
		this.clientSubscriptions.forEach((subscription, clientId) => {
			if (subscription.devices.has(device.id)) {
				const client = (this.server.sockets as any).get(clientId);
				if (client) {
					client.emit('device:updated', device);
				}
			}
		});
	}

	// Метод для отправки сообщения конкретному клиенту
	sendToClient(clientId: string, event: string, data: unknown) {
		const client = (this.server.sockets as any).get(clientId);
		if (client) {
			client.emit(event, data);
		}
	}

	// Метод для получения статистики подписок
	getSubscriptionsStats() {
		const stats = {
			totalClients: this.clientSubscriptions.size,
			totalHeatingSubscriptions: 0,
			totalTemperatureSensorSubscriptions: 0,
			totalDeviceSubscriptions: 0,
		};

		this.clientSubscriptions.forEach(subscription => {
			stats.totalHeatingSubscriptions += subscription.heating.size;
			stats.totalTemperatureSensorSubscriptions += subscription.temperatureSensors.size;
			stats.totalDeviceSubscriptions += subscription.devices.size;
		});

		return stats;
	}
}
