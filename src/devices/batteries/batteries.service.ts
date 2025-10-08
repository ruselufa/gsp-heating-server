import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MqttService } from '../../mqtt/mqtt.service';
import { DatabaseService } from '../../database/database.service';
import { batteriesConfigs } from './batteries.config';
import { BatteriesState, BatteriesGroup } from '../interfaces/batteries.interface';

interface BatteriesInternalState extends BatteriesState {
	autoControlEnabled: boolean;
	lastTemperatureUpdate: number;
	valveOperationTimers: Record<string, NodeJS.Timeout>; // Таймеры для операций с клапанами по группам
}

@Injectable()
export class BatteriesService implements OnModuleInit {
	private readonly logger = new Logger(BatteriesService.name);
	private states: Record<string, BatteriesInternalState> = {};
	private controlIntervals: Record<string, NodeJS.Timeout> = {};
	private isDestroyed = false;

	constructor(
		private readonly mqttService: MqttService,
		private readonly eventEmitter: EventEmitter2,
		private readonly databaseService: DatabaseService,
	) {
		this.isDestroyed = false;
		// Инициализация состояний для каждого устройства батарей
		Object.keys(batteriesConfigs).forEach((deviceId) => {
			const config = batteriesConfigs[deviceId];
			this.states[deviceId] = {
				valveStates: {},
				currentTemperature: 0,
				setpointTemperature: 20,
				isEmergencyStop: false,
				isWorking: false,
				isOnline: false,
				autoControlEnabled: false,
				lastTemperatureUpdate: Date.now(),
				valveOperationTimers: {},
				lastValveOperation: {},
			};

			// Инициализируем состояния клапанов для каждой группы
			config.groups.forEach(group => {
				this.states[deviceId].valveStates[group.groupName] = 'closed';
			});
		});
	}

	async onModuleInit() {
		this.logger.log('Batteries Service initialized');
		
		// Загружаем уставки из базы данных
		await this.loadSettingsFromDatabase();

		// Обработчик MQTT сообщений для брокера sensors
		this.eventEmitter.on('mqtt.sensors.message', (data: { topic: string; message: any }) => {
			this.logger.log(`🔋 Получено MQTT сообщение: ${data.topic}, ${data.message}`);

			// Ищем устройство батарей, которому соответствует топик
			for (const [deviceId, config] of Object.entries(batteriesConfigs)) {
				// Проверяем все датчики температуры для этого устройства
				for (const [address, sensorPath] of Object.entries(config.topics.TEMPERATURE_SENSORS)) {
					if (data.topic === sensorPath) {
						const temperature = parseFloat(String(data.message));
						if (!isNaN(temperature)) {
							this.updateTemperature(deviceId, temperature);
						} else {
							this.logger.warn(`❌ Invalid temperature data for ${deviceId} sensor ${address}: ${data.message}`);
						}
						return; // Найден соответствующий датчик, выходим из цикла
					}
				}
			}
		});

		// Подписка на события подключения к брокерам
		this.eventEmitter.on('mqtt.sensors.connected', () => {
			this.logger.log('🔌 Подключились к брокеру датчиков');
			this.setupMqttSubscriptions();
		});

		this.eventEmitter.on('mqtt.heating.connected', () => {
			this.logger.log('🔌 Подключились к брокеру отопления');
		});

		// Инициализируем состояние для каждого устройства батарей
		Object.entries(batteriesConfigs).forEach(([deviceId, config]) => {
			this.logger.log(`Initializing batteries device: ${deviceId}`);

			// Запускаем контроль каждую секунду
			this.controlIntervals[deviceId] = setInterval(() => {
				if (this.states[deviceId]?.autoControlEnabled && !this.states[deviceId]?.isEmergencyStop) {
					this.runHysteresisControl(deviceId);
				}
			}, 1000);

			// Подписка на события подключения/отключения для каждого устройства
			this.eventEmitter.on(`mqtt.sensors.connected`, () => {
				this.states[deviceId].isOnline = true;
				this.eventEmitter.emit('batteries.update', deviceId);
			});
			this.eventEmitter.on(`mqtt.sensors.error`, () => {
				this.states[deviceId].isOnline = false;
				this.eventEmitter.emit('batteries.update', deviceId);
			});
			this.eventEmitter.on(`mqtt.sensors.offline`, () => {
				this.states[deviceId].isOnline = false;
				this.eventEmitter.emit('batteries.update', deviceId);
			});
		});

		// Начальная настройка подписок
		await this.setupMqttSubscriptions();
	}

