import { Logger } from '@nestjs/common';
import { ModbusVariable, ModbusDeviceConfig, ModbusAreaType } from './interfaces/modbus.interface';
import { MemoryAreaManager } from './utils/memory-area.manager';
import { HeatingState } from '../devices/interfaces/heating.interface';
import { 
	setBit, 
	getBit, 
	toInt16, 
	toUint16, 
	fromInt16,
	applyScale,
	removeScale,
	stringToRegisters,
	registersToString
} from './utils/bit-field.utils';

/**
 * Маппер для связи внутреннего состояния Heating с Modbus регистрами
 */
export class ModbusRegistersMapper {
	private readonly logger = new Logger(ModbusRegistersMapper.name);
	private memoryManager: MemoryAreaManager;
	private variablesTemplate: ModbusVariable[];
	private devicesConfig: ModbusDeviceConfig[];
	private deviceIdToUnitId: Map<string, number> = new Map();
	private unitIdToDeviceId: Map<number, string> = new Map();

	constructor(
		variablesTemplate: ModbusVariable[],
		devicesConfig: ModbusDeviceConfig[],
		memoryManager: MemoryAreaManager
	) {
		this.variablesTemplate = variablesTemplate;
		this.devicesConfig = devicesConfig;
		this.memoryManager = memoryManager;

		// Создаем маппинг deviceId <-> unitId
		for (const device of devicesConfig) {
			if (device.enabled) {
				this.deviceIdToUnitId.set(device.deviceId, device.unitId);
				this.unitIdToDeviceId.set(device.unitId, device.deviceId);
			}
		}

		this.logger.log(`Mapper initialized with ${devicesConfig.filter(d => d.enabled).length} enabled devices`);
	}

	/**
	 * Получить Unit ID по device ID
	 */
	getUnitId(deviceId: string): number | undefined {
		return this.deviceIdToUnitId.get(deviceId);
	}

	/**
	 * Получить device ID по Unit ID
	 */
	getDeviceId(unitId: number): string | undefined {
		return this.unitIdToDeviceId.get(unitId);
	}

	/**
	 * Синхронизировать состояние Heating в Modbus регистры
	 * @param deviceId - ID устройства
	 * @param state - состояние Heating
	 */
	syncHeatingStateToModbus(deviceId: string, state: HeatingState): void {
		const unitId = this.getUnitId(deviceId);
		if (unitId === undefined) {
			this.logger.warn(`Device ${deviceId} not found in config or disabled`);
			return;
		}

		this.logger.debug(`Syncing ${deviceId} (Unit ID: ${unitId}) to Modbus - temp: ${state.currentTemperature}°C, setpoint: ${state.setpointTemperature}°C`);

		try {
			// ========== DISCRETE INPUTS (Read Only) - Статусы ==========
			this.syncDiscreteInputs(unitId, state);

			// ========== COILS (Read/Write) - Управление ==========
			this.syncCoils(unitId, state);

			// ========== INPUT REGISTERS (Read Only) - Датчики ==========
			this.syncInputRegisters(unitId, state);

			// ========== HOLDING REGISTERS (Read/Write) - Уставки ==========
			this.syncHoldingRegisters(unitId, state, deviceId);

			this.logger.debug(`Successfully synced ${deviceId} to Modbus`);
		} catch (error) {
			this.logger.error(`Error syncing state to Modbus for ${deviceId}: ${error.message}`);
		}
	}

	/**
	 * Синхронизация Discrete Inputs (статусные биты)
	 */
	private syncDiscreteInputs(unitId: number, state: HeatingState): void {
		// Упаковываем статусы в одно 16-битное слово по адресу 0
		let statusWord = 0;

		// Бит 0: IS_ONLINE
		statusWord = setBit(statusWord, 0, state.isOnline ?? false);

		// Бит 1: IS_WORKING
		statusWord = setBit(statusWord, 1, state.isWorking ?? false);

		// Бит 2: IS_EMERGENCY_STOP
		statusWord = setBit(statusWord, 2, state.isEmergencyStop ?? false);

		// Бит 3: TEMP_SENSOR_ERROR (пока false, можно добавить логику проверки)
		statusWord = setBit(statusWord, 3, false);

		// Бит 4: PID_ACTIVE (проверяем, что автоконтроль включен)
		statusWord = setBit(statusWord, 4, state.autoControlEnabled ?? false);

		// Бит 5: FREEZE_PROTECTION (можно добавить логику)
		statusWord = setBit(statusWord, 5, false);

		// Бит 6: OVERHEAT_PROTECTION (можно добавить логику)
		statusWord = setBit(statusWord, 6, false);

		// Бит 7: VALVE_OPEN
		statusWord = setBit(statusWord, 7, state.valveState === 'open');

		// Записываем все биты (0-15) в область DISCRETE_INPUTS
		for (let bit = 0; bit < 16; bit++) {
			this.memoryManager.writeBit(unitId, ModbusAreaType.DISCRETE_INPUTS, bit, getBit(statusWord, bit));
		}
	}

