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
import { HeatingState } from '../devices/interfaces/heating.interface';
import { HeatingService } from '../devices/heating/heating.service';

interface HeatingCommand {
	heatingId: string;
	command: 'TURN_ON' | 'TURN_OFF' | 'SET_TEMPERATURE' | 'SET_PUMP_SPEED' | 'SET_VALVE' | 'EMERGENCY_STOP';
	value?: string | number;
}

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

	constructor(
		private readonly eventEmitter: EventEmitter2,
		private readonly heatingService: HeatingService,
	) {
		// Подписываемся на события обновления устройств отопления
		this.eventEmitter.on('device.updated', (device: Device) => this.handleDeviceUpdate(device));
		
		// События системы отопления
		this.eventEmitter.on('heating.temperature.updated', (data: { heatingId: string; temperature: number }) => {
			this.handleHeatingTemperatureUpdate(data);
			this.handleHeatingStateUpdate(data.heatingId);
		});
		this.eventEmitter.on('heating.setpoint.changed', (data: { heatingId: string; temperature: number }) => {
			this.handleHeatingSetpointUpdate(data);
			this.handleHeatingStateUpdate(data.heatingId);
		});
		this.eventEmitter.on('heating.valve.state.changed', (data: { heatingId: string; action: string; state: string }) => {
			this.handleHeatingValveUpdate(data);
			this.handleHeatingStateUpdate(data.heatingId);
		});
		this.eventEmitter.on('heating.emergency.stop', (data: { heatingId: string }) => {
			this.handleHeatingEmergencyStop(data);
			this.handleHeatingStateUpdate(data.heatingId);
		});
		this.eventEmitter.on('heating.emergency.stop.reset', (data: { heatingId: string }) => {
			this.handleHeatingEmergencyStopReset(data);
			this.handleHeatingStateUpdate(data.heatingId);
		});
		this.eventEmitter.on('heating.auto.control.enabled', (data: { heatingId: string }) => {
			this.handleHeatingAutoControlEnabled(data);
			this.handleHeatingStateUpdate(data.heatingId);
		});
		this.eventEmitter.on('heating.auto.control.disabled', (data: { heatingId: string }) => {
			this.handleHeatingAutoControlDisabled(data);
			this.handleHeatingStateUpdate(data.heatingId);
		});
		this.eventEmitter.on('heating.pid.updated', (data: { heatingId: string; error: number; output: number }) =>
			this.handleHeatingPIDUpdate(data),
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

		// Отправляем полные данные отопления при подключении
		this.sendHeatingDataToClient(client);
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

	private handleHeatingStateUpdate(heatingId: string) {
		try {
			const state = this.heatingService.getState(heatingId);
			if (state) {
				const heatingData = {
					heatingId,
					...state
				};
				
				this.logger.log(`Отправляем обновление состояния отопления ${heatingId}`);
				this.server.emit('heating:updated', heatingData);
			}
		} catch (error) {
			this.logger.error(`Ошибка отправки обновления состояния: ${error.message}`);
		}
	}

	private handleHeatingSetpointUpdate(data: { heatingId: string; temperature: number }) {
		// Отправляем обновление уставки температуры
		this.server.emit('heating:setpoint:changed', {
			heatingId: data.heatingId,
			setpoint: data.temperature,
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

	private handleHeatingPIDUpdate(data: { heatingId: string; error: number; output: number }) {
		// Отправляем обновление PID регулятора
		this.server.emit('heating:pid:updated', {
			heatingId: data.heatingId,
			error: data.error,
			output: data.output,
			timestamp: new Date().toISOString(),
		});
	}

	private handleHeatingEmergencyStopReset(data: { heatingId: string }) {
		// Отправляем сообщение о сбросе аварийной остановки
		this.server.emit('heating:emergency:stop:reset', {
			heatingId: data.heatingId,
			timestamp: new Date().toISOString(),
		});
	}

	// Метод для отправки полных данных отопления клиенту
	private sendHeatingDataToClient(client: Socket) {
		try {
			const heatingStates = this.heatingService.getAllStates();
			const heatingArray = Object.entries(heatingStates).map(([heatingId, state]) => ({
				heatingId,
				...state
			}));
			
			this.logger.log(`Отправляем данные отопления клиенту ${client.id}: ${heatingArray.length} устройств`);
			client.emit('heating', heatingArray);
		} catch (error) {
			this.logger.error(`Ошибка отправки данных отопления: ${error.message}`);
		}
	}

	// Метод для отправки сообщения конкретному клиенту
	sendToClient(clientId: string, event: string, data: unknown) {
		this.server.to(clientId).emit(event, data);
	}

	// Метод для отправки сообщения всем клиентам
	broadcast(event: string, data: unknown) {
		this.server.emit(event, data);
	}

	// Обработчик запроса данных отопления
	@SubscribeMessage('getHeating')
	async handleGetHeating(client: Socket) {
		this.logger.log(`Клиент ${client.id} запросил данные отопления`);
		this.sendHeatingDataToClient(client);
	}

	// Обработчик команд отопления
	@SubscribeMessage('heating:command')
	async handleHeatingCommand(client: Socket, payload: HeatingCommand) {
		try {
			const { heatingId, command, value } = payload;
			this.logger.log(`🔥 [MAIN] Получена команда для системы отопления ${heatingId}: ${command} = ${value}`);

			switch (command) {
				case 'TURN_ON':
					this.heatingService.enableAutoControl(heatingId);
					break;
				case 'TURN_OFF':
					this.heatingService.disableAutoControl(heatingId);
					break;
				case 'SET_TEMPERATURE':
					if (value !== undefined) {
						this.heatingService.setTemperature(heatingId, Number(value));
					}
					break;
				case 'SET_PUMP_SPEED':
					if (value !== undefined) {
						this.heatingService.setFanSpeed(heatingId, Number(value));
					}
					break;
				case 'SET_VALVE':
					// Управление клапаном отключено - используется сезонная логика
					this.logger.log(`Команда SET_VALVE для ${heatingId} проигнорирована (сезонная логика)`);
					break;
				case 'EMERGENCY_STOP':
					this.heatingService.emergencyStop(heatingId);
					break;
				default:
					this.logger.warn(`Неизвестная команда: ${command}`);
			}

			// Отправляем подтверждение команды
			client.emit('heating:command:success', {
				heatingId,
				command,
				value,
				timestamp: new Date().toISOString(),
			});
		} catch (error) {
			this.logger.error(`Ошибка обработки команды отопления: ${error.message}`);
			client.emit('heating:command:error', {
				heatingId: payload.heatingId,
				command: payload.command,
				error: error.message,
				timestamp: new Date().toISOString(),
			});
		}
	}

	// Метод для получения статистики подключений
	getConnectionStats() {
		return {
			connectedClients: this.connectedClients.size,
			timestamp: new Date().toISOString(),
		};
	}
}
