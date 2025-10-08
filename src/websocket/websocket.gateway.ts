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
import { BatteriesState } from '../devices/interfaces/batteries.interface';
import { BatteriesService } from '../devices/batteries/batteries.service';

interface HeatingCommand {
	heatingId: string;
	command: 'TURN_ON' | 'TURN_OFF' | 'SET_TEMPERATURE' | 'SET_PUMP_SPEED' | 'SET_VALVE' | 'EMERGENCY_STOP';
	value?: string | number;
}

interface BatteriesCommand {
	deviceId: string;
	command: 'set_temperature' | 'enable_auto_control' | 'disable_auto_control' | 'set_group_valve' | 'emergency_stop' | 'reset_emergency_stop';
	temperature?: number;
	groupName?: string;
	open?: boolean;
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
		private readonly batteriesService: BatteriesService,
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

		// События системы батарей
		this.eventEmitter.on('batteries.temperature.updated', (data: { deviceId: string; temperature: number }) => {
			this.handleBatteriesTemperatureUpdate(data);
			this.handleBatteriesStateUpdate(data.deviceId);
		});
		this.eventEmitter.on('batteries.setpoint.changed', (data: { deviceId: string; temperature: number }) => {
			this.handleBatteriesSetpointUpdate(data);
			this.handleBatteriesStateUpdate(data.deviceId);
		});
		this.eventEmitter.on('batteries.valve.state.changed', (data: { deviceId: string; groupName: string; state: string }) => {
			this.handleBatteriesValveUpdate(data);
			this.handleBatteriesStateUpdate(data.deviceId);
		});
		this.eventEmitter.on('batteries.emergency.stop', (data: { deviceId: string }) => {
			this.handleBatteriesEmergencyStop(data);
			this.handleBatteriesStateUpdate(data.deviceId);
		});
		this.eventEmitter.on('batteries.emergency.stop.reset', (data: { deviceId: string }) => {
			this.handleBatteriesEmergencyStopReset(data);
			this.handleBatteriesStateUpdate(data.deviceId);
		});
		this.eventEmitter.on('batteries.auto.control.enabled', (data: { deviceId: string }) => {
			this.handleBatteriesAutoControlEnabled(data);
			this.handleBatteriesStateUpdate(data.deviceId);
		});
		this.eventEmitter.on('batteries.auto.control.disabled', (data: { deviceId: string }) => {
			this.handleBatteriesAutoControlDisabled(data);
			this.handleBatteriesStateUpdate(data.deviceId);
		});
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
						await this.heatingService.setTemperature(heatingId, Number(value));
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

	// Обработчики сообщений для батарей
	@SubscribeMessage('get-batteries-states')
	async handleGetBatteriesStates(client: Socket) {
		try {
			const states = this.batteriesService.getAllStates();
			client.emit('batteries-states', states);
		} catch (error) {
			this.logger.error(`Ошибка получения состояний батарей: ${error.message}`);
		}
	}

	@SubscribeMessage('get-batteries-configs')
	async handleGetBatteriesConfigs(client: Socket) {
		try {
			const configs = this.batteriesService.getAllConfigs();
			client.emit('batteries-configs', configs);
		} catch (error) {
			this.logger.error(`Ошибка получения конфигураций батарей: ${error.message}`);
		}
	}

	@SubscribeMessage('batteries-command')
	async handleBatteriesCommand(client: Socket, payload: BatteriesCommand) {
		try {
			const { deviceId, command, temperature, groupName, open } = payload;
			this.logger.log(`🔋 [MAIN] Получена команда для батарей ${deviceId}: ${command}`);

			switch (command) {
				case 'set_temperature':
					if (temperature !== undefined) {
						await this.batteriesService.setTemperature(deviceId, temperature);
					}
					break;
				case 'enable_auto_control':
					this.batteriesService.enableAutoControl(deviceId);
					break;
				case 'disable_auto_control':
					this.batteriesService.disableAutoControl(deviceId);
					break;
				case 'set_group_valve':
					if (groupName !== undefined && open !== undefined) {
						this.batteriesService.setGroupValveManually(deviceId, groupName, open);
					}
					break;
				case 'emergency_stop':
					this.batteriesService.emergencyStop(deviceId);
					break;
				case 'reset_emergency_stop':
					this.batteriesService.resetEmergencyStop(deviceId);
					break;
				default:
					this.logger.warn(`Неизвестная команда для батарей ${deviceId}: ${command}`);
			}

			// Отправляем подтверждение команды
			client.emit('batteries-command:success', {
				deviceId,
				command,
				timestamp: new Date().toISOString(),
			});
		} catch (error) {
			this.logger.error(`Ошибка обработки команды батарей: ${error.message}`);
			client.emit('batteries-command:error', {
				deviceId: payload.deviceId,
				command: payload.command,
				error: error.message,
				timestamp: new Date().toISOString(),
			});
		}
	}

	// Обработчики событий батарей
	private handleBatteriesTemperatureUpdate(data: { deviceId: string; temperature: number }) {
		this.server.emit('batteries-temperature-update', data);
	}

	private handleBatteriesSetpointUpdate(data: { deviceId: string; temperature: number }) {
		this.server.emit('batteries-setpoint-update', data);
	}

	private handleBatteriesValveUpdate(data: { deviceId: string; groupName: string; state: string }) {
		this.server.emit('batteries-valve-update', data);
	}

	private handleBatteriesEmergencyStop(data: { deviceId: string }) {
		this.server.emit('batteries-emergency-stop', data);
	}

	private handleBatteriesEmergencyStopReset(data: { deviceId: string }) {
		this.server.emit('batteries-emergency-stop-reset', data);
	}

	private handleBatteriesAutoControlEnabled(data: { deviceId: string }) {
		this.server.emit('batteries-auto-control-enabled', data);
	}

	private handleBatteriesAutoControlDisabled(data: { deviceId: string }) {
		this.server.emit('batteries-auto-control-disabled', data);
	}

	private handleBatteriesStateUpdate(deviceId: string) {
		const state = this.batteriesService.getState(deviceId);
		if (state) {
			this.server.emit('batteries-state-update', { deviceId, state });
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