	/**
	 * Синхронизация Coils (управляющие биты)
	 */
	private syncCoils(unitId: number, state: HeatingState): void {
		// Бит 0: AUTO_CONTROL_ENABLED
		this.memoryManager.writeBit(unitId, ModbusAreaType.COILS, 0, state.autoControlEnabled ?? false);

		// Бит 1: MANUAL_OVERRIDE (пока false, можно расширить)
		this.memoryManager.writeBit(unitId, ModbusAreaType.COILS, 1, false);
	}

	/**
	 * Синхронизация Input Registers (датчики)
	 */
	private syncInputRegisters(unitId: number, state: HeatingState): void {
		// Адрес 0: CURRENT_TEMP (x10)
		const currentTemp = toInt16(applyScale(state.currentTemperature ?? 0, 10));
		this.logger.debug(`Writing to Unit ${unitId} Input Register 0: ${currentTemp} (temp=${state.currentTemperature}°C)`);
		this.memoryManager.writeRegister(unitId, ModbusAreaType.INPUT_REGISTERS, 0, currentTemp);
		
		// Проверяем, что записалось правильно
		const writtenValue = this.memoryManager.readRegister(unitId, ModbusAreaType.INPUT_REGISTERS, 0);
		if (writtenValue !== currentTemp) {
			this.logger.error(`❌ Unit ${unitId}: Written ${currentTemp} but read back ${writtenValue}!`);
		}

		// Адрес 1: CURRENT_FAN_SPEED
		const fanSpeed = toUint16(state.currentFanSpeed ?? 0);
		this.memoryManager.writeRegister(unitId, ModbusAreaType.INPUT_REGISTERS, 1, fanSpeed);

		// Адрес 2: VALVE_STATE (0=закрыт, 1=открыт)
		const valveState = toUint16(state.valveState === 'open' ? 1 : 0);
		this.memoryManager.writeRegister(unitId, ModbusAreaType.INPUT_REGISTERS, 2, valveState);

		// Адрес 3: PID_OUTPUT (x10)
		const pidOutput = toInt16(applyScale(state.pidOutput ?? 0, 10));
		this.memoryManager.writeRegister(unitId, ModbusAreaType.INPUT_REGISTERS, 3, pidOutput);

		// Адрес 4: STATUS_WORD (статусное слово для чтения по битам)
		// Формируем статусное слово из тех же битов, что и в Discrete Inputs
		let statusWord = 0;
		statusWord = setBit(statusWord, 0, state.isOnline ?? false);                    // IS_ONLINE
		statusWord = setBit(statusWord, 1, state.isWorking ?? false);                 // IS_WORKING
		statusWord = setBit(statusWord, 2, state.isEmergencyStop ?? false);           // IS_EMERGENCY_STOP
		statusWord = setBit(statusWord, 3, false);                                     // TEMP_SENSOR_ERROR (можно добавить логику)
		statusWord = setBit(statusWord, 4, state.autoControlEnabled ?? false);       // PID_ACTIVE
		statusWord = setBit(statusWord, 5, false);                                      // FREEZE_PROTECTION (можно добавить логику)
		statusWord = setBit(statusWord, 6, false);                                      // OVERHEAT_PROTECTION (можно добавить логику)
		statusWord = setBit(statusWord, 7, state.valveState === 'open');               // VALVE_OPEN
		// Биты 8-15: резерв (0)
		
		this.memoryManager.writeRegister(unitId, ModbusAreaType.INPUT_REGISTERS, 4, statusWord);
	}

	/**
	 * Синхронизация Holding Registers (уставки)
	 */
	private syncHoldingRegisters(unitId: number, state: HeatingState, deviceId: string): void {
		// Адрес 0: SETPOINT_TEMP (x10)
		const setpoint = toInt16(applyScale(state.setpointTemperature ?? 20, 10));
		this.memoryManager.writeRegister(unitId, ModbusAreaType.HOLDING_REGISTERS, 0, setpoint);

		// Адрес 1: HYSTERESIS (x10) - берем из pidState или используем значение по умолчанию
		const hysteresis = toUint16(applyScale(0.5, 10)); // 0.5°C по умолчанию
		this.memoryManager.writeRegister(unitId, ModbusAreaType.HOLDING_REGISTERS, 1, hysteresis);

		// Адреса 2-5: температурные лимиты (используем стандартные значения)
		this.memoryManager.writeRegister(unitId, ModbusAreaType.HOLDING_REGISTERS, 2, toInt16(applyScale(15, 10))); // TEMP_LOW
		this.memoryManager.writeRegister(unitId, ModbusAreaType.HOLDING_REGISTERS, 3, toInt16(applyScale(30, 10))); // TEMP_HIGH
		this.memoryManager.writeRegister(unitId, ModbusAreaType.HOLDING_REGISTERS, 4, toInt16(applyScale(5, 10)));  // TEMP_FREEZE_LIMIT
		this.memoryManager.writeRegister(unitId, ModbusAreaType.HOLDING_REGISTERS, 5, toInt16(applyScale(35, 10))); // TEMP_OVERHEAT_LIMIT

		// Адрес 10: COMMAND регистр (битовое управляющее слово)
		// Бит 1 (2) = ENABLE_AUTO_CONTROL, Бит 2 (4) = DISABLE_AUTO_CONTROL
		// Регистр очищается автоматически после выполнения команды
		// Адреса 11-12: не используются для битовых команд

		// Адреса 20-24: DEVICE_NAME (строка)
		const deviceName = deviceId;
		const nameRegisters = stringToRegisters(deviceName, 5);
		this.memoryManager.writeRegisters(unitId, ModbusAreaType.HOLDING_REGISTERS, 20, nameRegisters);
	}

