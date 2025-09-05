import { HeatingConfig } from '../interfaces/heating.interface';

const defaultTemperatureSettings = {
	HYSTERESIS: 0.5,
	TEMP_LOW_1: 15,
	TEMP_LOW_2: 18,
	TEMP_HIGH: 25,
	TEMP_FREEZE_LIMIT: 5,
	TEMP_OVERHEAT_LIMIT: 35,
};

const normalTimingSettings = {
	SETPOINT_CHANGE_TIMEOUT: 500,
	VALVE_OPEN_TIME: 300000, // 5 минут
	VALVE_CLOSE_TIME: 300000, // 5 минут
	VALVE_DELAY: 3000, // 3 секунды
	PUMP_SPEED_CHANGE_DELAY: 3000, // 3 секунды
};

export const heatingConfigs: Record<string, HeatingConfig> = {
	HT01: {
		deviceName: 'HT_reg01',
		relayModule: 'wb-mr6c_200',
		tempModule: 'wb-m1w2_201',
		deviceRealName: 'Управление отоплением 01',
		temperatureSource: {
			type: 'dht',
			sourceId: 'DHT80',
		},
		topics: {
			DO_OPEN: '/devices/wb-mr6c_200/controls/K1',
			DO_CLOSE: '/devices/wb-mr6c_200/controls/K2',
			DO_PUMP_SPEED_1: '/devices/wb-mr6c_200/controls/K4',
			DO_PUMP_SPEED_2: '/devices/wb-mr6c_200/controls/K5',
			DO_PUMP_SPEED_3: '/devices/wb-mr6c_200/controls/K6',
			HEATING_CURR_TEMP: '/devices/wb-m1w2_201/controls/External Sensor 1',
			ALARM: '/devices/wb-mr6c_200/controls/Input 0',
		},
		temperatureSettings: {
			HYSTERESIS: 0.5,
			TEMP_LOW_1: 15,
			TEMP_LOW_2: 18,
			TEMP_HIGH: 25,
			TEMP_FREEZE_LIMIT: 5,
			TEMP_OVERHEAT_LIMIT: 35,
		},
		timingSettings: normalTimingSettings,
		broker: 'heating',
	},
	HT02: {
		deviceName: 'HT_reg02',
		relayModule: 'wb-mr6c_201',
		tempModule: 'wb-m1w2_202',
		deviceRealName: 'Управление отоплением 02',
		temperatureSource: {
			type: 'dht',
			sourceId: 'DHT81',
		},
		topics: {
			DO_OPEN: '/devices/wb-mr6c_201/controls/K1',
			DO_CLOSE: '/devices/wb-mr6c_201/controls/K2',
			DO_PUMP_SPEED_1: '/devices/wb-mr6c_201/controls/K4',
			DO_PUMP_SPEED_2: '/devices/wb-mr6c_201/controls/K5',
			DO_PUMP_SPEED_3: '/devices/wb-mr6c_201/controls/K6',
			HEATING_CURR_TEMP: '/devices/wb-m1w2_202/controls/External Sensor 1',
			ALARM: '/devices/wb-mr6c_201/controls/Input 0',
		},
		temperatureSettings: {
			HYSTERESIS: 0.5,
			TEMP_LOW_1: 15,
			TEMP_LOW_2: 18,
			TEMP_HIGH: 25,
			TEMP_FREEZE_LIMIT: 5,
			TEMP_OVERHEAT_LIMIT: 35,
		},
		timingSettings: normalTimingSettings,
		broker: 'heating',
	},
	HT03: {
		deviceName: 'HT_reg03',
		relayModule: 'wb-mr6c_202',
		tempModule: 'wb-m1w2_203',
		deviceRealName: 'Управление отоплением 03',
		temperatureSource: {
			type: 'dht',
			sourceId: 'DHT82',
		},
		topics: {
			DO_OPEN: '/devices/wb-mr6c_202/controls/K1',
			DO_CLOSE: '/devices/wb-mr6c_202/controls/K2',
			DO_PUMP_SPEED_1: '/devices/wb-mr6c_202/controls/K4',
			DO_PUMP_SPEED_2: '/devices/wb-mr6c_202/controls/K5',
			DO_PUMP_SPEED_3: '/devices/wb-mr6c_202/controls/K6',
			HEATING_CURR_TEMP: '/devices/wb-m1w2_203/controls/External Sensor 1',
			ALARM: '/devices/wb-mr6c_202/controls/Input 0',
		},
		temperatureSettings: {
			HYSTERESIS: 0.5,
			TEMP_LOW_1: 15,
			TEMP_LOW_2: 18,
			TEMP_HIGH: 25,
			TEMP_FREEZE_LIMIT: 5,
			TEMP_OVERHEAT_LIMIT: 35,
		},
		timingSettings: normalTimingSettings,
		broker: 'heating',
	},
	HT04: {
		deviceName: 'HT_reg04',
		relayModule: 'wb-mr6c_203',
		tempModule: 'wb-m1w2_204',
		deviceRealName: 'Управление отоплением 04',
		temperatureSource: {
			type: 'dht',
			sourceId: 'DHT83',
		},
		topics: {
			DO_OPEN: '/devices/wb-mr6c_203/controls/K1',
			DO_CLOSE: '/devices/wb-mr6c_203/controls/K2',
			DO_PUMP_SPEED_1: '/devices/wb-mr6c_203/controls/K4',
			DO_PUMP_SPEED_2: '/devices/wb-mr6c_203/controls/K5',
			DO_PUMP_SPEED_3: '/devices/wb-mr6c_203/controls/K6',
			HEATING_CURR_TEMP: '/devices/wb-m1w2_204/controls/External Sensor 1',
			ALARM: '/devices/wb-mr6c_203/controls/Input 0',
		},
		temperatureSettings: {
			HYSTERESIS: 0.5,
			TEMP_LOW_1: 15,
			TEMP_LOW_2: 18,
			TEMP_HIGH: 25,
			TEMP_FREEZE_LIMIT: 5,
			TEMP_OVERHEAT_LIMIT: 35,
		},
		timingSettings: normalTimingSettings,
		broker: 'heating',
	},
	HT05: {
		deviceName: 'HT_reg05',
		relayModule: 'wb-mr6c_204',
		tempModule: 'wb-m1w2_205',
		deviceRealName: 'Управление отоплением 05',
		temperatureSource: {
			type: 'dht',
			sourceId: 'DHT84',
		},
		topics: {
			DO_OPEN: '/devices/wb-mr6c_204/controls/K1',
			DO_CLOSE: '/devices/wb-mr6c_204/controls/K2',
			DO_PUMP_SPEED_1: '/devices/wb-mr6c_204/controls/K4',
			DO_PUMP_SPEED_2: '/devices/wb-mr6c_204/controls/K5',
			DO_PUMP_SPEED_3: '/devices/wb-mr6c_204/controls/K6',
			HEATING_CURR_TEMP: '/devices/wb-m1w2_205/controls/External Sensor 1',
			ALARM: '/devices/wb-mr6c_204/controls/Input 0',
		},
		temperatureSettings: {
			HYSTERESIS: 0.5,
			TEMP_LOW_1: 15,
			TEMP_LOW_2: 18,
			TEMP_HIGH: 25,
			TEMP_FREEZE_LIMIT: 5,
			TEMP_OVERHEAT_LIMIT: 35,
		},
		timingSettings: normalTimingSettings,
		broker: 'heating',
	},
};
