import { ModbusVariable, ModbusDeviceConfig, ModbusAreaType } from '../interfaces/modbus.interface';

/**
 * Шаблон переменных для ОДНОГО устройства Heating
 * Все устройства используют одинаковую структуру, но с разными Unit ID
 */
export const HEATING_VARIABLES_TEMPLATE: ModbusVariable[] = [
	// ========== DISCRETE INPUTS (Read Only) - Статусы ==========
	// Биты 0-15 объединяются в одно 16-битное слово для оптимизации
	{
		name: 'IS_ONLINE',
		area: ModbusAreaType.DISCRETE_INPUTS,
		address: 0,
		dataType: 'bit',
		bitOffset: 0,
		description: 'Устройство в сети',
		access: 'R'
	},
	{
		name: 'IS_WORKING',
		area: ModbusAreaType.DISCRETE_INPUTS,
		address: 0,
		dataType: 'bit',
		bitOffset: 1,
		description: 'Система работает',
		access: 'R'
	},
	{
		name: 'IS_EMERGENCY_STOP',
		area: ModbusAreaType.DISCRETE_INPUTS,
		address: 0,
		dataType: 'bit',
		bitOffset: 2,
		description: 'Аварийная остановка',
		access: 'R'
	},
	{
		name: 'TEMP_SENSOR_ERROR',
		area: ModbusAreaType.DISCRETE_INPUTS,
		address: 0,
		dataType: 'bit',
		bitOffset: 3,
		description: 'Ошибка датчика температуры',
		access: 'R'
	},
	{
		name: 'PID_ACTIVE',
		area: ModbusAreaType.DISCRETE_INPUTS,
		address: 0,
		dataType: 'bit',
		bitOffset: 4,
		description: 'PID регулятор активен',
		access: 'R'
	},
	{
		name: 'FREEZE_PROTECTION',
		area: ModbusAreaType.DISCRETE_INPUTS,
		address: 0,
		dataType: 'bit',
		bitOffset: 5,
		description: 'Защита от замерзания активна',
		access: 'R'
	},
	{
		name: 'OVERHEAT_PROTECTION',
		area: ModbusAreaType.DISCRETE_INPUTS,
		address: 0,
		dataType: 'bit',
		bitOffset: 6,
		description: 'Защита от перегрева активна',
		access: 'R'
	},
	{
		name: 'VALVE_OPEN',
		area: ModbusAreaType.DISCRETE_INPUTS,
		address: 0,
		dataType: 'bit',
		bitOffset: 7,
		description: 'Клапан открыт',
		access: 'R'
	},
	
	// ========== COILS (Read/Write) - Управление ==========
	// Биты 0-15 объединяются в одно 16-битное слово
	{
		name: 'AUTO_CONTROL_ENABLED',
		area: ModbusAreaType.COILS,
		address: 0,
		dataType: 'bit',
		bitOffset: 0,
		description: 'Автоуправление включено',
		access: 'RW'
	},
	{
		name: 'MANUAL_OVERRIDE',
		area: ModbusAreaType.COILS,
		address: 0,
		dataType: 'bit',
		bitOffset: 1,
		description: 'Ручное управление',
		access: 'RW'
	},
	
	// ========== INPUT REGISTERS (Read Only) - Датчики ==========
	{
		name: 'CURRENT_TEMP',
		area: ModbusAreaType.INPUT_REGISTERS,
		address: 0,
		dataType: 'int16',
		description: 'Текущая температура (x10)',
		scale: 10,
		access: 'R'
	},
	{
		name: 'CURRENT_FAN_SPEED',
		area: ModbusAreaType.INPUT_REGISTERS,
		address: 1,
		dataType: 'uint16',
		description: 'Текущая скорость вентилятора (0-30)',
		access: 'R'
	},
	{
		name: 'VALVE_STATE',
		area: ModbusAreaType.INPUT_REGISTERS,
		address: 2,
		dataType: 'uint16',
		description: 'Состояние клапана (0=закрыт, 1=открыт)',
		access: 'R'
	},
	{
		name: 'PID_OUTPUT',
		area: ModbusAreaType.INPUT_REGISTERS,
		address: 3,
		dataType: 'int16',
		description: 'Выход PID регулятора (x10)',
		scale: 10,
		access: 'R'
	},
	{
		name: 'STATUS_WORD',
		area: ModbusAreaType.INPUT_REGISTERS,
		address: 4,
		dataType: 'uint16',
		description: 'Статусное слово (биты 0-7: IS_ONLINE, IS_WORKING, IS_EMERGENCY_STOP, TEMP_SENSOR_ERROR, PID_ACTIVE, FREEZE_PROTECTION, OVERHEAT_PROTECTION, VALVE_OPEN)',
		access: 'R'
	},
	
	// ========== HOLDING REGISTERS (Read/Write) - Уставки и команды ==========
	{
		name: 'SETPOINT_TEMP',
		area: ModbusAreaType.HOLDING_REGISTERS,
		address: 0,
		dataType: 'int16',
		description: 'Уставка температуры (x10)',
		scale: 10,
		access: 'RW'
	},
	{
		name: 'HYSTERESIS',
		area: ModbusAreaType.HOLDING_REGISTERS,
		address: 1,
		dataType: 'uint16',
		description: 'Гистерезис (x10)',
		scale: 10,
		access: 'RW'
	},
	{
		name: 'TEMP_LOW',
		area: ModbusAreaType.HOLDING_REGISTERS,
		address: 2,
		dataType: 'int16',
		description: 'Нижняя граница температуры (x10)',
		scale: 10,
		access: 'RW'
	},
	{
		name: 'TEMP_HIGH',
		area: ModbusAreaType.HOLDING_REGISTERS,
		address: 3,
		dataType: 'int16',
		description: 'Верхняя граница температуры (x10)',
		scale: 10,
		access: 'RW'
	},
	{
		name: 'TEMP_FREEZE_LIMIT',
		area: ModbusAreaType.HOLDING_REGISTERS,
		address: 4,
		dataType: 'int16',
		description: 'Защита от замерзания (x10)',
		scale: 10,
		access: 'RW'
	},
	{
		name: 'TEMP_OVERHEAT_LIMIT',
		area: ModbusAreaType.HOLDING_REGISTERS,
		address: 5,
		dataType: 'int16',
		description: 'Защита от перегрева (x10)',
		scale: 10,
		access: 'RW'
	},
	{
		name: 'COMMAND',
		area: ModbusAreaType.HOLDING_REGISTERS,
		address: 10,
		dataType: 'uint16',
		description: 'Команда управления',
		access: 'W'
	},
	{
		name: 'COMMAND_PARAM_1',
		area: ModbusAreaType.HOLDING_REGISTERS,
		address: 11,
		dataType: 'uint16',
		description: 'Параметр команды 1',
		access: 'W'
	},
	{
		name: 'COMMAND_PARAM_2',
		area: ModbusAreaType.HOLDING_REGISTERS,
		address: 12,
		dataType: 'uint16',
		description: 'Параметр команды 2',
		access: 'W'
	},
	{
		name: 'DEVICE_NAME',
		area: ModbusAreaType.HOLDING_REGISTERS,
		address: 20,
		dataType: 'string',
		length: 5,
		description: 'Имя устройства (10 байт, 5 регистров)',
		access: 'R'
	},
];