	private async setupMqttSubscriptions() {
		this.logger.log('🔧 Setting up MQTT subscriptions for batteries...');
		
		await Promise.all(
			Object.entries(batteriesConfigs).map(async ([deviceId, config]) => {
				try {
					// Подписываемся на все датчики температуры для этого устройства
					Object.entries(config.topics.TEMPERATURE_SENSORS).forEach(([address, sensorPath]) => {
						this.logger.log(`🌡️ Subscribing ${deviceId} to temperature sensor address ${address}: ${sensorPath}`);
						this.mqttService.subscribe('sensors', sensorPath);
					});
				} catch (err: unknown) {
					const error = err as Error;
					this.logger.error(`Ошибка подписки на топики батарей ${deviceId}: ${error.message}`);
				}
			}),
		);
	}

	private updateTemperature(deviceId: string, temperature: number) {
		if (this.states[deviceId]) {
			this.states[deviceId].currentTemperature = temperature;
			this.states[deviceId].isOnline = true;
			this.states[deviceId].lastTemperatureUpdate = Date.now();
			this.logger.log(`📊 Batteries ${deviceId} temperature updated: ${temperature}°C`);
			
			// Эмитируем событие обновления температуры
			this.eventEmitter.emit('batteries.temperature.updated', {
				deviceId,
				temperature,
			});
		}
	}

	private runHysteresisControl(deviceId: string) {
		const state = this.states[deviceId];
		const config = batteriesConfigs[deviceId];
		
		if (!state || !config) return;

		const { currentTemperature, setpointTemperature } = state;
		const { HYSTERESIS } = config.temperatureSettings;

		// Вычисляем разность температур
		const temperatureDiff = setpointTemperature - currentTemperature;
		
		this.logger.debug(`Hysteresis Control ${deviceId}: current=${currentTemperature.toFixed(2)}°C, setpoint=${setpointTemperature}°C, diff=${temperatureDiff.toFixed(2)}°C`);

		// Управление клапанами по гистерезису для каждой группы
		config.groups.forEach(group => {
			const currentValveState = state.valveStates[group.groupName];
			let shouldOpen = false;

			// Логика гистерезиса
			if (temperatureDiff > HYSTERESIS) {
				// Температура ниже уставки на величину больше гистерезиса - открываем клапан
				shouldOpen = true;
			} else if (temperatureDiff < -HYSTERESIS) {
				// Температура выше уставки на величину больше гистерезиса - закрываем клапан
				shouldOpen = false;
			} else {
				// В зоне гистерезиса - оставляем текущее состояние
				shouldOpen = currentValveState === 'open';
			}

			// Управляем клапаном только если состояние изменилось
			if ((shouldOpen && currentValveState !== 'open') || (!shouldOpen && currentValveState !== 'closed')) {
				this.setGroupValve(deviceId, group.groupName, shouldOpen);
			}
		});

		// Определяем общее состояние работы устройства
		const hasOpenValves = Object.values(state.valveStates).some(valveState => valveState === 'open');
		state.isWorking = hasOpenValves;

		this.logger.debug(`Hysteresis Control ${deviceId}: isWorking=${state.isWorking}, valveStates=`, state.valveStates);
	}

	private setGroupValve(deviceId: string, groupName: string, open: boolean) {
		const state = this.states[deviceId];
		const config = batteriesConfigs[deviceId];
		
		if (!state || !config) return;

		const group = config.groups.find(g => g.groupName === groupName);
		if (!group) return;

		const newState = open ? 'open' : 'closed';
		
		// Если состояние не изменилось, не отправляем команду
		if (state.valveStates[groupName] === newState) return;

		// Отправляем команды на все реле группы
		group.relays.forEach(relay => {
			const relayModulePath = config.topics.RELAY_MODULES[group.relayModuleAddress];
			if (!relayModulePath) {
				this.logger.error(`🔋 VALVE: Relay module path not found for address ${group.relayModuleAddress}`);
				return;
			}
			
			const topic = `${relayModulePath}/${relay}`;
			const relayValue = open ? 0 : 1; // 0 - открыть клапан, 1 - закрыть клапан
			
			this.logger.log(`🔋 VALVE: Sending valve command for ${deviceId} group ${groupName}: topic="${topic}/on", value=${relayValue}`);
			this.mqttService.publish(config.broker, `${topic}/on`, relayValue, {
				retain: false,
			});
		});

		// Обновляем состояние
		state.valveStates[groupName] = newState;
		if (!state.lastValveOperation) {
			state.lastValveOperation = {};
		}
		state.lastValveOperation[groupName] = new Date();

		// Запускаем таймер для автоматического закрытия клапана через заданное время
		if (open) {
			// Очищаем предыдущий таймер если есть
			if (state.valveOperationTimers[groupName]) {
				clearTimeout(state.valveOperationTimers[groupName]);
			}

			// Устанавливаем таймер на автоматическое закрытие
			state.valveOperationTimers[groupName] = setTimeout(() => {
				this.logger.log(`🔋 AUTO-CLOSE: Auto-closing valve for ${deviceId} group ${groupName} after ${config.temperatureSettings.VALVE_OPERATION_TIME}s`);
				this.setGroupValve(deviceId, groupName, false);
			}, config.temperatureSettings.VALVE_OPERATION_TIME * 1000);
		} else {
			// Очищаем таймер при закрытии клапана
			if (state.valveOperationTimers[groupName]) {
				clearTimeout(state.valveOperationTimers[groupName]);
				delete state.valveOperationTimers[groupName];
			}
		}

		this.logger.debug(`Valve ${deviceId} group ${groupName} set to: ${newState}`);
		
		// Эмитируем событие изменения состояния клапана
		this.eventEmitter.emit('batteries.valve.state.changed', {
			deviceId,
			groupName,
			state: newState,
		});
	}

