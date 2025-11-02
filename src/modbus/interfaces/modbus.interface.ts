/**
 * Интерфейсы и типы для Modbus TCP Slave
 */

// Типы областей памяти Modbus
export enum ModbusAreaType {
	DISCRETE_INPUTS = 'discrete_inputs',    // Read-only биты (FC02)
	COILS = 'coils',                        // Read/Write биты (FC01, FC05, FC15)
	INPUT_REGISTERS = 'input_registers',    // Read-only 16-bit (FC04)
	HOLDING_REGISTERS = 'holding_registers' // Read/Write 16-bit (FC03, FC06, FC16)
}

// Типы данных
export type ModbusDataType = 'bit' | 'uint16' | 'int16' | 'string';

// Права доступа
export type ModbusAccess = 'R' | 'W' | 'RW';

// Описание одной переменной в карте Modbus
export interface ModbusVariable {
	name: string;              // Имя переменной (например: 'IS_ONLINE')
	area: ModbusAreaType;      // Область памяти
	address: number;           // Адрес в области (0-based)
	dataType: ModbusDataType;  // Тип данных
	bitOffset?: number;        // Для битовых полей: смещение бита (0-15)
	length?: number;           // Для строк: количество регистров
	description: string;       // Описание для документации
	scale?: number;            // Множитель (например: 10 для температуры x10)
	access: ModbusAccess;      // Доступ: R, W, RW
}

// Конфигурация одного устройства для Modbus
export interface ModbusDeviceConfig {
	deviceId: string;          // ID устройства (например: 'HT01')
	unitId: number;            // Modbus Unit ID (1-247)
	enabled: boolean;          // Включено ли устройство
	description?: string;      // Описание устройства
}

// Команды управления
export enum ModbusCommand {
	NOP = 0,                   // Нет операции
	ENABLE_AUTO_CONTROL = 1,   // Включить автоуправление
	DISABLE_AUTO_CONTROL = 2,  // Выключить автоуправление
	SET_TEMPERATURE = 3,       // Установить уставку температуры
	SET_FAN_SPEED = 4,         // Установить скорость вентилятора
	EMERGENCY_STOP = 5,        // Аварийная остановка
	RESET_EMERGENCY = 6        // Сброс аварийной остановки
}

// Параметры команды
export interface ModbusCommandParams {
	command: ModbusCommand;
	param1?: number;
	param2?: number;
}

// Область памяти Modbus
export interface ModbusMemoryArea {
	areaType: ModbusAreaType;
	data: Buffer;              // Буфер данных области
	size: number;              // Размер в байтах (или битах для битовых областей)
}

// Карта памяти для одного Unit ID
export interface ModbusMemoryMap {
	unitId: number;
	deviceId: string;
	discreteInputs: ModbusMemoryArea;
	coils: ModbusMemoryArea;
	inputRegisters: ModbusMemoryArea;
	holdingRegisters: ModbusMemoryArea;
}

// Результат операции Modbus
export interface ModbusOperationResult {
	success: boolean;
	error?: string;
	data?: any;
}

// События синхронизации
export interface ModbusSyncEvent {
	unitId: number;
	deviceId: string;
	area: ModbusAreaType;
	address: number;
	value: any;
	timestamp: number;
}