/**
 * Список устройств Heating для Modbus
 * Соответствует реальным устройствам ШУК1-ШУК20 из heating.config.ts
 */
export const MODBUS_HEATING_DEVICES: ModbusDeviceConfig[] = [
	{ deviceId: 'ШУК1', unitId: 1, enabled: true, description: 'ШУК1 - Управление отоплением 1' },
	{ deviceId: 'ШУК2', unitId: 2, enabled: true, description: 'ШУК2 - Управление отоплением 2' },
	{ deviceId: 'ШУК3', unitId: 3, enabled: true, description: 'ШУК3 - Управление отоплением 3' },
	{ deviceId: 'ШУК4', unitId: 4, enabled: true, description: 'ШУК4 - Управление отоплением 4' },
	{ deviceId: 'ШУК5', unitId: 5, enabled: true, description: 'ШУК5 - Управление отоплением 5' },
	{ deviceId: 'ШУК6', unitId: 6, enabled: true, description: 'ШУК6 - Управление отоплением 6' },
	{ deviceId: 'ШУК7', unitId: 7, enabled: true, description: 'ШУК7 - Управление отоплением 7' },
	{ deviceId: 'ШУК8', unitId: 8, enabled: true, description: 'ШУК8 - Управление отоплением 8' },
	{ deviceId: 'ШУК9', unitId: 9, enabled: true, description: 'ШУК9 - Управление отоплением 9' },
	{ deviceId: 'ШУК10', unitId: 10, enabled: true, description: 'ШУК10 - Управление отоплением 10' },
	{ deviceId: 'ШУК11', unitId: 11, enabled: true, description: 'ШУК11 - Управление отоплением 11' },
	{ deviceId: 'ШУК12', unitId: 12, enabled: true, description: 'ШУК12 - Управление отоплением 12' },
	{ deviceId: 'ШУК13', unitId: 13, enabled: true, description: 'ШУК13 - Управление отоплением 13' },
	{ deviceId: 'ШУК14', unitId: 14, enabled: true, description: 'ШУК14 - Управление отоплением 14' },
	{ deviceId: 'ШУК15', unitId: 15, enabled: true, description: 'ШУК15 - Управление отоплением 15' },
	{ deviceId: 'ШУК16', unitId: 16, enabled: true, description: 'ШУК16 - Управление отоплением 16' },
	{ deviceId: 'ШУК17', unitId: 17, enabled: true, description: 'ШУК17 - Управление отоплением 17' },
	{ deviceId: 'ШУК18', unitId: 18, enabled: true, description: 'ШУК18 - Управление отоплением 18' },
	{ deviceId: 'ШУК19', unitId: 19, enabled: true, description: 'ШУК19 - Управление отоплением 19' },
	{ deviceId: 'ШУК20', unitId: 20, enabled: true, description: 'ШУК20 - Управление отоплением 20' },
	// Резерв для дополнительных устройств
	{ deviceId: 'ШУК21', unitId: 21, enabled: false, description: 'ШУК21 - Резерв' },
	{ deviceId: 'ШУК22', unitId: 22, enabled: false, description: 'ШУК22 - Резерв' },
	{ deviceId: 'ШУК23', unitId: 23, enabled: false, description: 'ШУК23 - Резерв' },
	{ deviceId: 'ШУК24', unitId: 24, enabled: false, description: 'ШУК24 - Резерв' },
	{ deviceId: 'ШУК25', unitId: 25, enabled: false, description: 'ШУК25 - Резерв' },
	{ deviceId: 'ШУК26', unitId: 26, enabled: false, description: 'ШУК26 - Резерв' },
	{ deviceId: 'ШУК27', unitId: 27, enabled: false, description: 'ШУК27 - Резерв' },
	{ deviceId: 'ШУК28', unitId: 28, enabled: false, description: 'ШУК28 - Резерв' },
	{ deviceId: 'ШУК29', unitId: 29, enabled: false, description: 'ШУК29 - Резерв' },
	{ deviceId: 'ШУК30', unitId: 30, enabled: false, description: 'ШУК30 - Резерв' },
];

/**
 * Максимальное количество устройств (резерв)
 */
export const MAX_HEATING_DEVICES = 30;

/**
 * Порт Modbus TCP Slave для Heating
 */
export const MODBUS_HEATING_PORT = 8503;

/**
 * Размеры областей памяти для одного устройства (в регистрах/битах)
 */
export const MEMORY_SIZES = {
	DISCRETE_INPUTS: 16,      // 16 бит
	COILS: 16,                // 16 бит
	INPUT_REGISTERS: 10,      // 10 регистров (0-3: данные, 4: статусное слово, 5-9: резерв)
	HOLDING_REGISTERS: 30,    // 30 регистров
};