	// Загрузка настроек из базы данных
	private async loadSettingsFromDatabase() {
		this.logger.log('Загружаем настройки батарей из базы данных...');
		
		for (const deviceId of Object.keys(this.states)) {
			try {
				const setpointStr = await this.databaseService.getHeatingSetting(deviceId, 'setpoint_temperature');
				if (setpointStr) {
					const setpoint = parseFloat(setpointStr);
					if (!isNaN(setpoint)) {
						this.states[deviceId].setpointTemperature = setpoint;
						this.logger.log(`Загружена уставка для ${deviceId}: ${setpoint}°C`);
					}
				}
			} catch (error) {
				this.logger.error(`Ошибка загрузки настроек для ${deviceId}:`, error);
			}
		}
	}

	// Публичные методы для управления

	async setTemperature(deviceId: string, temperature: number) {
		const state = this.states[deviceId];
		
		if (!state) return;

		// Проверяем допустимые пределы температуры
		if (temperature < 5 || temperature > 35) {
			this.logger.warn(`Invalid temperature setpoint for batteries ${deviceId}: ${temperature}°C`);
			return;
		}

		state.setpointTemperature = temperature;

		// Сохраняем уставку в базу данных
		try {
			await this.databaseService.setHeatingSetting(deviceId, 'setpoint_temperature', temperature.toString());
			this.logger.log(`Batteries ${deviceId} setpoint temperature set to: ${temperature}°C and saved to database`);
		} catch (error) {
			this.logger.error(`Failed to save temperature setpoint to database for ${deviceId}:`, error);
		}
		
		// Эмитируем событие изменения уставки температуры
		this.eventEmitter.emit('batteries.setpoint.changed', {
			deviceId,
			temperature,
		});
	}

	enableAutoControl(deviceId: string) {
		const state = this.states[deviceId];
		if (!state) return;

		state.autoControlEnabled = true;
		state.isEmergencyStop = false;

		this.logger.log(`Auto control enabled for batteries ${deviceId}`);
		
		// Эмитируем событие включения автоматического управления
		this.eventEmitter.emit('batteries.auto.control.enabled', {
			deviceId,
		});
	}

	disableAutoControl(deviceId: string) {
		const state = this.states[deviceId];
		const config = batteriesConfigs[deviceId];
		
		if (!state || !config) return;

		state.autoControlEnabled = false;
		state.isWorking = false;
		
		// Закрываем все клапаны
		config.groups.forEach(group => {
			this.setGroupValve(deviceId, group.groupName, false);
		});

		this.logger.log(`Auto control disabled for batteries ${deviceId}`);
		
		// Эмитируем событие отключения автоматического управления
		this.eventEmitter.emit('batteries.auto.control.disabled', {
			deviceId,
		});
	}

	emergencyStop(deviceId: string) {
		const state = this.states[deviceId];
		const config = batteriesConfigs[deviceId];
		
		if (!state || !config) return;

		state.isEmergencyStop = true;
		state.autoControlEnabled = false;
		state.isWorking = false;
		
		// Закрываем все клапаны
		config.groups.forEach(group => {
			this.setGroupValve(deviceId, group.groupName, false);
		});

		this.logger.warn(`Emergency stop activated for batteries ${deviceId}`);
		
		// Эмитируем событие аварийной остановки
		this.eventEmitter.emit('batteries.emergency.stop', {
			deviceId,
		});
	}

