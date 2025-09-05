import { Device } from './device.interface';

export interface HeatingData {
	temperature: number;
	humidity: number;
	valvePosition: number;
	pumpSpeed: number;
	mode: HeatingMode;
	isOn: boolean;
	errorCode?: number;
}

export enum HeatingMode {
	HEAT = 'heat',
	VENTILATION = 'ventilation',
	AUTO = 'auto',
	OFF = 'off',
}

export interface HeatingControl {
	command: HeatingCommand;
	parameters?: HeatingControlParameters;
}

export enum HeatingCommand {
	TURN_ON = 'turn_on',
	TURN_OFF = 'turn_off',
	SET_MODE = 'set_mode',
	SET_TEMPERATURE = 'set_temperature',
	SET_PUMP_SPEED = 'set_pump_speed',
	SET_VALVE = 'set_valve',
}

export interface HeatingControlParameters {
	mode?: HeatingMode;
	temperature?: number;
	pumpSpeed?: number;
	valvePosition?: number;
}

export interface Heating extends Device {
	type: 'heating';
	status: {
		isOnline: boolean;
		lastSeen: Date;
		data: HeatingData;
	};
}

export interface HeatingTopics {
	VALVE_RELAY: string;  // Реле клапана (wb-mr6cu_XXX/K1)
	FAN_DIMMER: string;   // Диммер вентилятора (wb-mao4_XXX/Channel 1 Dimming Level)
	TEMPERATURE_SENSOR: string; // Датчик температуры (wb-msw-v4_XXX/Temperature)
}

export interface HeatingTemperatureSettings {
	HYSTERESIS: number;
	TEMP_LOW_1: number;
	TEMP_LOW_2: number;
	TEMP_HIGH: number;
	TEMP_FREEZE_LIMIT: number;
	TEMP_OVERHEAT_LIMIT: number;
}

export interface HeatingPIDSettings {
	Kp: number;  // Коэффициент пропорциональности
	Ki: number;  // Коэффициент интегральной составляющей
	Kd: number;  // Коэффициент дифференциальной составляющей
	outputMin: number;  // Минимальное значение выхода (0)
	outputMax: number;  // Максимальное значение выхода (30)
	integral: number;   // Интегральная составляющая
	prevError: number;  // Предыдущая ошибка
}

export interface HeatingTemperatureSource {
	type: 'dht' | 'modbus' | 'mqtt';
	sourceId: string;
}

export interface HeatingConfig {
	broker: string;
	deviceName: string;
	relayModule: string;      // wb-mr6cu модуль для реле
	analogModule: string;     // wb-mao4 модуль для диммера
	tempModule: string;       // wb-msw-v4 модуль для датчика температуры
	deviceRealName: string;
	temperatureSource?: HeatingTemperatureSource;
	topics: HeatingTopics;
	temperatureSettings: HeatingTemperatureSettings;
	pidSettings: HeatingPIDSettings;
}

export interface HeatingState {
	currentFanSpeed: number;      // Текущая скорость вентилятора (0-30)
	valveState: 'open' | 'closed';
	currentTemperature: number;
	setpointTemperature: number;
	pidOutput: number;            // Выход PID регулятора
	isEmergencyStop: boolean;
	isWorking: boolean;
	isOnline?: boolean;
	autoControlEnabled?: boolean;
	lastError?: number;
	integral?: number;
}
