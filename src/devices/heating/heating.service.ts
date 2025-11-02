import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MqttService } from '../../mqtt/mqtt.service';
import { DatabaseService } from '../../database/database.service';
import { heatingConfigs } from './heating.config';
import { HeatingState, HeatingPIDSettings } from '../interfaces/heating.interface';

interface HeatingInternalState extends HeatingState {
	autoControlEnabled: boolean;
	pidState: HeatingPIDSettings;
	lastPIDUpdate: number;
}

@Injectable()
export class HeatingService implements OnModuleInit {
	private readonly logger = new Logger(HeatingService.name);
	private states: Record<string, HeatingInternalState> = {};
	private pidControlIntervals: Record<string, NodeJS.Timeout> = {};
	private isDestroyed = false;

	constructor(
		private readonly mqttService: MqttService,
		private readonly eventEmitter: EventEmitter2,
		private readonly databaseService: DatabaseService,
	) {
		this.isDestroyed = false;
		// Инициализация состояний для каждого отопительного контура
		Object.keys(heatingConfigs).forEach((heatingId) => {
			const config = heatingConfigs[heatingId];
			this.states[heatingId] = {
				currentFanSpeed: 0,
				valveState: 'closed',
				currentTemperature: 0,
				setpointTemperature: 15, // Значение по умолчанию как в примере
				pidOutput: 0,
				isEmergencyStop: false,
				isWorking: false,
				isOnline: false,
				autoControlEnabled: false,
				pidState: { ...config.pidSettings }, // Копируем настройки PID
				lastPIDUpdate: Date.now(),
			};
		});
	}

