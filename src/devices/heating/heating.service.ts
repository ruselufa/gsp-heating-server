import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MqttService } from '../../mqtt/mqtt.service';
import { TemperatureSensorService } from '../temperature-sensor/temperature-sensor.service';
import { heatingConfigs } from './heating.config';
import { HeatingState } from '../interfaces/heating.interface';

interface HeatingQueueState extends HeatingState {
	pumpSpeedQueue: number[];
	valveQueue: ('open' | 'close')[];
	autoControlEnabled: boolean;
	lastAutoSpeed: number;
	lastAutoValve: 'open' | 'closed';
	isWorking: boolean;
	isStarting: boolean;
	isStandingBy: boolean;
	isOnline: boolean;
}

@Injectable()
export class HeatingService implements OnModuleInit {
	private readonly logger = new Logger(HeatingService.name);
	private states: Record<string, HeatingQueueState> = {};
	private autoControlIntervals: Record<string, NodeJS.Timeout> = {};

	private isDestroyed = false;

	constructor(
		private readonly mqttService: MqttService,
		private readonly temperatureSensorService: TemperatureSensorService,
		private readonly eventEmitter: EventEmitter2,
	) {
		this.isDestroyed = false;
		// Инициализация состояний для каждого отопительного контура
		Object.keys(heatingConfigs).forEach((heatingId) => {
			this.states[heatingId] = {
				currentPumpSpeed: 0,
				isSpeedChanging: false,
				valveState: 'closed',
				currentTemperature: 0,
				setpointTemperature: 20,
				isSetpointChanging: false,
				lastSetpointChange: 0,
				isEmergencyStop: false,
				isAlarm: false,
				pumpSpeedQueue: [],
				valveQueue: [],
				autoControlEnabled: false,
				lastAutoSpeed: 0,
				lastAutoValve: 'closed',
				isWorking: false,
				isStarting: false,
				isStandingBy: false,
				isOnline: false,
			};
		});
	}

	async onModuleInit() {
		// Подписываемся на MQTT топики для каждого отопительного контура
		Object.entries(heatingConfigs).forEach(([heatingId, config]) => {
			this.logger.log(`Initializing heating system: ${heatingId}`);

			// Подписываемся на текущую температуру
			this.mqttService.subscribe(config.topics.HEATING_CURR_TEMP, (topic, message) => {
				const temperature = parseFloat(message.toString());
				if (!isNaN(temperature)) {
					this.updateTemperature(heatingId, temperature);
				}
			});

			// Подписываемся на аварийные сигналы
			this.mqttService.subscribe(config.topics.ALARM, (topic, message) => {
				const alarm = message.toString() === '1';
				this.updateAlarmState(heatingId, alarm);
			});

			// Запускаем автоматический контроль каждые 30 секунд
			this.autoControlIntervals[heatingId] = setInterval(() => {
				if (this.states[heatingId]?.autoControlEnabled) {
					this.checkAutoControl(heatingId);
				}
			}, 30000);
		});
	}

	private updateTemperature(heatingId: string, temperature: number) {
		if (this.states[heatingId]) {
			this.states[heatingId].currentTemperature = temperature;
			this.states[heatingId].isOnline = true;
			this.logger.debug(`Heating ${heatingId} temperature updated: ${temperature}°C`);
			
			// Эмитируем событие обновления температуры
			this.eventEmitter.emit('heating.temperature.updated', {
				heatingId,
				temperature,
			});
		}
	}

	private updateAlarmState(heatingId: string, isAlarm: boolean) {
		if (this.states[heatingId]) {
			this.states[heatingId].isAlarm = isAlarm;
			if (isAlarm) {
				this.logger.warn(`Alarm detected for heating ${heatingId}`);
				// При аварии отключаем систему
				this.emergencyStop(heatingId);
				
				// Эмитируем событие аварии
				this.eventEmitter.emit('heating.alarm', {
					heatingId,
					isAlarm,
				});
			}
		}
	}

