import { TemperatureSensorConfig } from '../interfaces/temperature-sensor.interface';

export const temperatureSensorConfigs: Record<string, TemperatureSensorConfig> = {
	DHT80: {
		deviceName: 'DHT80',
		sensorModule: 'wb-m1w2_204',
		deviceRealName: 'Датчик температуры 80',
		broker: 'temperature',
		topics: {
			TEMPERATURE: '/devices/wb-m1w2_204/controls/External Sensor 1',
			HUMIDITY: '/devices/wb-m1w2_204/controls/External Sensor 2',
		},
	},
	DHT81: {
		deviceName: 'DHT81',
		sensorModule: 'wb-m1w2_205',
		deviceRealName: 'Датчик температуры 81',
		broker: 'temperature',
		topics: {
			TEMPERATURE: '/devices/wb-m1w2_205/controls/External Sensor 1',
			HUMIDITY: '/devices/wb-m1w2_205/controls/External Sensor 2',
		},
	},
	DHT82: {
		deviceName: 'DHT82',
		sensorModule: 'wb-m1w2_206',
		deviceRealName: 'Датчик температуры 82',
		broker: 'temperature',
		topics: {
			TEMPERATURE: '/devices/wb-m1w2_206/controls/External Sensor 1',
			HUMIDITY: '/devices/wb-m1w2_206/controls/External Sensor 2',
		},
	},
	DHT83: {
		deviceName: 'DHT83',
		sensorModule: 'wb-m1w2_207',
		deviceRealName: 'Датчик температуры 83',
		broker: 'temperature',
		topics: {
			TEMPERATURE: '/devices/wb-m1w2_207/controls/External Sensor 1',
			HUMIDITY: '/devices/wb-m1w2_207/controls/External Sensor 2',
		},
	},
	DHT84: {
		deviceName: 'DHT84',
		sensorModule: 'wb-m1w2_208',
		deviceRealName: 'Датчик температуры 84',
		broker: 'temperature',
		topics: {
			TEMPERATURE: '/devices/wb-m1w2_208/controls/External Sensor 1',
			HUMIDITY: '/devices/wb-m1w2_208/controls/External Sensor 2',
		},
	},
};