	async onModuleInit() {
		this.logger.log('Heating Service initialized');
		
		// Загружаем уставки из базы данных
		await this.loadSettingsFromDatabase();

		// Единый обработчик MQTT сообщений для брокера sensors
		this.eventEmitter.on('mqtt.sensors.message', (data: { topic: string; message: any }) => {
			// Лог для входящего сообщения
			this.logger.log(`🔥 Получено MQTT сообщение: ${data.topic}, ${data.message}`);

			// Ищем отопление, которому соответствует топик
			let matchedCount = 0;
			for (const [heatingId, config] of Object.entries(heatingConfigs)) {
				if (data.topic === config.topics.TEMPERATURE_SENSOR) {
					const temperature = parseFloat(String(data.message));
					if (!isNaN(temperature)) {
						this.logger.log(`  ✅ MQTT topic ${data.topic} matched to ${heatingId}, updating temperature: ${temperature}°C`);
						this.updateTemperature(heatingId, temperature);
						matchedCount++;
					} else {
						this.logger.warn(`❌ Invalid temperature data for ${heatingId}: ${data.message}`);
					}
					// Убираем break, чтобы все ШУКи с одинаковым датчиком получали обновления
				}
			}
			
			if (matchedCount === 0) {
				this.logger.warn(`⚠️  MQTT topic ${data.topic} not matched to any heating device`);
			} else if (matchedCount > 1) {
				this.logger.warn(`⚠️  MQTT topic ${data.topic} matched to ${matchedCount} devices (may cause duplicate updates)`);
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

		// Инициализируем состояние для каждого отопительного блока
		Object.entries(heatingConfigs).forEach(([heatingId, config]) => {
			this.logger.log(`Initializing heating system: ${heatingId}`);

			// Инициализируем состояние отопления
			this.states[heatingId] = {
				currentFanSpeed: 0,
				valveState: 'closed',
				currentTemperature: 0,
				setpointTemperature: 23,
				pidOutput: 0,
				isEmergencyStop: false,
				isWorking: false,
				isOnline: false,
				autoControlEnabled: false,
				lastError: 0,
				integral: config.pidSettings.integral,
				pidState: { ...config.pidSettings },
				lastPIDUpdate: Date.now(),
			};

			// Запускаем PID контроль каждую секунду (как в примере кода)
			this.pidControlIntervals[heatingId] = setInterval(() => {
				if (this.states[heatingId]?.autoControlEnabled && !this.states[heatingId]?.isEmergencyStop) {
					this.runPIDControl(heatingId);
				}
			}, 1000); // 1 секунда, как в примере

			// Подписка на события подключения/отключения для каждого отопления
			this.eventEmitter.on(`mqtt.sensors.connected`, () => {
				this.states[heatingId].isOnline = true;
				this.eventEmitter.emit('heating.update', heatingId);
			});
			this.eventEmitter.on(`mqtt.sensors.error`, () => {
				this.states[heatingId].isOnline = false;
				this.eventEmitter.emit('heating.update', heatingId);
			});
			this.eventEmitter.on(`mqtt.sensors.offline`, () => {
				this.states[heatingId].isOnline = false;
				this.eventEmitter.emit('heating.update', heatingId);
			});
		});

		// Начальная настройка подписок
		await this.setupMqttSubscriptions();

		// Применяем сезонную логику клапанов для всех ШУКов при запуске сервера
		this.applySasonalValveLogicToAll();
	}

	private async setupMqttSubscriptions() {
		this.logger.log('🔧 Setting up MQTT subscriptions...');
		
		await Promise.all(
			Object.entries(heatingConfigs).map(async ([heatingId, config]) => {
				try {
					this.logger.log(`🌡️ Subscribing ${heatingId} to temperature sensor: ${config.topics.TEMPERATURE_SENSOR}`);
					await this.mqttService.subscribe('sensors', config.topics.TEMPERATURE_SENSOR);
				} catch (err: unknown) {
					const error = err as Error;
					this.logger.error(`Ошибка подписки на топики отопления ${heatingId}: ${error.message}`);
				}
			}),
		);
	}

	private updateTemperature(heatingId: string, temperature: number) {
		if (this.states[heatingId]) {
			this.states[heatingId].currentTemperature = temperature;
			this.states[heatingId].isOnline = true;
			this.logger.log(`📊 Heating ${heatingId} temperature updated: ${temperature}°C`);
			
			// Эмитируем событие обновления температуры
			this.eventEmitter.emit('heating.temperature.updated', {
				heatingId,
				temperature,
			});
		}
	}

	private runPIDControl(heatingId: string) {
		const state = this.states[heatingId];
		const config = heatingConfigs[heatingId];
		
		if (!state || !config) return;

		const { currentTemperature, setpointTemperature, pidState } = state;
		const { Kp, Ki, Kd, outputMin, outputMax } = pidState;
		const { HYSTERESIS } = config.temperatureSettings;

		// Вычисляем ошибку с учетом гистерезиса
		let error = setpointTemperature - currentTemperature;
		
		// Применяем гистерезис для более плавной работы
		if (state.isWorking && error < 0 && Math.abs(error) <= HYSTERESIS) {
			// Если система работает и ошибка в пределах гистерезиса, 
			// считаем ошибку равной 0 (не меняем режим)
			error = 0;
		}

		// Обновляем интегральную составляющую с антивиндовпом
		pidState.integral += error;
		
		// Ограничиваем интегральную составляющую для предотвращения перерегулирования
		// const maxIntegral = 200; // Максимальное значение интеграла
		// pidState.integral = Math.max(-maxIntegral, Math.min(maxIntegral, pidState.integral));

		// Сбрасываем интеграл при превышении температуры
		if (error < 0) {
			pidState.integral = Math.max(0, pidState.integral * 0.95);
		}

		// Вычисляем дифференциальную составляющую
		const derivative = error - pidState.prevError;

		// Вычисляем выход PID регулятора
		let output = Kp * error + Ki * pidState.integral + Kd * derivative;

		// Ограничиваем выход в диапазоне outputMin - outputMax
		output = Math.max(outputMin, Math.min(outputMax, output));

		// Для отопления: если температура выше уставки, постепенно снижаем выход
		// но не сбрасываем сразу в 0, чтобы избежать резких скачков
		if (error < 0) {
			// Постепенно уменьшаем интегральную составляющую при превышении температуры
			pidState.integral = Math.max(0, pidState.integral * 0.95); // Медленно сбрасываем интеграл
		}

		this.logger.debug(`PID Control ${heatingId}: error=${error.toFixed(2)}, output=${output.toFixed(2)}, valve=${this.getSeasonalValveState(heatingId, output) ? 'open' : 'closed'} (seasonal)`);

		// Обновляем состояние
		state.pidOutput = output;
		state.currentFanSpeed = output;
		pidState.prevError = error;

		// Отправляем команду вентилятору с учетом минимального порога
		const fanSpeed = Math.max(0, output);
		
		// Если выход очень мал (меньше 5%), отключаем вентилятор
		if (fanSpeed < 15) {
			this.logger.log(`🔥 PID: Fan speed too low (${fanSpeed.toFixed(1)}%), turning off fan for ${heatingId}`);
			this.mqttService.publish(config.broker, `${config.topics.FAN_DIMMER}/on`, 0, {
				retain: false,
			});
		} else {
			this.logger.log(`🔥 PID: Sending fan speed command for ${heatingId}: topic="${config.topics.FAN_DIMMER}/on", value=${fanSpeed.toFixed(1)}`);
			this.mqttService.publish(config.broker, `${config.topics.FAN_DIMMER}/on`, fanSpeed, {
				retain: false,
			});
		}

		// Управляем клапаном по сезонной логике
		const valveState = this.getSeasonalValveState(heatingId, output);
		this.setSeasonalValve(heatingId, valveState);

		// Определяем состояние работы
		state.isWorking = output > 0;

		this.logger.debug(`PID Control ${heatingId}: error=${error.toFixed(2)}, output=${output.toFixed(2)}, valve=${state.valveState}`);

		// Эмитируем события
		this.eventEmitter.emit('heating.pid.updated', {
			heatingId,
			error,
			output,
			integral: pidState.integral,
			derivative,
		});
	}

	private setValve(heatingId: string, open: boolean) {
		const state = this.states[heatingId];
		const config = heatingConfigs[heatingId];
		
		if (!state || !config) return;

		const newState = open ? 'open' : 'closed';
		
		// Если состояние не изменилось, не отправляем команду
		if (state.valveState === newState) return;

		// Отправляем команду на реле
		this.logger.log(`🔥 VALVE: Sending valve command for ${heatingId}: topic="${config.topics.VALVE_RELAY}/on", value=${open}`);
		this.mqttService.publish(config.broker, `${config.topics.VALVE_RELAY}/on`, open, {
			retain: false,
		});
		
		state.valveState = newState;

		this.logger.debug(`Valve ${heatingId} set to: ${newState}`);
		
		// Эмитируем событие изменения состояния клапана
		this.eventEmitter.emit('heating.valve.state.changed', {
			heatingId,
			state: newState,
		});
	}

	// Публичные методы для управления

	setFanSpeed(heatingId: string, speed: number) {
		const state = this.states[heatingId];
		const config = heatingConfigs[heatingId];
		
		if (!state || !config || speed < 0 || speed > 100) return;

		// Устанавливаем значение на аналоговый выход
		this.mqttService.publish(config.broker, `${config.topics.FAN_DIMMER}/on`, speed, {
			retain: false,
		});
		state.currentFanSpeed = speed;
		state.pidOutput = speed;

		this.logger.log(`Fan speed manually set to ${speed} for heating ${heatingId}`);
	}

	// Загрузка настроек из базы данных
	private async loadSettingsFromDatabase() {
		this.logger.log('Загружаем настройки отопления из базы данных...');
		
		for (const heatingId of Object.keys(this.states)) {
			try {
				const setpointStr = await this.databaseService.getHeatingSetting(heatingId, 'setpoint_temperature');
				if (setpointStr) {
					const setpoint = parseFloat(setpointStr);
					if (!isNaN(setpoint)) {
						this.states[heatingId].setpointTemperature = setpoint;
						this.logger.log(`Загружена уставка для ${heatingId}: ${setpoint}°C`);
					}
				}
			} catch (error) {
				this.logger.error(`Ошибка загрузки настроек для ${heatingId}:`, error);
			}
		}
	}

	async setTemperature(heatingId: string, temperature: number) {
		const state = this.states[heatingId];
		
		if (!state) return;

		// Проверяем допустимые пределы температуры
		if (temperature < 5 || temperature > 35) {
			this.logger.warn(`Invalid temperature setpoint for heating ${heatingId}: ${temperature}°C`);
			return;
		}

		state.setpointTemperature = temperature;

		// Сохраняем уставку в базу данных
		try {
			await this.databaseService.setHeatingSetting(heatingId, 'setpoint_temperature', temperature.toString());
			this.logger.log(`Heating ${heatingId} setpoint temperature set to: ${temperature}°C and saved to database`);
		} catch (error) {
			this.logger.error(`Failed to save temperature setpoint to database for ${heatingId}:`, error);
		}
		
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
		
		// Сбрасываем PID состояние при включении
		const config = heatingConfigs[heatingId];
		if (config) {
			state.pidState.integral = 0;
			state.pidState.prevError = 0;
		}

		this.logger.log(`Auto control enabled for heating ${heatingId}`);
		
		// Эмитируем событие включения автоматического управления
		this.eventEmitter.emit('heating.auto.control.enabled', {
			heatingId,
		});
	}

	disableAutoControl(heatingId: string) {
		const state = this.states[heatingId];
		const config = heatingConfigs[heatingId];
		
		if (!state || !config) return;

		state.autoControlEnabled = false;
		state.isWorking = false;
		
		// Отключаем вентилятор и закрываем клапан
					this.mqttService.publish(config.broker, `${config.topics.FAN_DIMMER}/on`, 0, {
						retain: false,
					});
		this.setValve(heatingId, false);
		
		state.currentFanSpeed = 0;
		state.pidOutput = 0;

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
		
		// Отключаем вентилятор и закрываем клапан
					this.mqttService.publish(config.broker, `${config.topics.FAN_DIMMER}/on`, 0, {
						retain: false,
					});
		this.setValve(heatingId, false);
		
		state.currentFanSpeed = 0;
		state.pidOutput = 0;

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
		this.logger.log(`Emergency stop reset for heating ${heatingId}`);
		
		// Эмитируем событие сброса аварийной остановки
		this.eventEmitter.emit('heating.emergency.stop.reset', {
			heatingId,
		});
	}

	// Методы для настройки PID параметров
	setPIDParameters(heatingId: string, Kp?: number, Ki?: number, Kd?: number) {
		const state = this.states[heatingId];
		if (!state) return;

		if (Kp !== undefined) state.pidState.Kp = Kp;
		if (Ki !== undefined) state.pidState.Ki = Ki;
		if (Kd !== undefined) state.pidState.Kd = Kd;

		// Сбрасываем интегральную составляющую при изменении параметров
		state.pidState.integral = 0;
		state.pidState.prevError = 0;

		this.logger.log(`PID parameters updated for ${heatingId}: Kp=${state.pidState.Kp}, Ki=${state.pidState.Ki}, Kd=${state.pidState.Kd}`);
	}

	// Методы для получения состояния

	getState(heatingId: string): HeatingState | null {
		const state = this.states[heatingId];
		if (!state) return null;

		// Возвращаем копию состояния без внутренних полей
		return {
			currentFanSpeed: state.currentFanSpeed,
			valveState: state.valveState,
			currentTemperature: state.currentTemperature,
			setpointTemperature: state.setpointTemperature,
			pidOutput: state.pidOutput,
			isEmergencyStop: state.isEmergencyStop,
			isWorking: state.isWorking,
			isOnline: state.isOnline,
			autoControlEnabled: state.autoControlEnabled,
			lastError: state.lastError,
			integral: state.integral,
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

	// Метод для получения PID параметров
	getPIDParameters(heatingId: string) {
		const state = this.states[heatingId];
		if (!state) return null;

		return {
			Kp: state.pidState.Kp,
			Ki: state.pidState.Ki,
			Kd: state.pidState.Kd,
			integral: state.pidState.integral,
			prevError: state.pidState.prevError,
		};
	}

	// Метод для получения статистики системы
	getSystemStats() {
		const stats = {
			totalSystems: Object.keys(this.states).length,
			onlineSystems: 0,
			workingSystems: 0,
			emergencyStopSystems: 0,
			autoControlEnabledSystems: 0,
			averageTemperature: 0,
			averageSetpoint: 0,
		};

		let tempSum = 0;
		let setpointSum = 0;

		Object.values(this.states).forEach(state => {
			if (state.isOnline) stats.onlineSystems++;
			if (state.isWorking) stats.workingSystems++;
			if (state.isEmergencyStop) stats.emergencyStopSystems++;
			if (state.autoControlEnabled) stats.autoControlEnabledSystems++;
			
			tempSum += state.currentTemperature;
			setpointSum += state.setpointTemperature;
		});

		if (stats.totalSystems > 0) {
			stats.averageTemperature = tempSum / stats.totalSystems;
			stats.averageSetpoint = setpointSum / stats.totalSystems;
		}

		return stats;
	}

	// Очистка ресурсов при завершении работы модуля
	onModuleDestroy() {
		this.isDestroyed = true;
		Object.values(this.pidControlIntervals).forEach(interval => {
			clearInterval(interval);
		});
		this.logger.log('Heating service destroyed');
	}

	// Тестовый метод для прямой отправки MQTT команд
	testMqttCommand(topic: string, value: string) {
		this.logger.log(`🧪 TEST: Sending MQTT command to topic: ${topic}, value: ${value}`);
		this.mqttService.publish('heating', topic, value, {
			retain: false,
		});
	}

	// Определяем состояние клапана по сезону
	private getSeasonalValveState(heatingId: string, pidOutput: number): boolean {
		const now = new Date();
		const month = now.getMonth() + 1; // getMonth() возвращает 0-11, нужно 1-12
		const day = now.getDate();

		// Зима: с 1 ноября до 31 марта - клапан всегда открыт
		if ((month === 11) || (month === 12) || (month === 1) || (month === 2) || (month === 3)) {
			this.logger.debug(`${heatingId}: Winter season - valve always open`);
			return true;
		}

		// Лето: с 1 июня по 31 августа - клапан принудительно закрыт
		if (month >= 6 && month <= 8) {
			this.logger.debug(`${heatingId}: Summer season - valve always closed`);
			return false;
		}

		// Осень: с 1 сентября по 31 октября - синхронно с включением ШУК
		// Весна: с 1 апреля по 31 мая - синхронно с включением ШУК
		if ((month >= 9 && month <= 10) || (month >= 4 && month <= 5)) {
			const shouldOpen = pidOutput > 0;
			this.logger.debug(`${heatingId}: Autumn/Spring season - valve synced with heating: ${shouldOpen}`);
			return shouldOpen;
		}

		// На всякий случай (не должно попасть сюда)
		return false;
	}

	// Устанавливаем состояние клапана по сезонной логике
	private setSeasonalValve(heatingId: string, shouldOpen: boolean) {
		const state = this.states[heatingId];
		const config = heatingConfigs[heatingId];
		
		if (!state || !config) return;

		const newState = shouldOpen ? 'open' : 'closed';
		
		// Если состояние не изменилось, не отправляем команду
		if (state.valveState === newState) return;

		// Отправляем команду на реле
		this.logger.log(`🔥 SEASONAL VALVE: Sending valve command for ${heatingId}: topic="${config.topics.VALVE_RELAY}/on", value=${shouldOpen} (seasonal logic)`);
		this.mqttService.publish(config.broker, `${config.topics.VALVE_RELAY}/on`, shouldOpen, {
			retain: false,
		});
		
		state.valveState = newState;
		this.logger.debug(`Seasonal valve ${heatingId} set to: ${newState}`);
	}

	// Применяем сезонную логику клапанов для всех ШУКов при запуске сервера
	private applySasonalValveLogicToAll() {
		this.logger.log('🌍 Applying seasonal valve logic to all heating units...');
		
		Object.keys(heatingConfigs).forEach(heatingId => {
			const state = this.states[heatingId];
			if (!state) return;

			// Получаем сезонное состояние клапана (независимо от PID выхода)
			const seasonalValveState = this.getSeasonalValveState(heatingId, 0);
			
			// Принудительно устанавливаем состояние клапана
			this.logger.log(`🌍 Setting seasonal valve for ${heatingId}: ${seasonalValveState ? 'OPEN' : 'CLOSED'}`);
			
			// Устанавливаем состояние напрямую (минуя проверку изменения)
			const config = heatingConfigs[heatingId];
			if (config) {
				this.mqttService.publish(config.broker, `${config.topics.VALVE_RELAY}/on`, seasonalValveState, {
					retain: false,
				});
				state.valveState = seasonalValveState ? 'open' : 'closed';
			}
		});

		this.logger.log('🌍 Seasonal valve logic applied to all heating units');
	}
}