	private checkAutoControl(heatingId: string) {
		const state = this.states[heatingId];
		const config = heatingConfigs[heatingId];
		
		if (!state || !config || state.isEmergencyStop) return;

		// Получаем температуру от датчика, если настроен
		let currentTemperature = state.currentTemperature;
		if (config.temperatureSource) {
			const sensorTemp = this.temperatureSensorService.getTemperature(config.temperatureSource.sourceId);
			if (sensorTemp !== null) {
				currentTemperature = sensorTemp;
				state.currentTemperature = currentTemperature;
			}
		}

		const { setpointTemperature } = state;
		const { HYSTERESIS, TEMP_LOW_1, TEMP_LOW_2, TEMP_HIGH } = config.temperatureSettings;

		// Логика автоматического управления отоплением
		if (currentTemperature < setpointTemperature - HYSTERESIS) {
			// Температура ниже заданной - включаем отопление
			if (currentTemperature < setpointTemperature - TEMP_LOW_2) {
				// Низкая температура - максимальная скорость насоса
				this.setPumpSpeed(heatingId, 3);
				this.setValve(heatingId, 'open');
			} else if (currentTemperature < setpointTemperature - TEMP_LOW_1) {
				// Средняя температура - средняя скорость насоса
				this.setPumpSpeed(heatingId, 2);
				this.setValve(heatingId, 'open');
			} else {
				// Близко к заданной - минимальная скорость
				this.setPumpSpeed(heatingId, 1);
				this.setValve(heatingId, 'open');
			}
			state.isWorking = true;
			state.isStandingBy = false;
		} else if (currentTemperature > setpointTemperature + HYSTERESIS) {
			// Температура выше заданной - отключаем отопление
			this.setPumpSpeed(heatingId, 0);
			this.setValve(heatingId, 'close');
			state.isWorking = false;
			state.isStandingBy = true;
		}

		// Проверка на перегрев
		if (currentTemperature > config.temperatureSettings.TEMP_OVERHEAT_LIMIT) {
			this.logger.warn(`Overheat detected for heating ${heatingId}: ${currentTemperature}°C`);
			this.emergencyStop(heatingId);
		}

		// Проверка на замерзание
		if (currentTemperature < config.temperatureSettings.TEMP_FREEZE_LIMIT) {
			this.logger.warn(`Freeze risk detected for heating ${heatingId}: ${currentTemperature}°C`);
			// Включаем отопление на максимум для предотвращения замерзания
			this.setPumpSpeed(heatingId, 3);
			this.setValve(heatingId, 'open');
		}
	}

	setPumpSpeed(heatingId: string, speed: number) {
		const state = this.states[heatingId];
		const config = heatingConfigs[heatingId];
		
		if (!state || !config || speed < 0 || speed > 3 || state.isEmergencyStop) return;

		state.pumpSpeedQueue.push(speed);
		this.processPumpSpeedQueue(heatingId);
	}

	private processPumpSpeedQueue(heatingId: string) {
		const state = this.states[heatingId];
		const config = heatingConfigs[heatingId];
		
		if (!state || !config || state.isSpeedChanging || state.pumpSpeedQueue.length === 0) return;

		const speed = state.pumpSpeedQueue.shift()!;
		
		// Если скорость не изменилась, пропускаем
		if (speed === state.currentPumpSpeed) {
			this.processPumpSpeedQueue(heatingId);
			return;
		}

		state.isSpeedChanging = true;

		// Отключаем все скорости
		this.mqttService.publish(config.topics.DO_PUMP_SPEED_1, '0');
		this.mqttService.publish(config.topics.DO_PUMP_SPEED_2, '0');
		this.mqttService.publish(config.topics.DO_PUMP_SPEED_3, '0');

		// Включаем нужную скорость
		if (speed > 0) {
			const speedTopic = speed === 1 ? config.topics.DO_PUMP_SPEED_1 :
							  speed === 2 ? config.topics.DO_PUMP_SPEED_2 :
							  config.topics.DO_PUMP_SPEED_3;
			this.mqttService.publish(speedTopic, '1');
		}

		state.currentPumpSpeed = speed;
		state.lastAutoSpeed = speed;

		setTimeout(() => {
			state.isSpeedChanging = false;
			this.processPumpSpeedQueue(heatingId);
		}, config.timingSettings.PUMP_SPEED_CHANGE_DELAY);

		this.logger.log(`Heating ${heatingId} pump speed set to: ${speed}`);
		
		// Эмитируем событие изменения скорости насоса
		this.eventEmitter.emit('heating.pump.speed.changed', {
			heatingId,
			speed,
		});
	}

	setValve(heatingId: string, action: 'open' | 'close') {
		const state = this.states[heatingId];
		const config = heatingConfigs[heatingId];
		
		if (!state || !config || state.isEmergencyStop) return;

		// Если состояние клапана уже соответствует запрашиваемому, пропускаем
		const targetState = action === 'open' ? 'open' : 'closed';
		if (state.valveState === targetState) return;

		state.valveQueue.push(action);
		this.processValveQueue(heatingId);
	}

	private processValveQueue(heatingId: string) {
		const state = this.states[heatingId];
		const config = heatingConfigs[heatingId];
		
		if (!state || !config || state.valveQueue.length === 0) return;
		if (state.valveState === 'opening' || state.valveState === 'closing') return;

		const action = state.valveQueue.shift()!;
		
		if (action === 'open') {
			this.mqttService.publish(config.topics.DO_OPEN, '1');
			state.valveState = 'opening';
			state.lastAutoValve = 'open';
			
			setTimeout(() => {
				this.mqttService.publish(config.topics.DO_OPEN, '0'); // Отключаем сигнал
				state.valveState = 'open';
				this.processValveQueue(heatingId);
			}, config.timingSettings.VALVE_OPEN_TIME);
		} else {
			this.mqttService.publish(config.topics.DO_CLOSE, '1');
			state.valveState = 'closing';
			state.lastAutoValve = 'closed';
			
			setTimeout(() => {
				this.mqttService.publish(config.topics.DO_CLOSE, '0'); // Отключаем сигнал
				state.valveState = 'closed';
				this.processValveQueue(heatingId);
			}, config.timingSettings.VALVE_CLOSE_TIME);
		}

		this.logger.log(`Heating ${heatingId} valve ${action} command sent`);
		
		// Эмитируем событие изменения состояния клапана
		this.eventEmitter.emit('heating.valve.state.changed', {
			heatingId,
			action,
			state: state.valveState,
		});
	}

