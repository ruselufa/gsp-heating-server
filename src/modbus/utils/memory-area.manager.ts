import { ModbusAreaType, ModbusMemoryArea, ModbusMemoryMap } from '../interfaces/modbus.interface';
import { Logger } from '@nestjs/common';

/**
 * Менеджер областей памяти Modbus
 * Управляет 4 областями памяти для каждого Unit ID
 */
export class MemoryAreaManager {
	private readonly logger = new Logger(MemoryAreaManager.name);
	private memoryMaps: Map<number, ModbusMemoryMap> = new Map();

	/**
	 * Инициализировать карту памяти для Unit ID
	 * @param unitId - Modbus Unit ID
	 * @param deviceId - ID устройства
	 * @param sizes - размеры областей
	 */
	initializeMemoryMap(
		unitId: number,
		deviceId: string,
		sizes: {
			discreteInputs: number;
			coils: number;
			inputRegisters: number;
			holdingRegisters: number;
		}
	): void {
		if (this.memoryMaps.has(unitId)) {
			this.logger.warn(`Memory map for Unit ID ${unitId} already exists. Reinitializing...`);
		}

		const memoryMap: ModbusMemoryMap = {
			unitId,
			deviceId,
			discreteInputs: this.createArea(ModbusAreaType.DISCRETE_INPUTS, sizes.discreteInputs),
			coils: this.createArea(ModbusAreaType.COILS, sizes.coils),
			inputRegisters: this.createArea(ModbusAreaType.INPUT_REGISTERS, sizes.inputRegisters),
			holdingRegisters: this.createArea(ModbusAreaType.HOLDING_REGISTERS, sizes.holdingRegisters),
		};

		this.memoryMaps.set(unitId, memoryMap);
		this.logger.log(`Initialized memory map for Unit ID ${unitId} (${deviceId})`);
	}

	/**
	 * Создать область памяти
	 * @param areaType - тип области
	 * @param size - размер (в битах для битовых областей, в регистрах для 16-bit областей)
	 * @returns область памяти
	 */
	private createArea(areaType: ModbusAreaType, size: number): ModbusMemoryArea {
		let bufferSize: number;

		if (areaType === ModbusAreaType.DISCRETE_INPUTS || areaType === ModbusAreaType.COILS) {
			// Для битовых областей: size - количество битов, конвертируем в байты
			bufferSize = Math.ceil(size / 8);
		} else {
			// Для регистровых областей: size - количество регистров (16-bit), конвертируем в байты
			bufferSize = size * 2;
		}

		return {
			areaType,
			data: Buffer.alloc(bufferSize, 0),
			size,
		};
	}

	/**
	 * Получить карту памяти для Unit ID
	 * @param unitId - Modbus Unit ID
	 * @returns карта памяти или undefined
	 */
	getMemoryMap(unitId: number): ModbusMemoryMap | undefined {
		return this.memoryMaps.get(unitId);
	}

	/**
	 * Получить область памяти для Unit ID
	 * @param unitId - Modbus Unit ID
	 * @param areaType - тип области
	 * @returns область памяти или undefined
	 */
	getArea(unitId: number, areaType: ModbusAreaType): ModbusMemoryArea | undefined {
		const memoryMap = this.memoryMaps.get(unitId);
		if (!memoryMap) {
			return undefined;
		}

		switch (areaType) {
			case ModbusAreaType.DISCRETE_INPUTS:
				return memoryMap.discreteInputs;
			case ModbusAreaType.COILS:
				return memoryMap.coils;
			case ModbusAreaType.INPUT_REGISTERS:
				return memoryMap.inputRegisters;
			case ModbusAreaType.HOLDING_REGISTERS:
				return memoryMap.holdingRegisters;
		}
	}

	/**
	 * Записать бит в битовую область
	 * @param unitId - Modbus Unit ID
	 * @param areaType - тип области (DISCRETE_INPUTS или COILS)
	 * @param address - адрес бита (0-based)
	 * @param value - значение (true/false)
	 * @returns успешность операции
	 */
	writeBit(unitId: number, areaType: ModbusAreaType, address: number, value: boolean): boolean {
		const area = this.getArea(unitId, areaType);
		if (!area) {
			this.logger.error(`Area not found for Unit ID ${unitId}, area ${areaType}`);
			return false;
		}

		if (address < 0 || address >= area.size) {
			this.logger.error(`Invalid address ${address} for area ${areaType} (size: ${area.size})`);
			return false;
		}

		const byteIndex = Math.floor(address / 8);
		const bitOffset = address % 8;

		if (value) {
			// Установить бит в 1
			area.data[byteIndex] |= (1 << bitOffset);
		} else {
			// Установить бит в 0
			area.data[byteIndex] &= ~(1 << bitOffset);
		}

		return true;
	}

