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

// Команды управления (битовое слово)
// Регистр 10 используется как управляющее слово, где каждый бит означает команду:
// Бит 0 (1)   - зарезервировано
// Бит 1 (2)   - ENABLE_AUTO_CONTROL (включить автоуправление)
// Бит 2 (4)   - DISABLE_AUTO_CONTROL (выключить автоуправление)
// Бит 3-15    - зарезервированы
export enum ModbusCommand {
	NOP = 0,                   // Нет операции (все биты = 0)
	ENABLE_AUTO_CONTROL = 2,   // Бит 1 (значение 2) - Включить автоуправление
	DISABLE_AUTO_CONTROL = 4   // Бит 2 (значение 4) - Выключить автоуправление
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