	setTemperature(heatingId: string, temperature: number) {
		const state = this.states[heatingId];
		const config = heatingConfigs[heatingId];
		
		if (!state || !config) return;

		// Проверяем допустимые пределы температуры
		if (temperature < 5 || temperature > 30) {
			this.logger.warn(`Invalid temperature setpoint for heating ${heatingId}: ${temperature}°C`);
			return;
		}

		state.setpointTemperature = temperature;
		state.isSetpointChanging = true;
		state.lastSetpointChange = Date.now();

		setTimeout(() => {
			state.isSetpointChanging = false;
		}, config.timingSettings.SETPOINT_CHANGE_TIMEOUT);

		this.logger.log(`Heating ${heatingId} setpoint temperature set to: ${temperature}°C`);
		
		// Эмитируем событие изменения уставки температуры
		this.eventEmitter.emit('heating.setpoint.changed', {
			heatingId,
			temperature,
		});
	}

	enableAutoControl(heatingId: string) {
		const state = this.states[heatingId];
		if (!state) return;

		state.autoControlEnabled = true;
		state.isEmergencyStop = false;
		this.logger.log(`Auto control enabled for heating ${heatingId}`);
		
		// Эмитируем событие включения автоматического управления
		this.eventEmitter.emit('heating.auto.control.enabled', {
			heatingId,
		});
	}

	disableAutoControl(heatingId: string) {
		const state = this.states[heatingId];
		if (!state) return;

		state.autoControlEnabled = false;
		this.logger.log(`Auto control disabled for heating ${heatingId}`);
		
		// Эмитируем событие отключения автоматического управления
		this.eventEmitter.emit('heating.auto.control.disabled', {
			heatingId,
		});
	}

	emergencyStop(heatingId: string) {
		const state = this.states[heatingId];
		const config = heatingConfigs[heatingId];
		
		if (!state || !config) return;

		state.isEmergencyStop = true;
		state.autoControlEnabled = false;
		state.isWorking = false;
		state.isStandingBy = false;
		
		// Отключаем насос и закрываем клапан
		this.setPumpSpeed(heatingId, 0);
		this.setValve(heatingId, 'close');

		this.logger.warn(`Emergency stop activated for heating ${heatingId}`);
		
		// Эмитируем событие аварийной остановки
		this.eventEmitter.emit('heating.emergency.stop', {
			heatingId,
		});
	}

	resetEmergencyStop(heatingId: string) {
		const state = this.states[heatingId];
		if (!state) return;

		state.isEmergencyStop = false;
		state.isAlarm = false;
		this.logger.log(`Emergency stop reset for heating ${heatingId}`);
		
		// Эмитируем событие сброса аварийной остановки
		this.eventEmitter.emit('heating.emergency.stop.reset', {
			heatingId,
		});
	}

	getState(heatingId: string): HeatingState | null {
		const state = this.states[heatingId];
		if (!state) return null;

		// Возвращаем копию состояния без внутренних полей
		return {
			currentPumpSpeed: state.currentPumpSpeed,
			isSpeedChanging: state.isSpeedChanging,
			valveState: state.valveState,
			currentTemperature: state.currentTemperature,
			setpointTemperature: state.setpointTemperature,
			isSetpointChanging: state.isSetpointChanging,
			lastSetpointChange: state.lastSetpointChange,
			isEmergencyStop: state.isEmergencyStop,
			isAlarm: state.isAlarm,
			isWorking: state.isWorking,
			isStarting: state.isStarting,
			isStandingBy: state.isStandingBy,
			isOnline: state.isOnline,
		};
	}

	getAllStates(): Record<string, HeatingState> {
		const result: Record<string, HeatingState> = {};
		Object.keys(this.states).forEach(key => {
			const state = this.getState(key);
			if (state) {
				result[key] = state;
			}
		});
		return result;
	}

	// Метод для получения статистики системы
	getSystemStats() {
		const stats = {
			totalSystems: Object.keys(this.states).length,
			onlineSystems: 0,
			workingSystems: 0,
			alarmSystems: 0,
			emergencyStopSystems: 0,
			autoControlEnabledSystems: 0,
		};

		Object.values(this.states).forEach(state => {
			if (state.isOnline) stats.onlineSystems++;
			if (state.isWorking) stats.workingSystems++;
			if (state.isAlarm) stats.alarmSystems++;
			if (state.isEmergencyStop) stats.emergencyStopSystems++;
			if (state.autoControlEnabled) stats.autoControlEnabledSystems++;
		});

		return stats;
	}

	// Очистка ресурсов при завершении работы модуля
	onModuleDestroy() {
		this.isDestroyed = true;
		Object.values(this.autoControlIntervals).forEach(interval => {
			clearInterval(interval);
		});
	}
}
