import { Device } from './device.interface';

export interface TemperatureSensorData {
	temperature: number;
	humidity?: number;
	pressure?: number;
	timestamp: Date;
}

export interface TemperatureSensor extends Device {
	type: 'temperature-sensor';
	status: {
		isOnline: boolean;
		lastSeen: Date;
		data: TemperatureSensorData;
	};
}

export interface TemperatureSensorConfig {
	broker: string;
	deviceName: string;
	sensorModule: string;
	deviceRealName: string;
	topics: {
		TEMPERATURE: string;
		HUMIDITY?: string;
		PRESSURE?: string;
	};
}