	/**
	 * Прочитать значение из Holding Register и синхронизировать с HeatingService
	 * @param unitId - Unit ID
	 * @param address - адрес регистра
	 * @param value - новое значение
	 * @returns объект с параметрами для обновления или null
	 */
	readHoldingRegisterChange(unitId: number, address: number, value: number): {
		deviceId: string;
		parameter: string;
		value: any;
	} | null {
		const deviceId = this.getDeviceId(unitId);
		if (!deviceId) {
			return null;
		}

		// Обрабатываем изменения в Holding Registers
		switch (address) {
			case 0: // SETPOINT_TEMP
				const rawValue = value;
				const int16Value = fromInt16(rawValue);
				const temperature = removeScale(int16Value, 10);
				this.logger.debug(`SETPOINT_TEMP conversion: raw=${rawValue}, int16=${int16Value}, temp=${temperature}°C`);
				
				// Валидация преобразованного значения
				if (isNaN(temperature) || !isFinite(temperature)) {
					this.logger.error(`Invalid temperature after conversion: raw=${rawValue}, temp=${temperature}`);
					return null;
				}
				
				return {
					deviceId,
					parameter: 'setpointTemperature',
					value: temperature
				};

			case 1: // HYSTERESIS
				return {
					deviceId,
					parameter: 'hysteresis',
					value: removeScale(value, 10)
				};

			// Адреса 2-5 (лимиты температур) пока не обрабатываем

			default:
				return null;
		}
	}

	/**
	 * Прочитать изменение Coil и синхронизировать
	 * @param unitId - Unit ID
	 * @param address - адрес бита
	 * @param value - новое значение
	 * @returns объект с параметрами для обновления или null
	 */
	readCoilChange(unitId: number, address: number, value: boolean): {
		deviceId: string;
		parameter: string;
		value: any;
	} | null {
		const deviceId = this.getDeviceId(unitId);
		if (!deviceId) {
			return null;
		}

		switch (address) {
			case 0: // AUTO_CONTROL_ENABLED
				return {
					deviceId,
					parameter: 'autoControlEnabled',
					value
				};

			case 1: // MANUAL_OVERRIDE
				return {
					deviceId,
					parameter: 'manualOverride',
					value
				};

			default:
				return null;
		}
	}

	/**
	 * Прочитать команду из COMMAND регистра (битовое управляющее слово)
	 * @param unitId - Unit ID
	 * @returns объект команды или null
	 */
	readCommand(unitId: number): {
		deviceId: string;
		command: number;
		param1: number;
		param2: number;
	} | null {
		const deviceId = this.getDeviceId(unitId);
		if (!deviceId) {
			return null;
		}

		const commandWord = this.memoryManager.readRegister(unitId, ModbusAreaType.HOLDING_REGISTERS, 10) ?? 0;
		const param1 = this.memoryManager.readRegister(unitId, ModbusAreaType.HOLDING_REGISTERS, 11) ?? 0;
		const param2 = this.memoryManager.readRegister(unitId, ModbusAreaType.HOLDING_REGISTERS, 12) ?? 0;

		if (commandWord === 0) {
			return null; // NOP (все биты = 0)
		}

		// Определяем команду на основе установленных битов
		// Бит 1 (2) = ENABLE_AUTO_CONTROL
		// Бит 2 (4) = DISABLE_AUTO_CONTROL
		let command: number = 0;
		
		if (commandWord & 4) {
			// Бит 2 установлен = DISABLE_AUTO_CONTROL (приоритет выше)
			command = 4; // DISABLE_AUTO_CONTROL
		} else if (commandWord & 2) {
			// Бит 1 установлен = ENABLE_AUTO_CONTROL
			command = 2; // ENABLE_AUTO_CONTROL
		} else {
			// Другие биты - неизвестная команда
			return null;
		}

		return {
			deviceId,
			command,
			param1, // Не используются для битовых команд
			param2  // Не используются для битовых команд
		};
	}

	/**
	 * Сбросить COMMAND регистр после выполнения
	 * @param unitId - Unit ID
	 */
	clearCommand(unitId: number): void {
		this.memoryManager.writeRegister(unitId, ModbusAreaType.HOLDING_REGISTERS, 10, 0);
	}
}

