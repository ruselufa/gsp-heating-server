import {
	WebSocketGateway,
	WebSocketServer,
	OnGatewayInit,
	OnGatewayConnection,
	OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Device } from '../devices/interfaces/device.interface';
import { Logger } from '@nestjs/common';
import { HeatingState } from '../devices/interfaces/heating.interface';
import { TemperatureSensorData } from '../devices/interfaces/temperature-sensor.interface';

@WebSocketGateway({
	cors: {
		origin: '*', // В продакшене заменить на конкретный домен
	},
})
export class WebsocketGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
	@WebSocketServer()
	server: Server;

	private readonly logger = new Logger(WebsocketGateway.name);
	private connectedClients: Set<Socket> = new Set();

	constructor(private readonly eventEmitter: EventEmitter2) {
		// Подписываемся на события обновления устройств отопления
		this.eventEmitter.on('device.updated', (device: Device) => this.handleDeviceUpdate(device));
		
		// События системы отопления
		this.eventEmitter.on('heating.temperature.updated', (data: { heatingId: string; temperature: number }) =>
			this.handleHeatingTemperatureUpdate(data),
		);
		this.eventEmitter.on('heating.setpoint.changed', (data: { heatingId: string; temperature: number }) =>
			this.handleHeatingSetpointUpdate(data),
		);
		this.eventEmitter.on('heating.pump.speed.changed', (data: { heatingId: string; speed: number }) =>
			this.handleHeatingPumpSpeedUpdate(data),
		);
		this.eventEmitter.on('heating.valve.state.changed', (data: { heatingId: string; action: string; state: string }) =>
			this.handleHeatingValveUpdate(data),
		);
		this.eventEmitter.on('heating.alarm', (data: { heatingId: string; isAlarm: boolean }) =>
			this.handleHeatingAlarm(data),
		);
		this.eventEmitter.on('heating.emergency.stop', (data: { heatingId: string }) =>
			this.handleHeatingEmergencyStop(data),
		);
		this.eventEmitter.on('heating.auto.control.enabled', (data: { heatingId: string }) =>
			this.handleHeatingAutoControlEnabled(data),
		);
		this.eventEmitter.on('heating.auto.control.disabled', (data: { heatingId: string }) =>
			this.handleHeatingAutoControlDisabled(data),
		);

		// События датчиков температуры
		this.eventEmitter.on('temperature.sensor.updated', (data: { sensorId: string; data: TemperatureSensorData }) =>
			this.handleTemperatureSensorUpdate(data),
		);
	}

	afterInit() {
		this.logger.log('WebSocket Gateway для системы отопления инициализирован');
	}

	handleConnection(client: Socket) {
		this.logger.log(`Client connected: ${client.id}`);
		this.connectedClients.add(client);
		
		// Отправляем приветственное сообщение
		client.emit('connected', {
			message: 'Connected to Heating System WebSocket',
			clientId: client.id,
			timestamp: new Date().toISOString(),
		});
	}

	handleDisconnect(client: Socket) {
		this.logger.log(`Client disconnected: ${client.id}`);
		this.connectedClients.delete(client);
	}

	private handleDeviceUpdate(device: Device) {
		// Отправляем обновление всем подключенным клиентам
		this.server.emit('device:updated', device);
	}

	private handleHeatingTemperatureUpdate(data: { heatingId: string; temperature: number }) {
		// Отправляем обновление температуры отопления всем подключенным клиентам
		this.server.emit('heating:temperature:updated', {
			heatingId: data.heatingId,
			temperature: data.temperature,
			timestamp: new Date().toISOString(),
		});
	}

	private handleHeatingSetpointUpdate(data: { heatingId: string; temperature: number }) {
		// Отправляем обновление уставки температуры
		this.server.emit('heating:setpoint:changed', {
			heatingId: data.heatingId,
			setpoint: data.temperature,
			timestamp: new Date().toISOString(),
		});
	}

	private handleHeatingPumpSpeedUpdate(data: { heatingId: string; speed: number }) {
		// Отправляем обновление скорости насоса
		this.server.emit('heating:pump:speed:changed', {
			heatingId: data.heatingId,
			speed: data.speed,
			timestamp: new Date().toISOString(),
		});
	}

	private handleHeatingValveUpdate(data: { heatingId: string; action: string; state: string }) {
		// Отправляем обновление состояния клапана
		this.server.emit('heating:valve:state:changed', {
			heatingId: data.heatingId,
			action: data.action,
			state: data.state,
			timestamp: new Date().toISOString(),
		});
	}

	private handleHeatingAlarm(data: { heatingId: string; isAlarm: boolean }) {
		// Отправляем аварийное сообщение
		this.server.emit('heating:alarm', {
			heatingId: data.heatingId,
			isAlarm: data.isAlarm,
			severity: 'high',
			timestamp: new Date().toISOString(),
		});
	}

	private handleHeatingEmergencyStop(data: { heatingId: string }) {
		// Отправляем сообщение об аварийной остановке
		this.server.emit('heating:emergency:stop', {
			heatingId: data.heatingId,
			severity: 'critical',
			timestamp: new Date().toISOString(),
		});
	}

	private handleHeatingAutoControlEnabled(data: { heatingId: string }) {
		// Отправляем сообщение о включении автоматического управления
		this.server.emit('heating:auto:control:enabled', {
			heatingId: data.heatingId,
			timestamp: new Date().toISOString(),
		});
	}

	private handleHeatingAutoControlDisabled(data: { heatingId: string }) {
		// Отправляем сообщение об отключении автоматического управления
		this.server.emit('heating:auto:control:disabled', {
			heatingId: data.heatingId,
			timestamp: new Date().toISOString(),
		});
	}

	private handleTemperatureSensorUpdate(data: { sensorId: string; data: TemperatureSensorData }) {
		// Отправляем обновление данных датчика температуры
		this.server.emit('temperature:sensor:updated', {
			sensorId: data.sensorId,
			temperature: data.data.temperature,
			humidity: data.data.humidity,
			pressure: data.data.pressure,
			timestamp: data.data.timestamp,
		});
	}

	// Метод для отправки сообщения конкретному клиенту
	sendToClient(clientId: string, event: string, data: unknown) {
		this.server.to(clientId).emit(event, data);
	}

	// Метод для отправки сообщения всем клиентам
	broadcast(event: string, data: unknown) {
		this.server.emit(event, data);
	}

	// Метод для получения статистики подключений
	getConnectionStats() {
		return {
			connectedClients: this.connectedClients.size,
			timestamp: new Date().toISOString(),
		};
	}
}