	/**
	 * Прочитать бит из битовой области
	 * @param unitId - Modbus Unit ID
	 * @param areaType - тип области (DISCRETE_INPUTS или COILS)
	 * @param address - адрес бита (0-based)
	 * @returns значение бита или undefined
	 */
	readBit(unitId: number, areaType: ModbusAreaType, address: number): boolean | undefined {
		const area = this.getArea(unitId, areaType);
		if (!area) {
			return undefined;
		}

		if (address < 0 || address >= area.size) {
			return undefined;
		}

		const byteIndex = Math.floor(address / 8);
		const bitOffset = address % 8;

		return ((area.data[byteIndex] >> bitOffset) & 1) === 1;
	}

	/**
	 * Записать регистр (16-bit) в регистровую область
	 * @param unitId - Modbus Unit ID
	 * @param areaType - тип области (INPUT_REGISTERS или HOLDING_REGISTERS)
	 * @param address - адрес регистра (0-based)
	 * @param value - значение (0-65535)
	 * @returns успешность операции
	 */
	writeRegister(unitId: number, areaType: ModbusAreaType, address: number, value: number): boolean {
		const area = this.getArea(unitId, areaType);
		if (!area) {
			this.logger.error(`Area not found for Unit ID ${unitId}, area ${areaType}`);
			return false;
		}

		if (address < 0 || address >= area.size) {
			this.logger.error(`Invalid address ${address} for area ${areaType} (size: ${area.size})`);
			return false;
		}

		// Записываем 16-bit значение (Big Endian)
		const byteIndex = address * 2;
		area.data.writeUInt16BE(value & 0xFFFF, byteIndex);

		return true;
	}

	/**
	 * Прочитать регистр (16-bit) из регистровой области
	 * @param unitId - Modbus Unit ID
	 * @param areaType - тип области (INPUT_REGISTERS или HOLDING_REGISTERS)
	 * @param address - адрес регистра (0-based)
	 * @returns значение регистра или undefined
	 */
	readRegister(unitId: number, areaType: ModbusAreaType, address: number): number | undefined {
		const area = this.getArea(unitId, areaType);
		if (!area) {
			return undefined;
		}

		if (address < 0 || address >= area.size) {
			return undefined;
		}

		// Читаем 16-bit значение (Big Endian)
		const byteIndex = address * 2;
		return area.data.readUInt16BE(byteIndex);
	}

	/**
	 * Прочитать несколько регистров
	 * @param unitId - Modbus Unit ID
	 * @param areaType - тип области
	 * @param startAddress - начальный адрес
	 * @param count - количество регистров
	 * @returns массив значений или undefined
	 */
	readRegisters(unitId: number, areaType: ModbusAreaType, startAddress: number, count: number): number[] | undefined {
		const values: number[] = [];
		for (let i = 0; i < count; i++) {
			const value = this.readRegister(unitId, areaType, startAddress + i);
			if (value === undefined) {
				return undefined;
			}
			values.push(value);
		}
		return values;
	}

	/**
	 * Записать несколько регистров
	 * @param unitId - Modbus Unit ID
	 * @param areaType - тип области
	 * @param startAddress - начальный адрес
	 * @param values - массив значений
	 * @returns успешность операции
	 */
	writeRegisters(unitId: number, areaType: ModbusAreaType, startAddress: number, values: number[]): boolean {
		for (let i = 0; i < values.length; i++) {
			if (!this.writeRegister(unitId, areaType, startAddress + i, values[i])) {
				return false;
			}
		}
		return true;
	}

	/**
	 * Получить ID устройства по Unit ID
	 * @param unitId - Modbus Unit ID
	 * @returns ID устройства или undefined
	 */
	getDeviceId(unitId: number): string | undefined {
		return this.memoryMaps.get(unitId)?.deviceId;
	}

	/**
	 * Получить список всех Unit ID
	 * @returns массив Unit ID
	 */
	getAllUnitIds(): number[] {
		return Array.from(this.memoryMaps.keys());
	}

	/**
	 * Очистить все карты памяти
	 */
	clearAll(): void {
		this.memoryMaps.clear();
		this.logger.log('All memory maps cleared');
	}

	/**
	 * Удалить карту памяти для Unit ID
	 * @param unitId - Modbus Unit ID
	 */
	removeMemoryMap(unitId: number): void {
		this.memoryMaps.delete(unitId);
		this.logger.log(`Removed memory map for Unit ID ${unitId}`);
	}
}

