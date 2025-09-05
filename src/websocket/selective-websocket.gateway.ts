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
import { heatingConfigs } from '../devices/heating/heating.config';

interface ClientSubscription {
	clientId: string;
	heating: Set<string>;
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

		// События PID регулятора
		this.eventEmitter.on('heating.pid.updated', (data: { heatingId: string; error: number; output: number }) =>
			this.sendHeatingUpdate(data.heatingId),
		);
		
		// События сброса аварийной остановки
		this.eventEmitter.on('heating.emergency.stop.reset', (data: { heatingId: string }) =>
			this.sendHeatingUpdate(data.heatingId),
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
				if (!state || !config) return null;
				return {
					heatingId: id,
					name: config.deviceRealName || id,
					...state,
				};
			}).filter(item => item !== null);
			
			client.emit('heating', list);
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
						this.heatingService.setFanSpeed(heatingId, value);
					}
					break;
				case 'SET_VALVE':
					// Управление клапаном отключено - используется сезонная логика
					this.logger.warn(`Manual valve control disabled for ${heatingId} - using seasonal logic`);
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
		
		client.emit('systemStats', {
			heating: heatingStats,
			websocket: this.getSubscriptionsStats(),
			timestamp: new Date().toISOString(),
		});
	}

	// Отправка обновлённого состояния конкретной системы отопления всем подписанным клиентам
	private sendHeatingUpdate(heatingId: string) {
		try {
			const state = this.heatingService.getState(heatingId);
			const config = heatingConfigs[heatingId];
			if (!state || !config) return;
			
			const data = {
				heatingId,
				name: config.deviceRealName || heatingId,
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
			totalDeviceSubscriptions: 0,
		};

		this.clientSubscriptions.forEach(subscription => {
			stats.totalHeatingSubscriptions += subscription.heating.size;
			stats.totalDeviceSubscriptions += subscription.devices.size;
		});

		return stats;
	}
}
