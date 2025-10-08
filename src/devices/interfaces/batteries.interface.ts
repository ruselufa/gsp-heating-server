import { Device } from './device.interface';

export interface BatteriesData {
	temperature: number;
	valveStates: Record<string, 'open' | 'closed'>; // Состояния клапанов для каждой группы
	setpointTemperature: number;
	isOn: boolean;
	errorCode?: number;
}

export enum BatteriesMode {
	AUTO = 'auto',
	MANUAL = 'manual',
	OFF = 'off',
}

export interface BatteriesControl {
	command: BatteriesCommand;
	parameters?: BatteriesControlParameters;
}

export enum BatteriesCommand {
	TURN_ON = 'turn_on',
	TURN_OFF = 'turn_off',
	SET_MODE = 'set_mode',
	SET_TEMPERATURE = 'set_temperature',
	SET_VALVE_STATE = 'set_valve_state',
}

export interface BatteriesControlParameters {
	mode?: BatteriesMode;
	temperature?: number;
	groupName?: string;
	valveState?: 'open' | 'closed';
}

export interface Batteries extends Device {
	type: 'batteries';
	status: {
		isOnline: boolean;
		lastSeen: Date;
		data: BatteriesData;
	};
}

export interface BatteriesGroup {
	groupName: string; // Например: "ШУОП1_1", "ШУОП1_2"
	relayModuleAddress: number; // Адрес релейного модуля (например: 94, 45, 61)
	moduleName: string; // Название модуля (например: "Модуль 1", "Модуль 2", "Модуль 3")
	relays: string[]; // Массив реле К, например: ["K1", "K2"]
	temperatureSensor?: string; // ID датчика температуры для этой группы (например: "DHT-45")
	temperatureSensorAddress?: number; // Адрес датчика температуры (например: 101)
	hasTemperatureSensor: boolean; // Есть ли у этой группы свой датчик температуры
}

export interface BatteriesTopics {
	RELAY_MODULES: Record<number, string>; // Маппинг адресов релейных модулей на пути (например: {94: '/devices/wb-mr6cu_94/controls'})
	TEMPERATURE_SENSORS: Record<number, string>; // Маппинг адресов датчиков на пути (например: {101: '/devices/wb-msw-v4_101/controls/Temperature'})
}

export interface BatteriesTemperatureSettings {
	HYSTERESIS: number; // Гистерезис для управления
	TEMP_LOW: number; // Нижняя граница температуры
	TEMP_HIGH: number; // Верхняя граница температуры
	TEMP_FREEZE_LIMIT: number; // Минимальная температура для защиты от замерзания
	TEMP_OVERHEAT_LIMIT: number; // Максимальная температура
	VALVE_OPERATION_TIME: number; // Время работы клапана в секундах (150 сек)
}

export interface BatteriesTemperatureSource {
	type: 'dht' | 'modbus' | 'mqtt';
	sourceId: string;
}

export interface BatteriesConfig {
	broker: string;
	deviceName: string; // Например: "ШУОП-1"
	deviceRealName: string;
	temperatureSource?: BatteriesTemperatureSource;
	topics: BatteriesTopics;
	temperatureSettings: BatteriesTemperatureSettings;
	groups: BatteriesGroup[]; // Массив групп батарей
}

export interface BatteriesState {
	valveStates: Record<string, 'open' | 'closed'>; // Состояния клапанов по группам
	currentTemperature: number;
	setpointTemperature: number;
	isEmergencyStop: boolean;
	isWorking: boolean;
	isOnline?: boolean;
	autoControlEnabled?: boolean;
	lastError?: number;
	lastValveOperation?: Record<string, Date>; // Время последней операции с клапаном по группам
}