	resetEmergencyStop(deviceId: string) {
		const state = this.states[deviceId];
		if (!state) return;

		state.isEmergencyStop = false;
		this.logger.log(`Emergency stop reset for batteries ${deviceId}`);
		
		// Эмитируем событие сброса аварийной остановки
		this.eventEmitter.emit('batteries.emergency.stop.reset', {
			deviceId,
		});
	}

	// Ручное управление клапаном группы
	setGroupValveManually(deviceId: string, groupName: string, open: boolean) {
		const state = this.states[deviceId];
		if (!state) return;

		// Временно отключаем автоматическое управление для этой группы
		// (можно расширить логику для управления отдельными группами)
		this.setGroupValve(deviceId, groupName, open);
		
		this.logger.log(`Manual valve control for ${deviceId} group ${groupName}: ${open ? 'OPEN' : 'CLOSED'}`);
	}

	// Методы для получения состояния

	getState(deviceId: string): BatteriesState | null {
		const state = this.states[deviceId];
		if (!state) return null;

		// Возвращаем копию состояния без внутренних полей
		return {
			valveStates: { ...state.valveStates },
			currentTemperature: state.currentTemperature,
			setpointTemperature: state.setpointTemperature,
			isEmergencyStop: state.isEmergencyStop,
			isWorking: state.isWorking,
			isOnline: state.isOnline,
			autoControlEnabled: state.autoControlEnabled,
			lastError: state.lastError,
			lastValveOperation: { ...state.lastValveOperation },
		};
	}

	getAllStates(): Record<string, BatteriesState> {
		const result: Record<string, BatteriesState> = {};
		Object.keys(this.states).forEach(key => {
			const state = this.getState(key);
			if (state) {
				result[key] = state;
			}
		});
		return result;
	}

	getConfig(deviceId: string) {
		return batteriesConfigs[deviceId] || null;
	}

	getAllConfigs() {
		return batteriesConfigs;
	}

	// Метод для получения статистики системы
	getSystemStats() {
		const stats = {
			totalDevices: Object.keys(this.states).length,
			onlineDevices: 0,
			workingDevices: 0,
			emergencyStopDevices: 0,
			autoControlEnabledDevices: 0,
			averageTemperature: 0,
			averageSetpoint: 0,
			totalGroups: 0,
			openValves: 0,
		};

		let tempSum = 0;
		let setpointSum = 0;

		Object.entries(this.states).forEach(([deviceId, state]) => {
			if (state.isOnline) stats.onlineDevices++;
			if (state.isWorking) stats.workingDevices++;
			if (state.isEmergencyStop) stats.emergencyStopDevices++;
			if (state.autoControlEnabled) stats.autoControlEnabledDevices++;
			
			tempSum += state.currentTemperature;
			setpointSum += state.setpointTemperature;

			const config = batteriesConfigs[deviceId];
			if (config) {
				stats.totalGroups += config.groups.length;
				Object.values(state.valveStates).forEach(valveState => {
					if (valveState === 'open') stats.openValves++;
				});
			}
		});

		if (stats.totalDevices > 0) {
			stats.averageTemperature = tempSum / stats.totalDevices;
			stats.averageSetpoint = setpointSum / stats.totalDevices;
		}

		return stats;
	}

	// Очистка ресурсов при завершении работы модуля
	onModuleDestroy() {
		this.isDestroyed = true;
		Object.values(this.controlIntervals).forEach(interval => {
			clearInterval(interval);
		});
		
		// Очищаем все таймеры клапанов
		Object.values(this.states).forEach(state => {
			Object.values(state.valveOperationTimers).forEach(timer => {
				clearTimeout(timer);
			});
		});
		
		this.logger.log('Batteries service destroyed');
	}

	// Тестовый метод для прямой отправки MQTT команд
	testMqttCommand(deviceId: string, groupName: string, relay: string, value: number) {
		const config = batteriesConfigs[deviceId];
		if (!config) return;

		const group = config.groups.find(g => g.groupName === groupName);
		if (!group) {
			this.logger.error(`🧪 TEST: Group ${groupName} not found for device ${deviceId}`);
			return;
		}

		const relayModulePath = config.topics.RELAY_MODULES[group.relayModuleAddress];
		if (!relayModulePath) {
			this.logger.error(`🧪 TEST: Relay module path not found for address ${group.relayModuleAddress}`);
			return;
		}

		const topic = `${relayModulePath}/${relay}`;
		this.logger.log(`🧪 TEST: Sending MQTT command to ${deviceId} group ${groupName}: topic: ${topic}/on, value: ${value}`);
		this.mqttService.publish(config.broker, `${topic}/on`, value, {
			retain: false,
		});
	}
}
