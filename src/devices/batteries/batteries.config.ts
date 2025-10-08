import { BatteriesConfig } from '../interfaces/batteries.interface';

const defaultTemperatureSettings = {
	HYSTERESIS: 0.5,
	TEMP_LOW: 15,
	TEMP_HIGH: 25,
	TEMP_FREEZE_LIMIT: 5,
	TEMP_OVERHEAT_LIMIT: 35,
	VALVE_OPERATION_TIME: 150, // Время работы клапана в секундах
};

export const batteriesConfigs: Record<string, BatteriesConfig> = {
	'ШУОП-1_1': {
		deviceName: 'ШУОП-1_1',
		deviceRealName: 'ШУОП-1 низ',
		topics: {
			RELAY_MODULES: {
				94: '/devices/wb-mr6cu_94/controls',
				45: '/devices/wb-mr6cu_45/controls',
				61: '/devices/wb-mr6cu_61/controls',
			},
			TEMPERATURE_SENSORS: {
				101: '/devices/wb-msw-v4_101/controls/Temperature', // DHT-45
				244: '/devices/wb-msw-v4_244/controls/Temperature', // DHT-46
				30: '/devices/wb-msw-v4_30/controls/Temperature',   // DHT-47
			},
		},
		temperatureSettings: defaultTemperatureSettings,
		groups: [
			// Модуль 1 (Адрес 94)
			{
				groupName: 'Гр. 1',
				relayModuleAddress: 94,
				moduleName: 'Модуль 1',
				relays: ['K1', 'K2', 'K3', 'K4', 'K5', 'K6'],
				temperatureSensor: 'DHT-46',
				temperatureSensorAddress: 244,
				hasTemperatureSensor: true,
			},
		],
		broker: 'heating',
	},
	'ШУОП-1_2': {
		deviceName: 'ШУОП-1_2',
		deviceRealName: 'ШУОП-1 верх',
		topics: {
			RELAY_MODULES: {
				94: '/devices/wb-mr6cu_94/controls',
				45: '/devices/wb-mr6cu_45/controls',
				61: '/devices/wb-mr6cu_61/controls',
			},
			TEMPERATURE_SENSORS: {
				101: '/devices/wb-msw-v4_101/controls/Temperature', // DHT-45
				244: '/devices/wb-msw-v4_244/controls/Temperature', // DHT-46
				30: '/devices/wb-msw-v4_30/controls/Temperature',   // DHT-47
			},
		},
		temperatureSettings: defaultTemperatureSettings,
		groups: [
			// Модуль 1 (Адрес 94)
			{
				groupName: 'Гр. 1',
				relayModuleAddress: 45,
				moduleName: 'Модуль 1',
				relays: ['K1', 'K2', 'K3', 'K4', 'K5', 'K6'],
				temperatureSensor: 'DHT-46',
				temperatureSensorAddress: 30,
				hasTemperatureSensor: true,
			},
			{
				groupName: 'Гр. 2',
				relayModuleAddress: 61,
				moduleName: 'Модуль 2',
				relays: ['K1', 'K2'],
				temperatureSensor: 'DHT-46',
				temperatureSensorAddress: 30,
				hasTemperatureSensor: true,
			},
		],
		broker: 'heating',
	},
	'ШУОП-2_1': {
		deviceName: 'ШУОП-2_1',
		deviceRealName: 'ШУОП-2 пом. 61 1 шт.',
		topics: {
			RELAY_MODULES: {
				74: '/devices/wb-mr6cu_74/controls',
				104: '/devices/wb-mr6cu_104/controls',
				75: '/devices/wb-mr6cu_75/controls',
			},
			TEMPERATURE_SENSORS: {
				96: '/devices/wb-msw-v4_96/controls/Temperature',  // DHT-39
				97: '/devices/wb-msw-v4_97/controls/Temperature',  // DHT-40
				28: '/devices/wb-msw-v4_28/controls/Temperature',  // DHT-41
				189: '/devices/wb-msw-v4_189/controls/Temperature', // DHT-42
			},
		},
		temperatureSettings: defaultTemperatureSettings,
		groups: [
			// Модуль 3 (Адрес 74)
			{
				groupName: 'Гр. 1',
				relayModuleAddress: 75,
				moduleName: 'Модуль 3',
				relays: ['K1'],
				temperatureSensor: 'DHT-42',
				temperatureSensorAddress: 189,
				hasTemperatureSensor: true,
			},
		],
		broker: 'heating',
	},
	'ШУОП-2_2': {
		deviceName: 'ШУОП-2_2',
		deviceRealName: 'ШУОП-2 пом. 59 3 шт.',
		topics: {
			RELAY_MODULES: {
				74: '/devices/wb-mr6cu_74/controls',
				104: '/devices/wb-mr6cu_104/controls',
				75: '/devices/wb-mr6cu_75/controls',
			},
			TEMPERATURE_SENSORS: {
				96: '/devices/wb-msw-v4_96/controls/Temperature',  // DHT-39
				97: '/devices/wb-msw-v4_97/controls/Temperature',  // DHT-40
				28: '/devices/wb-msw-v4_28/controls/Temperature',  // DHT-41
				189: '/devices/wb-msw-v4_189/controls/Temperature', // DHT-42
			},
		},
		temperatureSettings: defaultTemperatureSettings,
		groups: [
			// Модуль 3 (Адрес 74)
			{
				groupName: 'Гр. 1',
				relayModuleAddress: 75,
				moduleName: 'Модуль 3',
				relays: ['K2', 'K3', 'K4'],
				temperatureSensor: 'DHT-42',
				temperatureSensorAddress: 28,
				hasTemperatureSensor: true,
			},
		],
		broker: 'heating',
	},
	'ШУОП-2_3': {
		deviceName: 'ШУОП-2_3',
		deviceRealName: 'ШУОП-2 лаунж 2 шт.',
		topics: {
			RELAY_MODULES: {
				74: '/devices/wb-mr6cu_74/controls',
				104: '/devices/wb-mr6cu_104/controls',
				75: '/devices/wb-mr6cu_75/controls',
			},
			TEMPERATURE_SENSORS: {
				96: '/devices/wb-msw-v4_96/controls/Temperature',  // DHT-39
				97: '/devices/wb-msw-v4_97/controls/Temperature',  // DHT-40
				28: '/devices/wb-msw-v4_28/controls/Temperature',  // DHT-41
				189: '/devices/wb-msw-v4_189/controls/Temperature', // DHT-42
			},
		},
		temperatureSettings: defaultTemperatureSettings,
		groups: [
			// Модуль 3 (Адрес 74)
			{
				groupName: 'Гр. 1',
				relayModuleAddress: 75,
				moduleName: 'Модуль 3',
				relays: ['K5', 'K6'],
				temperatureSensor: 'DHT-40',
				temperatureSensorAddress: 97,
				hasTemperatureSensor: true,
			},
		],
		broker: 'heating',
	},
	'ШУОП-2_4': {
		deviceName: 'ШУОП-2_4',
		deviceRealName: 'ШУОП-2 openspace 8 шт.',
		topics: {
			RELAY_MODULES: {
				74: '/devices/wb-mr6cu_74/controls',
				104: '/devices/wb-mr6cu_104/controls',
				75: '/devices/wb-mr6cu_75/controls',
			},
			TEMPERATURE_SENSORS: {
				96: '/devices/wb-msw-v4_96/controls/Temperature',  // DHT-39
				97: '/devices/wb-msw-v4_97/controls/Temperature',  // DHT-40
				28: '/devices/wb-msw-v4_28/controls/Temperature',  // DHT-41
				189: '/devices/wb-msw-v4_189/controls/Temperature', // DHT-42
			},
		},
		temperatureSettings: defaultTemperatureSettings,
		groups: [
			// Модуль 3 (Адрес 74)
			{
				groupName: 'Гр. 1',
				relayModuleAddress: 104,
				moduleName: 'Модуль 3',
				relays: ['K1', 'K2', 'K3', 'K4', 'K5', 'K6'],
				temperatureSensor: 'DHT-39',
				temperatureSensorAddress: 96,
				hasTemperatureSensor: true,
			},
			{
				groupName: 'Гр. 2',
				relayModuleAddress: 74,
				moduleName: 'Модуль 3',
				relays: ['K1', 'K2'],
				temperatureSensor: 'DHT-39', 
				temperatureSensorAddress: 96,
				hasTemperatureSensor: true,
			},
		],
		broker: 'heating',
	},
	'ШУОП-3_1': {
		deviceName: 'ШУОП-3_1',
		deviceRealName: 'ШУОП-3 СБ 4 шт.',
		topics: {
			RELAY_MODULES: {
				73: '/devices/wb-mr6cu_73/controls',
				29: '/devices/wb-mr6cu_29/controls',
				89: '/devices/wb-mr6cu_89/controls',
			},
			TEMPERATURE_SENSORS: {
				63: '/devices/wb-msw-v4_63/controls/Temperature',  // DHT-16
				// 81: '/devices/wb-msw-v4_81/controls/Temperature',  // DHT-17
				// 83: '/devices/wb-msw-v4_83/controls/Temperature',  // DHT-18
				// 98: '/devices/wb-msw-v4_98/controls/Temperature',  // DHT-19
				// 10: '/devices/wb-msw-v4_10/controls/Temperature',  // DHT-20
				// 129: '/devices/wb-msw-v4_129/controls/Temperature', // DHT-21
				// 57: '/devices/wb-msw-v4_57/controls/Temperature',  // DHT-22
			},
		},
		temperatureSettings: defaultTemperatureSettings,
		groups: [
			// Модуль 1 (Адрес 73)
			{
				groupName: 'Гр. 1',
				relayModuleAddress: 73,
				moduleName: 'Модуль 1',
				relays: ['K1', 'K2', 'K3'],
				temperatureSensor: 'DHT-16',
				temperatureSensorAddress: 63,
				hasTemperatureSensor: true,
			},
			{
				groupName: 'Гр. 2',
				relayModuleAddress: 89,
				moduleName: 'Модуль 1',
				relays: ['K1'],
				temperatureSensor: 'DHT-16',
				temperatureSensorAddress: 63,
				hasTemperatureSensor: true,
			},
		],
		broker: 'heating',
	},
	'ШУОП-3_2': {
		deviceName: 'ШУОП-3_2',
		deviceRealName: 'ШУОП-3 Нач. СБ 1 шт.',
		topics: {
			RELAY_MODULES: {
				73: '/devices/wb-mr6cu_73/controls',
				29: '/devices/wb-mr6cu_29/controls',
			},
			TEMPERATURE_SENSORS: {
				// 63: '/devices/wb-msw-v4_63/controls/Temperature',  // DHT-16
				81: '/devices/wb-msw-v4_81/controls/Temperature',  // DHT-17
				// 83: '/devices/wb-msw-v4_83/controls/Temperature',  // DHT-18
				// 98: '/devices/wb-msw-v4_98/controls/Temperature',  // DHT-19
				// 10: '/devices/wb-msw-v4_10/controls/Temperature',  // DHT-20
				// 129: '/devices/wb-msw-v4_129/controls/Temperature', // DHT-21
				// 57: '/devices/wb-msw-v4_57/controls/Temperature',  // DHT-22
			},
		},
		temperatureSettings: defaultTemperatureSettings,
		groups: [
			// Модуль 1 (Адрес 73)
			{
				groupName: 'Гр. 1',
				relayModuleAddress: 73,
				moduleName: 'Модуль 1',
				relays: ['K4'],
				temperatureSensor: 'DHT-17',
				temperatureSensorAddress: 81,
				hasTemperatureSensor: true,
			},
		],
		broker: 'heating',
	},
	'ШУОП-3_3': {
		deviceName: 'ШУОП-3_3',
		deviceRealName: 'ШУОП-3 ИТ 1 шт.',
		topics: {
			RELAY_MODULES: {
				73: '/devices/wb-mr6cu_73/controls',
				29: '/devices/wb-mr6cu_29/controls',
			},
			TEMPERATURE_SENSORS: {
				// 63: '/devices/wb-msw-v4_63/controls/Temperature',  // DHT-16
				// 81: '/devices/wb-msw-v4_81/controls/Temperature',  // DHT-17
				83: '/devices/wb-msw-v4_83/controls/Temperature',  // DHT-18
				// 98: '/devices/wb-msw-v4_98/controls/Temperature',  // DHT-19
				// 10: '/devices/wb-msw-v4_10/controls/Temperature',  // DHT-20
				// 129: '/devices/wb-msw-v4_129/controls/Temperature', // DHT-21
				// 57: '/devices/wb-msw-v4_57/controls/Temperature',  // DHT-22
			},
		},
		temperatureSettings: defaultTemperatureSettings,
		groups: [
			// Модуль 1 (Адрес 73)
			{
				groupName: 'Гр. 1',
				relayModuleAddress: 73,
				moduleName: 'Модуль 1',
				relays: ['K5'],
				temperatureSensor: 'DHT-18',
				temperatureSensorAddress: 83,
				hasTemperatureSensor: true,
			},
		],
		broker: 'heating',
	},
	'ШУОП-3_4': {
		deviceName: 'ШУОП-3_4',
		deviceRealName: 'ШУОП-3 Перег. 1 шт.',
		topics: {
			RELAY_MODULES: {
				73: '/devices/wb-mr6cu_73/controls',
				29: '/devices/wb-mr6cu_29/controls',
			},
			TEMPERATURE_SENSORS: {
				// 63: '/devices/wb-msw-v4_63/controls/Temperature',  // DHT-16
                // 81: '/devices/wb-msw-v4_81/controls/Temperature',  // DHT-17
				// 83: '/devices/wb-msw-v4_83/controls/Temperature',  // DHT-18
				98: '/devices/wb-msw-v4_98/controls/Temperature',  // DHT-19
				// 10: '/devices/wb-msw-v4_10/controls/Temperature',  // DHT-20
				// 129: '/devices/wb-msw-v4_129/controls/Temperature', // DHT-21
				// 57: '/devices/wb-msw-v4_57/controls/Temperature',  // DHT-22
			},
		},
		temperatureSettings: defaultTemperatureSettings,
		groups: [
			// Модуль 1 (Адрес 73)
			{
				groupName: 'Гр. 1',
				relayModuleAddress: 73,
				moduleName: 'Модуль 1',
				relays: ['K6'],
				temperatureSensor: 'DHT-19',
				temperatureSensorAddress: 98,
				hasTemperatureSensor: true,
			},
		],
		broker: 'heating',
	},
	'ШУОП-3_5': {
		deviceName: 'ШУОП-3_5',
		deviceRealName: 'ШУОП-3 АХО 1 шт.',
		topics: {
			RELAY_MODULES: {
				73: '/devices/wb-mr6cu_73/controls',
				29: '/devices/wb-mr6cu_29/controls',
			},
			TEMPERATURE_SENSORS: {
				// 63: '/devices/wb-msw-v4_63/controls/Temperature',  // DHT-16
				// 81: '/devices/wb-msw-v4_81/controls/Temperature',  // DHT-17
				// 83: '/devices/wb-msw-v4_83/controls/Temperature',  // DHT-18
				// 98: '/devices/wb-msw-v4_98/controls/Temperature',  // DHT-19
				10: '/devices/wb-msw-v4_10/controls/Temperature',  // DHT-20
				// 129: '/devices/wb-msw-v4_129/controls/Temperature', // DHT-21
				// 57: '/devices/wb-msw-v4_57/controls/Temperature',  // DHT-22
			},
		},
		temperatureSettings: defaultTemperatureSettings,
		groups: [
			// Модуль 1 (Адрес 73)
			{
				groupName: 'Гр. 1',
				relayModuleAddress: 29,
				moduleName: 'Модуль 1',
				relays: ['K1'],
				temperatureSensor: 'DHT-20',
				temperatureSensorAddress: 10,
				hasTemperatureSensor: true,
			},
		],
		broker: 'heating',
	},
	'ШУОП-3_6': {
		deviceName: 'ШУОП-3_6',
		deviceRealName: 'ШУОП-3 Отдел кадров 2 шт.',
		topics: {
			RELAY_MODULES: {
				73: '/devices/wb-mr6cu_73/controls',
				29: '/devices/wb-mr6cu_29/controls',
			},
			TEMPERATURE_SENSORS: {
				// 63: '/devices/wb-msw-v4_63/controls/Temperature',  // DHT-16
				// 81: '/devices/wb-msw-v4_81/controls/Temperature',  // DHT-17
				// 83: '/devices/wb-msw-v4_83/controls/Temperature',  // DHT-18
				// 98: '/devices/wb-msw-v4_98/controls/Temperature',  // DHT-19
				// 10: '/devices/wb-msw-v4_10/controls/Temperature',  // DHT-20
				129: '/devices/wb-msw-v4_129/controls/Temperature', // DHT-21
				// 57: '/devices/wb-msw-v4_57/controls/Temperature',  // DHT-22
			},
		},
		temperatureSettings: defaultTemperatureSettings,
		groups: [
			// Модуль 1 (Адрес 73)
			{
				groupName: 'Гр. 1',
				relayModuleAddress: 29,
				moduleName: 'Модуль 1',
				relays: ['K2', 'K3'],
				temperatureSensor: 'DHT-21',
				temperatureSensorAddress: 129,
				hasTemperatureSensor: true,
			},
		],
		broker: 'heating',
	},
	'ШУОП-3_7': {
		deviceName: 'ШУОП-3_7',
		deviceRealName: 'ШУОП-3 Бухгалтерия 3 шт.',
		topics: {
			RELAY_MODULES: {
				73: '/devices/wb-mr6cu_73/controls',
				29: '/devices/wb-mr6cu_29/controls',
			},
			TEMPERATURE_SENSORS: {
				// 63: '/devices/wb-msw-v4_63/controls/Temperature',  // DHT-16
				// 81: '/devices/wb-msw-v4_81/controls/Temperature',  // DHT-17
				// 83: '/devices/wb-msw-v4_83/controls/Temperature',  // DHT-18
				// 98: '/devices/wb-msw-v4_98/controls/Temperature',  // DHT-19
				// 10: '/devices/wb-msw-v4_10/controls/Temperature',  // DHT-20
				// 129: '/devices/wb-msw-v4_129/controls/Temperature', // DHT-21
				57: '/devices/wb-msw-v4_57/controls/Temperature',  // DHT-22
			},
		},
		temperatureSettings: defaultTemperatureSettings,
		groups: [
			// Модуль 1 (Адрес 73)
			{
				groupName: 'Гр. 1',
				relayModuleAddress: 29,
				moduleName: 'Модуль 1',
				relays: ['K4', 'K5', 'K6'],
				temperatureSensor: 'DHT-22',
				temperatureSensorAddress: 57,
				hasTemperatureSensor: true,
			},
		],
		broker: 'heating',
	},
	'ШУОП-4_1': {
		deviceName: 'ШУОП-4_1',
		deviceRealName: 'ШУОП-4 Детская',
		topics: {
			RELAY_MODULES: {
				82: '/devices/wb-mr6cu_82/controls',
				97: '/devices/wb-mr6cu_97/controls',
				90: '/devices/wb-mr6cu_90/controls',
			},
			TEMPERATURE_SENSORS: {
				49: '/devices/wb-msw-v4_49/controls/Temperature',  // DHT-09
				12: '/devices/wb-msw-v4_12/controls/Temperature',  // DHT-10
				66: '/devices/wb-msw-v4_66/controls/Temperature',  // DHT-11
				65: '/devices/wb-msw-v4_65/controls/Temperature',  // DHT-12
				55: '/devices/wb-msw-v4_55/controls/Temperature',  // DHT-13
			},
		},
		temperatureSettings: defaultTemperatureSettings,
		groups: [
			// Модуль 1 (Адрес 82)
			{
				groupName: 'Гр. 1',
				relayModuleAddress: 82,
				moduleName: 'Модуль 1',
				relays: ['K3', 'K4'],
				temperatureSensor: 'DHT-09',
				temperatureSensorAddress: 49,
				hasTemperatureSensor: true,
			},
		],
		broker: 'heating',
	},
	'ШУОП-4_2': {
		deviceName: 'ШУОП-4_2',
		deviceRealName: 'ШУОП-4 Лаунж зона',
		topics: {
			RELAY_MODULES: {
				82: '/devices/wb-mr6cu_82/controls',
				97: '/devices/wb-mr6cu_97/controls',
				90: '/devices/wb-mr6cu_90/controls',
			},
			TEMPERATURE_SENSORS: {
				49: '/devices/wb-msw-v4_49/controls/Temperature',  // DHT-09
				12: '/devices/wb-msw-v4_12/controls/Temperature',  // DHT-10
				66: '/devices/wb-msw-v4_66/controls/Temperature',  // DHT-11
				65: '/devices/wb-msw-v4_65/controls/Temperature',  // DHT-12
				55: '/devices/wb-msw-v4_55/controls/Temperature',  // DHT-13
			},
		},
		temperatureSettings: defaultTemperatureSettings,
		groups: [
			// Модуль 1 (Адрес 82)
			{
				groupName: 'Гр. 1',
				relayModuleAddress: 82,
				moduleName: 'Модуль 1',
				relays: ['K5', 'K6'],
				temperatureSensor: 'DHT-10',
				temperatureSensorAddress: 12,
				hasTemperatureSensor: true,
			},
		],
		broker: 'heating',
	},
	'ШУОП-4_3': {
		deviceName: 'ШУОП-4_3',
		deviceRealName: 'ШУОП-4 Спортзал',
		topics: {
			RELAY_MODULES: {
				82: '/devices/wb-mr6cu_82/controls',
				97: '/devices/wb-mr6cu_97/controls',
				90: '/devices/wb-mr6cu_90/controls',
			},
			TEMPERATURE_SENSORS: {
				49: '/devices/wb-msw-v4_49/controls/Temperature',  // DHT-09
				12: '/devices/wb-msw-v4_12/controls/Temperature',  // DHT-10
				66: '/devices/wb-msw-v4_66/controls/Temperature',  // DHT-11
				65: '/devices/wb-msw-v4_65/controls/Temperature',  // DHT-12
				55: '/devices/wb-msw-v4_55/controls/Temperature',  // DHT-13
			},
		},
		temperatureSettings: defaultTemperatureSettings,
		groups: [
			// Модуль 1 (Адрес 82)
			{
				groupName: 'ШУОП-4_Модуль1_К1-К2',
				relayModuleAddress: 97,
				moduleName: 'Модуль 1',
                relays: ['K1', 'K2', 'K3', 'K4'],
				temperatureSensor: 'DHT-11',
				temperatureSensorAddress: 66,
				hasTemperatureSensor: true,
			},
		],
		broker: 'heating',
	},
	'ШУОП-4_4': {
		deviceName: 'ШУОП-4_4',
		deviceRealName: 'ШУОП-4 Комната тишины',
		topics: {
			RELAY_MODULES: {
				82: '/devices/wb-mr6cu_82/controls',
				97: '/devices/wb-mr6cu_97/controls',
				90: '/devices/wb-mr6cu_90/controls',
			},
			TEMPERATURE_SENSORS: {
				49: '/devices/wb-msw-v4_49/controls/Temperature',  // DHT-09
				12: '/devices/wb-msw-v4_12/controls/Temperature',  // DHT-10
				66: '/devices/wb-msw-v4_66/controls/Temperature',  // DHT-11
				65: '/devices/wb-msw-v4_65/controls/Temperature',  // DHT-12
				55: '/devices/wb-msw-v4_55/controls/Temperature',  // DHT-13
			},
		},
		temperatureSettings: defaultTemperatureSettings,
		groups: [
			// Модуль 1 (Адрес 82)
			{
				groupName: 'Гр. 1',
				relayModuleAddress: 97,
				moduleName: 'Модуль 1',
                relays: ['K5', 'K6'],
				temperatureSensor: 'DHT-12',
				temperatureSensorAddress: 65,
				hasTemperatureSensor: true,
			},
		],
		broker: 'heating',
	},
	'ШУОП-4_5': {
		deviceName: 'ШУОП-4_5',
		deviceRealName: 'ШУОП-4 Комната сна',
		topics: {
			RELAY_MODULES: {
				82: '/devices/wb-mr6cu_82/controls',
				97: '/devices/wb-mr6cu_97/controls',
				90: '/devices/wb-mr6cu_90/controls',
			},
			TEMPERATURE_SENSORS: {
				49: '/devices/wb-msw-v4_49/controls/Temperature',  // DHT-09
				12: '/devices/wb-msw-v4_12/controls/Temperature',  // DHT-10
				66: '/devices/wb-msw-v4_66/controls/Temperature',  // DHT-11
				65: '/devices/wb-msw-v4_65/controls/Temperature',  // DHT-12
				55: '/devices/wb-msw-v4_55/controls/Temperature',  // DHT-13
			},
		},
		temperatureSettings: defaultTemperatureSettings,
		groups: [
			// Модуль 1 (Адрес 82)
			{
				groupName: 'Гр. 1',
				relayModuleAddress: 90,
				moduleName: 'Модуль 1',
                relays: ['K1', 'K2'],
				temperatureSensor: 'DHT-13',
				temperatureSensorAddress: 55,
				hasTemperatureSensor: true,
			},
		],
		broker: 'heating',
	},
};
