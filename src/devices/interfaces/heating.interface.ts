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
	DO_OPEN: string;
	DO_CLOSE: string;
	DO_PUMP_SPEED_1: string;
	DO_PUMP_SPEED_2: string;
	DO_PUMP_SPEED_3: string;
	HEATING_CURR_TEMP: string;
	ALARM: string;
}

export interface HeatingTemperatureSettings {
	HYSTERESIS: number;
	TEMP_LOW_1: number;
	TEMP_LOW_2: number;
	TEMP_HIGH: number;
	TEMP_FREEZE_LIMIT: number;
	TEMP_OVERHEAT_LIMIT: number;
}

export interface HeatingTimingSettings {
	SETPOINT_CHANGE_TIMEOUT: number;
	VALVE_OPEN_TIME: number;
	VALVE_CLOSE_TIME: number;
	VALVE_DELAY: number;
	PUMP_SPEED_CHANGE_DELAY: number;
}

export interface HeatingTemperatureSource {
	type: 'dht' | 'modbus' | 'mqtt';
	sourceId: string;
}

export interface HeatingConfig {
	broker: string;
	deviceName: string;
	relayModule: string;
	tempModule: string;
	deviceRealName: string;
	temperatureSource?: HeatingTemperatureSource;
	topics: HeatingTopics;
	temperatureSettings: HeatingTemperatureSettings;
	timingSettings: HeatingTimingSettings;
}

export interface HeatingState {
	currentPumpSpeed: number;
	isSpeedChanging: boolean;
	valveState: 'open' | 'closed' | 'opening' | 'closing';
	currentTemperature: number;
	setpointTemperature: number;
	isSetpointChanging: boolean;
	lastSetpointChange: number;
	isEmergencyStop: boolean;
	isAlarm: boolean;
	isWorking: boolean;
	isStarting: boolean;
	isStandingBy: boolean;
	isOnline?: boolean;
}
