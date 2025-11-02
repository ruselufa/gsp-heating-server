import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as jsmodbus from 'jsmodbus';
import * as net from 'net';
import { 
	HEATING_VARIABLES_TEMPLATE, 
	MODBUS_HEATING_DEVICES, 
	MODBUS_HEATING_PORT,
	MEMORY_SIZES 
} from './config/modbus-heating.config';
import { MemoryAreaManager } from './utils/memory-area.manager';
import { ModbusRegistersMapper } from './modbus-registers.mapper';
import { ModbusCommand, ModbusAreaType } from './interfaces/modbus.interface';
import { HeatingService } from '../devices/heating/heating.service';

/**
 * Modbus TCP Slave сервис для Heating системы
 * Порт: 8503
 * Поддерживает функции: FC01, FC02, FC03, FC04, FC05, FC06, FC15, FC16
 */
@Injectable()
export class ModbusSlaveService implements OnModuleInit, OnModuleDestroy {
	private readonly logger = new Logger(ModbusSlaveService.name);
	private netServer: net.Server;
	private modbusServer: any; // jsmodbus.server.TCP instance
	private memoryManager: MemoryAreaManager;
	private mapper: ModbusRegistersMapper;
	private isRunning = false;
	private commandCheckInterval: NodeJS.Timeout;

	constructor(
		private readonly eventEmitter: EventEmitter2,
		private readonly heatingService: HeatingService,
	) {
		this.memoryManager = new MemoryAreaManager();
		this.mapper = new ModbusRegistersMapper(
			HEATING_VARIABLES_TEMPLATE,
			MODBUS_HEATING_DEVICES,
			this.memoryManager
		);
	}

	async onModuleInit() {
		this.logger.log('🔧 Initializing Modbus TCP Slave Service...');

		// Инициализируем карты памяти для всех включенных устройств
		this.initializeMemoryMaps();

		// Создаем и запускаем Modbus TCP Server
		await this.startModbusServer();

		// Подписываемся на события изменения состояния Heating
		this.subscribeToHeatingEvents();

		// Запускаем периодическую проверку команд
		this.startCommandPolling();

		// Выполняем начальную синхронизацию состояний
		await this.initialSync();

		this.logger.log('✅ Modbus TCP Slave Service initialized successfully');
	}

	async onModuleDestroy() {
		this.logger.log('🛑 Shutting down Modbus TCP Slave Service...');
		this.isRunning = false;

		if (this.commandCheckInterval) {
			clearInterval(this.commandCheckInterval);
		}

		if (this.netServer) {
			try {
				this.netServer.close();
				this.logger.log('Modbus TCP Server closed');
			} catch (error) {
				this.logger.error(`Error closing Modbus server: ${error.message}`);
			}
		}
	}

	/**
	 * Инициализация карт памяти для всех устройств
	 */
	private initializeMemoryMaps(): void {
		for (const device of MODBUS_HEATING_DEVICES) {
			if (device.enabled) {
				this.memoryManager.initializeMemoryMap(
					device.unitId,
					device.deviceId,
					{
						discreteInputs: MEMORY_SIZES.DISCRETE_INPUTS,
						coils: MEMORY_SIZES.COILS,
						inputRegisters: MEMORY_SIZES.INPUT_REGISTERS,
						holdingRegisters: MEMORY_SIZES.HOLDING_REGISTERS,
					}
				);
				this.logger.log(`Memory map initialized for ${device.deviceId} (Unit ID: ${device.unitId})`);
			}
		}
	}

	/**
	 * Запуск Modbus TCP Server с использованием jsmodbus
	 */
	private async startModbusServer(): Promise<void> {
		return new Promise((resolve, reject) => {
			try {
				// Создаем TCP сервер
				this.netServer = net.createServer();
				
				// Логируем входящие TCP данные и обрабатываем напрямую (jsmodbus передает пустой Buffer)
				this.netServer.on('connection', (socket) => {
					this.logger.debug(`📡 New Modbus TCP connection from ${socket.remoteAddress}:${socket.remotePort}`);
					
					// Сохраняем оригинальный обработчик данных для диагностики
					const originalDataHandler = socket.listeners('data')[0];
					socket.on('data', (data: Buffer) => {
						// Логируем ВСЕ запросы для диагностики
						if (data.length >= 8) {
							const functionCode = data.readUInt8(7);
							const unitId = data.readUInt8(6);
							
							// Логируем запросы на чтение (FC04, FC03)
							if (functionCode === 4 || functionCode === 3) {
								const address = data.length >= 10 ? data.readUInt16BE(8) : 0;
								const quantity = data.length >= 12 ? data.readUInt16BE(10) : 0;
								this.logger.log(`📖 Raw TCP REQUEST - Unit=${unitId}, FC=${functionCode}, Addr=${address}, Qty=${quantity}`);
								
								// Проверяем, что в буфере jsmodbus правильные данные (для FC04 с учетом сквозной адресации)
								if (functionCode === 4 && quantity >= 1) {
									// Преобразуем сквозной адрес в Unit ID и относительный адрес
									const { unitId: actualUnitId, relativeAddress } = this.getUnitIdFromInputRegisterAddress(address);
									const deviceId = this.mapper.getDeviceId(actualUnitId);
									
									// Вычисляем адрес в буфере jsmodbus (сквозной адрес * 2 байта)
									const bufferOffset = address * 2;
									const bufferValue = this.modbusServer?.input ? this.modbusServer.input.readUInt16BE(bufferOffset) : 0;
									this.logger.log(`  🔍 FC04 Check: Raw Addr=${address} → Unit ${actualUnitId} (${deviceId ?? 'unknown'}), Rel Addr=${relativeAddress}, Buffer offset ${bufferOffset} = ${bufferValue} (${bufferValue / 10}°C)`);
								}
							}
							
							// Логируем запросы на запись (FC16 или FC06)
							if (functionCode === 16 || functionCode === 6) {
								this.logger.log(`📥 Raw TCP data - Unit=${unitId}, FC=${functionCode}, Size=${data.length} bytes`);
								
								if (functionCode === 16 && data.length >= 13) {
									const address = data.readUInt16BE(8);
									const quantity = data.readUInt16BE(10);
									const byteCount = data.readUInt8(12); // Byte Count - это 1 байт!
									this.logger.log(`   📝 FC16 Details: Addr=${address}, Qty=${quantity}, ByteCount=${byteCount}`);
									
									// Извлекаем значения из raw TCP данных
									if (data.length >= 13 + byteCount && quantity <= 100) {
										const values: number[] = [];
										for (let i = 0; i < quantity && (13 + i * 2 + 2) <= data.length; i++) {
											const offset = 13 + (i * 2);
											values.push(data.readUInt16BE(offset));
										}
										
										this.logger.log(`   📊 Extracted ${values.length} values: [${values.join(', ')}]`);
										
										// Обрабатываем запрос напрямую из raw TCP данных (jsmodbus передает пустой Buffer)
										// Преобразуем сквозной адрес в Unit ID и относительный адрес
										const { unitId: actualUnitId, relativeAddress: baseRelativeAddress } = this.getUnitIdFromHoldingRegisterAddress(address);
										const deviceId = this.mapper.getDeviceId(actualUnitId);
										
										this.logger.log(`✅ Processing FC16 from raw TCP data - Raw Addr=${address}, Unit=${unitId} → Actual Unit=${actualUnitId} (${deviceId ?? 'unknown'}), Relative Addr=${baseRelativeAddress}, Value=${values[0]}`);
										try {
											for (let i = 0; i < values.length && i < quantity; i++) {
												const relativeAddr = baseRelativeAddress + i;
												const regValue = values[i];
												
												// Проверяем границы
												if (relativeAddr >= 30) {
													this.logger.warn(`  ⚠️  Address ${address + i} is out of bounds for device ${actualUnitId} (max 30 registers)`);
													continue;
												}
												
												this.memoryManager.writeRegister(actualUnitId, ModbusAreaType.HOLDING_REGISTERS, relativeAddr, regValue);
												
												const change = this.mapper.readHoldingRegisterChange(actualUnitId, relativeAddr, regValue);
												if (change) {
													this.logger.log(`  🔄 Applying change: ${change.deviceId}.${change.parameter} = ${change.value}`);
													try {
														this.applyHeatingChange(change.deviceId, change.parameter, change.value);
													} catch (changeError) {
														this.logger.error(`  ❌ Error applying change: ${changeError.message}`);
													}
												}
												
												// Проверяем команду (относительный адрес 10)
												if (relativeAddr === 10) {
													this.processCommand(actualUnitId);
												}
											}
											this.logger.log(`✅ Successfully processed FC16 from raw TCP data`);
										} catch (error) {
											this.logger.error(`❌ Error processing FC16 from raw TCP: ${error.message}`);
										}
									}
								} else if (functionCode === 6 && data.length >= 10) {
									const address = data.readUInt16BE(8);
									const value = data.readUInt16BE(10);
									this.logger.log(`   📝 FC06 Details: Addr=${address}, Value=${value}`);
									
									// Преобразуем сквозной адрес в Unit ID и относительный адрес
									const { unitId: actualUnitId, relativeAddress } = this.getUnitIdFromHoldingRegisterAddress(address);
									const deviceId = this.mapper.getDeviceId(actualUnitId);
									
									// Обрабатываем FC06 напрямую
									this.logger.log(`✅ Processing FC06 from raw TCP data - Raw Addr=${address}, Unit=${unitId} → Actual Unit=${actualUnitId} (${deviceId ?? 'unknown'}), Relative Addr=${relativeAddress}, Value=${value}`);
									try {
										// Проверяем границы
										if (relativeAddress >= 30) {
											this.logger.warn(`  ⚠️  Address ${address} is out of bounds for device ${actualUnitId} (max 30 registers)`);
											return;
										}
										
										this.memoryManager.writeRegister(actualUnitId, ModbusAreaType.HOLDING_REGISTERS, relativeAddress, value);
										
										const change = this.mapper.readHoldingRegisterChange(actualUnitId, relativeAddress, value);
										if (change) {
											this.logger.log(`  🔄 Applying change: ${change.deviceId}.${change.parameter} = ${change.value}`);
											try {
												this.applyHeatingChange(change.deviceId, change.parameter, change.value);
											} catch (changeError) {
												this.logger.error(`  ❌ Error applying change: ${changeError.message}`);
											}
										}
										
										// Проверяем команду (относительный адрес 10)
										if (relativeAddress === 10) {
											this.processCommand(actualUnitId);
										}
										
										this.logger.log(`✅ Successfully processed FC06 from raw TCP data`);
									} catch (error) {
										this.logger.error(`❌ Error processing FC06 from raw TCP: ${error.message}`);
									}
								}
							}
						}
						
						// Вызываем оригинальный обработчик, если он есть
						if (originalDataHandler && typeof originalDataHandler === 'function') {
							originalDataHandler.call(socket, data);
						}
					});
				});

				// Создаем Modbus server
				this.modbusServer = new jsmodbus.server.TCP(this.netServer, {
					coils: Buffer.alloc(8192),
					discrete: Buffer.alloc(8192),
					holding: Buffer.alloc(8192 * 2),
					input: Buffer.alloc(8192 * 2),
				});

				// FC01: Read Coils
				this.modbusServer.on('readCoils', (request, response) => {
					this.handleReadCoils(request, response);
				});

				// FC02: Read Discrete Inputs
				this.modbusServer.on('readDiscreteInputs', (request, response) => {
					this.handleReadDiscreteInputs(request, response);
				});

				// FC03: Read Holding Registers
				this.modbusServer.on('readHoldingRegisters', (request, response) => {
					this.handleReadHoldingRegisters(request, response);
				});

				// FC04: Read Input Registers
				this.modbusServer.on('readInputRegisters', (request, response) => {
					this.handleReadInputRegisters(request, response);
				});

				// FC05: Write Single Coil
				this.modbusServer.on('writeSingleCoil', (request, response) => {
					this.handleWriteSingleCoil(request, response);
				});

				// FC06: Write Single Register
				this.modbusServer.on('writeSingleRegister', (request, response) => {
					this.handleWriteSingleRegister(request, response);
				});

				// FC15: Write Multiple Coils
				this.modbusServer.on('writeMultipleCoils', (request, response) => {
					this.handleWriteMultipleCoils(request, response);
				});

				// FC16: Write Multiple Registers
				this.modbusServer.on('writeMultipleRegisters', (request, response) => {
					this.handleWriteMultipleRegisters(request, response);
				});

				// Запускаем сервер на указанном порту
				this.netServer.listen(MODBUS_HEATING_PORT, '0.0.0.0', () => {
					this.isRunning = true;
					this.logger.log(`🚀 Modbus TCP Server started on port ${MODBUS_HEATING_PORT}`);
					resolve();
				});

				this.netServer.on('error', (error) => {
					this.logger.error(`Modbus Server Error: ${error.message}`);
					reject(error);
				});

			} catch (error) {
				this.logger.error(`Failed to start Modbus TCP Server: ${error.message}`);
				reject(error);
			}
		});
	}

	/**
	 * FC01: Read Coils
	 */
	private handleReadCoils(request: any, response: any): void {
		const { address, quantity, unitId } = request.body;
		this.logger.debug(`FC01: Read Coils - Unit ${unitId}, Addr ${address}, Qty ${quantity}`);

		try {
			const values: boolean[] = [];
			for (let i = 0; i < quantity; i++) {
				const value = this.memoryManager.readBit(unitId, ModbusAreaType.COILS, address + i);
				values.push(value ?? false);
			}

			response.body.valuesAsArray = values;
			response.body.valuesAsBuffer = this.boolArrayToBuffer(values);
		} catch (error) {
			this.logger.error(`Error reading coils: ${error.message}`);
			response.body.valuesAsArray = [];
		}
	}

	/**
	 * FC02: Read Discrete Inputs
	 * В Modbus биты читаются по адресам: адрес 0 = биты 0-15, адрес 1 = биты 16-31, и т.д.
	 * Но для удобства в OPC можно читать отдельные биты по адресам 0-7
	 */
	private handleReadDiscreteInputs(request: any, response: any): void {
		const { address, quantity, unitId } = request.body;
		this.logger.log(`📖 FC02: Read Discrete Inputs - Unit ${unitId}, Addr ${address}, Qty ${quantity}`);

		try {
			const values: boolean[] = [];
			const deviceId = this.mapper.getDeviceId(unitId);
			const state = deviceId ? this.heatingService.getState(deviceId) : null;
			
			// В Modbus Discrete Inputs: адрес 0 = биты 0-15 (16-битное слово)
			// Но для удобства OPC читаем отдельные биты:
			// Адрес 0 → бит 0 (IS_ONLINE)
			// Адрес 1 → бит 1 (IS_WORKING)
			// Адрес 2 → бит 2 (IS_EMERGENCY_STOP)
			// ... и т.д. до адреса 7 → бит 7 (VALVE_OPEN)
			for (let i = 0; i < quantity; i++) {
				const bitAddress = address + i;
				if (bitAddress >= 16) {
					this.logger.warn(`  ⚠️  Bit address ${bitAddress} exceeds maximum (15), returning false`);
					values.push(false);
					continue;
				}
				const value = this.memoryManager.readBit(unitId, ModbusAreaType.DISCRETE_INPUTS, bitAddress);
				values.push(value ?? false);
				
				// Логируем важные биты
				if (bitAddress < 8) {
					const bitNames = ['IS_ONLINE', 'IS_WORKING', 'IS_EMERGENCY_STOP', 'TEMP_SENSOR_ERROR', 'PID_ACTIVE', 'FREEZE_PROTECTION', 'OVERHEAT_PROTECTION', 'VALVE_OPEN'];
					this.logger.log(`  📊 Unit ${unitId} (${deviceId ?? 'unknown'}): Discrete Input bit ${bitAddress} (${bitNames[bitAddress] ?? 'unknown'}) = ${value}`);
				}
			}

			response.body.valuesAsArray = values;
			response.body.valuesAsBuffer = this.boolArrayToBuffer(values);
			
			this.logger.debug(`  📤 Unit ${unitId}: Sending Discrete Inputs - values=[${values.map(v => v ? '1' : '0').join(', ')}]`);
		} catch (error) {
			this.logger.error(`❌ Error reading discrete inputs: ${error.message}`);
			response.body.valuesAsArray = [];
		}
	}

	/**
	 * FC03: Read Holding Registers
	 * Обрабатывает сквозную адресацию: ШУК1=0-29, ШУК2=30-59, ШУК3=60-89, ...
	 */
	private handleReadHoldingRegisters(request: any, response: any): void {
		const { address, quantity, unitId } = request.body;
		
		// Преобразуем сквозной адрес в Unit ID и относительный адрес
		const { unitId: actualUnitId, relativeAddress } = this.getUnitIdFromHoldingRegisterAddress(address);
		const deviceId = this.mapper.getDeviceId(actualUnitId);
		
		this.logger.log(`📖 FC03 REQUEST: Raw Addr=${address}, Unit=${unitId} → Actual Unit=${actualUnitId} (${deviceId ?? 'unknown'}), Relative Addr=${relativeAddress}, Qty=${quantity}`);

		try {
			const values: number[] = [];
			
			for (let i = 0; i < quantity; i++) {
				// Проверяем, не выходим ли за границы устройства (max 30 регистров)
				if (relativeAddress + i >= 30) {
					this.logger.warn(`⚠️  Address ${address + i} is out of bounds for device ${actualUnitId} (max 30 registers)`);
					values.push(0);
					continue;
				}
				
				const value = this.memoryManager.readRegister(actualUnitId, ModbusAreaType.HOLDING_REGISTERS, relativeAddress + i);
				const actualValue = value ?? 0;
				values.push(actualValue);
				
				// Логируем важные регистры
				const regAddr = address + i;
				const relAddr = relativeAddress + i;
				if (relAddr === 0) {
					const state = deviceId ? this.heatingService.getState(deviceId) : null;
					const setpointActual = state?.setpointTemperature ?? 0;
					const setpointRaw = actualValue;
					const setpointExpected = Math.round(setpointActual * 10);
					this.logger.log(`  📊 Unit ${actualUnitId} (${deviceId ?? 'unknown'}): Addr ${regAddr} (rel ${relAddr}, SETPOINT) = ${setpointRaw} (temp=${setpointActual}°C, expected=${setpointExpected})`);
				} else if (relAddr === 10) {
					// COMMAND регистр (битовое управляющее слово)
					const commandBits: string[] = [];
					if ((actualValue & 2) !== 0) commandBits.push('ENABLE_AUTO_CONTROL');
					if ((actualValue & 4) !== 0) commandBits.push('DISABLE_AUTO_CONTROL');
					if (actualValue === 0) commandBits.push('NOP');
					this.logger.log(`  📊 Unit ${actualUnitId} (${deviceId ?? 'unknown'}): Addr ${regAddr} (rel ${relAddr}, COMMAND) = ${actualValue} (0x${actualValue.toString(16).padStart(4, '0')}) - [${commandBits.join(', ') || 'NOP'}]`);
				}
			}

			// Формируем буфер в формате Big Endian для Modbus
			const buffer = Buffer.alloc(quantity * 2);
			for (let i = 0; i < values.length; i++) {
				// Правильная обработка INT16: если отрицательное, конвертируем
				let valueToWrite = values[i];
				if (valueToWrite < 0 && valueToWrite >= -32768) {
					valueToWrite = valueToWrite + 0x10000;
				}
				buffer.writeUInt16BE(valueToWrite & 0xFFFF, i * 2);
			}

			this.logger.debug(`  📤 Unit ${unitId}: Sending Holding Registers - values=[${values.join(', ')}]`);

			response.body.valuesAsArray = values;
			response.body.valuesAsBuffer = buffer;
		} catch (error) {
			this.logger.error(`❌ Error reading holding registers: ${error.message}`);
			response.body.valuesAsArray = [];
		}
	}

	/**
	 * Преобразование сквозного адреса INPUT_REGISTERS в Unit ID и относительный адрес
	 * Формула: offset = (unitId - 1) * 20
	 * Адреса: ШУК1=0-19, ШУК2=20-39, ШУК3=40-59, ...
	 */
	private getUnitIdFromInputRegisterAddress(address: number): { unitId: number; relativeAddress: number } {
		const unitId = Math.floor(address / 20) + 1;
		const relativeAddress = address % 20;
		return { unitId, relativeAddress };
	}

	/**
	 * Преобразование сквозного адреса HOLDING_REGISTERS в Unit ID и относительный адрес
	 * Формула: offset = (unitId - 1) * 30
	 * Адреса: ШУК1=0-29, ШУК2=30-59, ШУК3=60-89, ...
	 */
	private getUnitIdFromHoldingRegisterAddress(address: number): { unitId: number; relativeAddress: number } {
		const unitId = Math.floor(address / 30) + 1;
		const relativeAddress = address % 30;
		return { unitId, relativeAddress };
	}

	/**
	 * Получить сквозной адрес INPUT_REGISTERS по Unit ID и относительному адресу
	 */
	private getInputRegisterAddress(unitId: number, relativeAddress: number): number {
		return (unitId - 1) * 20 + relativeAddress;
	}

	/**
	 * Получить сквозной адрес HOLDING_REGISTERS по Unit ID и относительному адресу
	 */
	private getHoldingRegisterAddress(unitId: number, relativeAddress: number): number {
		return (unitId - 1) * 30 + relativeAddress;
	}

	/**
	 * FC04: Read Input Registers
	 * Обрабатывает сквозную адресацию: ШУК1=0-19, ШУК2=20-39, ШУК3=40-59, ...
	 */
	private handleReadInputRegisters(request: any, response: any): void {
		const { address, quantity, unitId } = request.body;
		
		// Преобразуем сквозной адрес в Unit ID и относительный адрес
		const { unitId: actualUnitId, relativeAddress } = this.getUnitIdFromInputRegisterAddress(address);
		const deviceId = this.mapper.getDeviceId(actualUnitId);
		
		this.logger.log(`📖 FC04 REQUEST: Raw Addr=${address}, Unit=${unitId} → Actual Unit=${actualUnitId} (${deviceId ?? 'unknown'}), Relative Addr=${relativeAddress}, Qty=${quantity}`);
		
		// Проверяем, существует ли Unit ID
		if (!deviceId) {
			this.logger.warn(`⚠️  Unit ID ${actualUnitId} not found in configuration! Available Unit IDs: ${this.memoryManager.getAllUnitIds().join(', ')}`);
		}

		try {
			const values: number[] = [];
			const memoryMap = this.memoryManager.getMemoryMap(actualUnitId);
			
			if (!memoryMap) {
				this.logger.warn(`⚠️  Memory map not initialized for Unit ID ${actualUnitId}. Returning zeros.`);
				// Возвращаем нули для несуществующего Unit ID
				for (let i = 0; i < quantity; i++) {
					values.push(0);
				}
				response.body.valuesAsArray = values;
				response.body.valuesAsBuffer = Buffer.from(values.flatMap(v => [v >> 8, v & 0xFF]));
				return;
			}

			// Читаем данные из нашего memoryManager
			// Используем actualUnitId и relativeAddress для чтения из правильного устройства
			for (let i = 0; i < quantity; i++) {
				// Проверяем, не выходим ли за границы устройства (max 20 регистров)
				if (relativeAddress + i >= 20) {
					this.logger.warn(`⚠️  Address ${address + i} is out of bounds for device ${actualUnitId} (max 20 registers)`);
					values.push(0);
					continue;
				}
				
				const value = this.memoryManager.readRegister(actualUnitId, ModbusAreaType.INPUT_REGISTERS, relativeAddress + i);
				const actualValue = value ?? 0;
				values.push(actualValue);
				
				// Логируем значения для диагностики
				const regAddr = address + i; // Сквозной адрес
				const relAddr = relativeAddress + i; // Относительный адрес
				if (relAddr <= 4) {
					const state = deviceId ? this.heatingService.getState(deviceId) : null;
					
					if (relAddr === 0) {
						// Температура
						const tempActual = state?.currentTemperature ?? 0;
						const tempRaw = actualValue;
						const tempExpected = Math.round(tempActual * 10);
						this.logger.log(`  📊 Unit ${actualUnitId} (${deviceId ?? 'unknown'}): Addr ${regAddr} (rel ${relAddr}) = ${tempRaw} (temp=${tempActual}°C, expected=${tempExpected})`);
					} else if (relAddr === 1) {
						// Скорость вентилятора
						this.logger.log(`  📊 Unit ${actualUnitId} (${deviceId ?? 'unknown'}): Addr ${regAddr} (rel ${relAddr}) = ${actualValue} (fanSpeed=${state?.currentFanSpeed ?? 0})`);
					} else if (relAddr === 2) {
						// Состояние клапана
						this.logger.log(`  📊 Unit ${actualUnitId} (${deviceId ?? 'unknown'}): Addr ${regAddr} (rel ${relAddr}) = ${actualValue} (valve=${state?.valveState ?? 'unknown'})`);
					} else if (relAddr === 3) {
						// PID выход
						const pidExpected = Math.round((state?.pidOutput ?? 0) * 10);
						this.logger.log(`  📊 Unit ${actualUnitId} (${deviceId ?? 'unknown'}): Addr ${regAddr} (rel ${relAddr}) = ${actualValue} (pidOutput=${state?.pidOutput ?? 0}, expected=${pidExpected})`);
					} else if (relAddr === 4) {
						// Статусное слово
						const statusBits: string[] = [];
						const bitNames = ['IS_ONLINE', 'IS_WORKING', 'IS_EMERGENCY_STOP', 'TEMP_SENSOR_ERROR', 'PID_ACTIVE', 'FREEZE_PROTECTION', 'OVERHEAT_PROTECTION', 'VALVE_OPEN'];
						for (let bit = 0; bit < 8; bit++) {
							const bitValue = (actualValue >> bit) & 1;
							statusBits.push(`${bitNames[bit] ?? `BIT${bit}`}=${bitValue}`);
						}
						this.logger.log(`  📊 Unit ${actualUnitId} (${deviceId ?? 'unknown'}): Addr ${regAddr} (rel ${relAddr}, STATUS_WORD) = ${actualValue} (0x${actualValue.toString(16).padStart(4, '0')}) - [${statusBits.join(', ')}]`);
					}
				}
			}

			// Формируем буфер в формате Big Endian для Modbus
			// КРИТИЧНО: response.body.valuesAsBuffer должен содержать данные в формате [high_byte, low_byte] для каждого регистра
			const buffer = Buffer.alloc(quantity * 2);
			for (let i = 0; i < values.length; i++) {
				// Правильная обработка INT16: если отрицательное, конвертируем
				let valueToWrite = values[i];
				if (valueToWrite < 0 && valueToWrite >= -32768) {
					valueToWrite = valueToWrite + 0x10000; // Преобразуем -32768..-1 в 32768..65535
				}
				buffer.writeUInt16BE(valueToWrite & 0xFFFF, i * 2);
			}

			// КРИТИЧНО: Проверяем, что данные правильные ПЕРЕД отправкой
			if (relativeAddress === 0 && quantity >= 1) {
				const tempValue = values[0];
				const tempInCelsius = tempValue / 10;
				const deviceName = deviceId ?? `Unit${actualUnitId}`;
				this.logger.log(`  🔍 FC04 RESPONSE for ${deviceName} (Unit ${actualUnitId}): Addr ${address} (rel ${relativeAddress}) = ${tempValue} (${tempInCelsius}°C) - sending to OPC server`);
				
				// Проверяем, что это правильное устройство
				if (deviceId && actualUnitId) {
					const expectedState = this.heatingService.getState(deviceId);
					const expectedTemp = expectedState ? Math.round(expectedState.currentTemperature * 10) : 0;
					if (tempValue !== expectedTemp) {
						this.logger.error(`  ❌ MISMATCH for ${deviceName}! Sending ${tempValue} but should be ${expectedTemp} (${tempInCelsius}°C vs ${expectedState?.currentTemperature ?? 0}°C)`);
					} else {
						this.logger.log(`  ✅ VERIFIED: ${deviceName} sending correct temperature ${tempValue} (${tempInCelsius}°C)`);
					}
				}
			}
			
			this.logger.log(`  📤 Unit ${unitId}: Sending response - values=[${values.join(', ')}], buffer bytes=[${Array.from(buffer).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ')}]`);

			// Устанавливаем данные в response.body - это переопределит данные из буфера
			response.body.valuesAsArray = values;
			response.body.valuesAsBuffer = buffer;
		} catch (error) {
			this.logger.error(`❌ Error reading input registers: ${error.message}`);
			response.body.valuesAsArray = [];
		}
	}

	/**
	 * FC05: Write Single Coil
	 */
	private handleWriteSingleCoil(request: any, response: any): void {
		const { address, value, unitId } = request.body;
		this.logger.debug(`FC05: Write Single Coil - Unit ${unitId}, Addr ${address}, Value ${value}`);

		try {
			// Записываем в память
			this.memoryManager.writeBit(unitId, ModbusAreaType.COILS, address, value);

			// Синхронизируем с HeatingService
			const change = this.mapper.readCoilChange(unitId, address, value);
			if (change) {
				this.applyHeatingChange(change.deviceId, change.parameter, change.value);
			}

			response.body.address = address;
			response.body.value = value;
		} catch (error) {
			this.logger.error(`Error writing single coil: ${error.message}`);
		}
	}

	/**
	 * FC06: Write Single Register
	 * Обрабатывает сквозную адресацию: ШУК1=0-29, ШУК2=30-59, ШУК3=60-89, ...
	 */
	private handleWriteSingleRegister(request: any, response: any): void {
		if (!request || !request.body) {
			this.logger.error(`FC06: Invalid request - request.body is undefined`);
			return;
		}

		const { address, value, unitId } = request.body;
		if (address === undefined || value === undefined || unitId === undefined) {
			this.logger.error(`FC06: Missing required fields - address=${address}, value=${value}, unitId=${unitId}`);
			return;
		}

		// Преобразуем сквозной адрес в Unit ID и относительный адрес
		const { unitId: actualUnitId, relativeAddress } = this.getUnitIdFromHoldingRegisterAddress(address);
		const deviceId = this.mapper.getDeviceId(actualUnitId);

		this.logger.log(`📝 FC06: Write Single Register - Raw Addr=${address}, Unit=${unitId} → Actual Unit=${actualUnitId} (${deviceId ?? 'unknown'}), Relative Addr=${relativeAddress}, Value=${value}`);

		try {
			// Проверяем границы
			if (relativeAddress >= 30) {
				this.logger.warn(`⚠️  Address ${address} is out of bounds for device ${actualUnitId} (max 30 registers)`);
				return;
			}

			// Записываем в память
			this.memoryManager.writeRegister(actualUnitId, ModbusAreaType.HOLDING_REGISTERS, relativeAddress, value);

			// Синхронизируем с HeatingService
			const change = this.mapper.readHoldingRegisterChange(actualUnitId, relativeAddress, value);
			if (change) {
				this.logger.log(`  🔄 Applying change: ${change.deviceId}.${change.parameter} = ${change.value}`);
				this.applyHeatingChange(change.deviceId, change.parameter, change.value);
			}

			// Проверяем, не была ли записана команда
			if (relativeAddress === 10) { // COMMAND регистр
				this.processCommand(actualUnitId);
			}

			if (response && response.body) {
				response.body.address = address;
				response.body.value = value;
			}
		} catch (error) {
			this.logger.error(`❌ Error writing single register: ${error.message}`);
		}
	}

	/**
	 * FC15: Write Multiple Coils
	 */
	private handleWriteMultipleCoils(request: any, response: any): void {
		const { address, quantity, valuesAsArray, unitId } = request.body;
		this.logger.debug(`FC15: Write Multiple Coils - Unit ${unitId}, Addr ${address}, Qty ${quantity}`);

		try {
			for (let i = 0; i < valuesAsArray.length; i++) {
				this.memoryManager.writeBit(unitId, ModbusAreaType.COILS, address + i, valuesAsArray[i]);

				// Синхронизируем каждый бит
				const change = this.mapper.readCoilChange(unitId, address + i, valuesAsArray[i]);
				if (change) {
					this.applyHeatingChange(change.deviceId, change.parameter, change.value);
				}
			}

			response.body.address = address;
			response.body.quantity = quantity;
		} catch (error) {
			this.logger.error(`Error writing multiple coils: ${error.message}`);
		}
	}

	/**
	 * FC16: Write Multiple Registers
	 */
	private handleWriteMultipleRegisters(request: any, response: any): void {
		// Проверяем, является ли request напрямую Buffer
		if (Buffer.isBuffer(request)) {
			// Проверяем, есть ли в Buffer не-нулевые данные (могут быть реальные данные)
			let hasNonZeroData = false;
			let firstNonZeroIndex = -1;
			for (let i = 0; i < Math.min(100, request.length); i++) {
				if (request[i] !== 0) {
					hasNonZeroData = true;
					firstNonZeroIndex = i;
					break;
				}
			}
			
			// Пробуем распарсить Modbus протокол из Buffer вручную
			if (request.length >= 8) {
				const transactionId = request.readUInt16BE(0);
				const protocolId = request.readUInt16BE(2);
				const length = request.readUInt16BE(4);
				const unitId = request.readUInt8(6);
				const functionCode = request.length > 7 ? request.readUInt8(7) : null;
				const startAddress = request.length > 9 ? request.readUInt16BE(8) : null;
				const quantity = request.length > 11 ? request.readUInt16BE(10) : null;
				
				// Если Buffer заполнен нулями, это не валидный запрос
				if (!hasNonZeroData && (transactionId === 0 && protocolId === 0 && length === 0)) {
					this.logger.error(`FC16: Received empty Buffer (all zeros)! BufferSize=${request.length} bytes.`);
					this.logger.error(`FC16: This suggests jsmodbus is passing its internal buffer instead of parsed request.`);
					this.logger.error(`FC16: Check if OPC server is configured correctly - it may be trying to write too many registers at once.`);
					return;
				}
				
				// Если есть не-нулевые данные, пробуем их обработать
				if (hasNonZeroData && functionCode === 16 && startAddress !== null && quantity !== null && unitId > 0) {
					this.logger.warn(`FC16: Trying to parse data from Buffer - Unit=${unitId}, Addr=${startAddress}, Qty=${quantity}`);
					
					// Извлекаем данные из Buffer
					if (request.length >= 13 + (quantity * 2)) {
						const byteCount = request.readUInt8(12);
						const values: number[] = [];
						
						for (let i = 0; i < quantity && i < byteCount / 2; i++) {
							const offset = 13 + (i * 2);
							if (offset + 2 <= request.length) {
								values.push(request.readUInt16BE(offset));
							}
						}
						
						if (values.length > 0 && quantity <= 100) {
							this.logger.log(`FC16: Extracted ${values.length} values from Buffer: [${values.join(', ')}]`);
							
							// Обрабатываем как нормальный запрос с учетом сквозной адресации
							try {
								// Преобразуем сквозной адрес в Unit ID и относительный адрес
								const { unitId: actualUnitId, relativeAddress: baseRelativeAddress } = this.getUnitIdFromHoldingRegisterAddress(startAddress);
								const deviceId = this.mapper.getDeviceId(actualUnitId);
								
								this.logger.log(`  🔄 FC16 Buffer: Raw Addr=${startAddress} → Actual Unit=${actualUnitId} (${deviceId ?? 'unknown'}), Relative Addr=${baseRelativeAddress}`);
								
								for (let i = 0; i < values.length && i < quantity; i++) {
									const relativeAddr = baseRelativeAddress + i;
									
									// Проверяем границы
									if (relativeAddr >= 30) {
										this.logger.warn(`  ⚠️  Address ${startAddress + i} is out of bounds for device ${actualUnitId}`);
										continue;
									}
									
									const regValue = values[i];
									
									this.memoryManager.writeRegister(actualUnitId, ModbusAreaType.HOLDING_REGISTERS, relativeAddr, regValue);
									
									const change = this.mapper.readHoldingRegisterChange(actualUnitId, relativeAddr, regValue);
									if (change) {
										this.logger.log(`  🔄 Applying change: ${change.deviceId}.${change.parameter} = ${change.value}`);
										try {
											this.applyHeatingChange(change.deviceId, change.parameter, change.value);
										} catch (changeError) {
											this.logger.error(`  ❌ Error applying change: ${changeError.message}`);
										}
									}
									
									// Проверяем команду
									if (relativeAddr === 10) {
										this.processCommand(actualUnitId);
									}
								}
								
								if (response && response.body) {
									response.body.address = startAddress;
									response.body.quantity = quantity;
								}
								
								this.logger.log(`✅ FC16: Successfully processed request from Buffer`);
								return;
							} catch (error) {
								this.logger.error(`FC16: Error processing Buffer data: ${error.message}`);
							}
						}
					}
				}
				
				// Если не удалось обработать, выводим диагностику
				this.logger.error(`FC16: Received raw Buffer! MBAP: Transaction=${transactionId}, Protocol=${protocolId}, Length=${length}, Unit=${unitId}`);
				if (functionCode !== null) {
					this.logger.error(`FC16: PDU: Function=${functionCode}, StartAddr=${startAddress}, Quantity=${quantity}, BufferSize=${request.length} bytes`);
				}
				if (hasNonZeroData) {
					this.logger.error(`FC16: Found non-zero data starting at byte ${firstNonZeroIndex}, but couldn't parse valid Modbus packet.`);
				}
				this.logger.error(`FC16: First 20 bytes: [${Array.from(request.slice(0, 20)).map(b => '0x' + b.toString(16).padStart(2, '0')).join(', ')}]`);
			} else {
				this.logger.error(`FC16: Received raw Buffer instead of request object! Buffer size: ${request.length} bytes (too small for Modbus packet).`);
			}
			return;
		}
		
		// Диагностика: логируем структуру request для понимания формата данных
		const requestType = request ? (typeof request === 'object' ? 'object' : typeof request) : 'null';
		const hasBody = request?.body !== undefined;
		const bodyKeys = request?.body && typeof request.body === 'object' ? Object.keys(request.body).join(', ') : 'none';
		this.logger.log(`🔍 FC16: Received request - type: ${requestType}, has body: ${hasBody}, body keys: ${bodyKeys}`);
		
		// Проверяем разные возможные структуры request
		let address, quantity, valuesAsArray, unitId;
		
		if (request?.body) {
			// Стандартная структура через request.body
			address = request.body.address;
			quantity = request.body.quantity;
			valuesAsArray = request.body.valuesAsArray;
			unitId = request.body.unitId;
		} else if (request && typeof request === 'object' && !Buffer.isBuffer(request)) {
			// Возможно, данные напрямую в request
			address = request.address;
			quantity = request.quantity;
			valuesAsArray = request.valuesAsArray || request.values;
			unitId = request.unitId || request.slaveId;
		}
		
		if (address === undefined || quantity === undefined || !valuesAsArray || unitId === undefined) {
			this.logger.error(`FC16: Missing required fields - address=${address}, quantity=${quantity}, valuesAsArray=${valuesAsArray ? 'exists' : 'missing'}, unitId=${unitId}`);
			
			// Ограничиваем вывод request, чтобы избежать огромных логов
			const safeRequest = this.sanitizeForLogging(request);
			this.logger.error(`FC16: Request summary: ${JSON.stringify(safeRequest, null, 2)}`);
			return;
		}

		// Преобразуем valuesAsArray в массив, если это Buffer
		let values: number[] = [];
		if (Array.isArray(valuesAsArray)) {
			values = valuesAsArray;
		} else if (Buffer.isBuffer(valuesAsArray)) {
			// Если Buffer, читаем как 16-bit слова (Big Endian)
			for (let i = 0; i < quantity; i++) {
				const offset = i * 2;
				if (offset + 2 <= valuesAsArray.length) {
					values.push(valuesAsArray.readUInt16BE(offset));
				}
			}
		} else {
			this.logger.error(`FC16: valuesAsArray is neither array nor Buffer: ${typeof valuesAsArray}, value: ${valuesAsArray}`);
			return;
		}

		// Защита от записи слишком большого количества регистров (может быть ошибка OPC сервера)
		if (quantity > 100) {
			this.logger.error(`FC16: Quantity ${quantity} is too large! Maximum allowed: 100. Rejecting request.`);
			return;
		}

		// Преобразуем сквозной адрес в Unit ID и относительный адрес
		const { unitId: actualUnitId, relativeAddress: baseRelativeAddress } = this.getUnitIdFromHoldingRegisterAddress(address);
		const deviceId = this.mapper.getDeviceId(actualUnitId);

		this.logger.log(`📝 FC16: Write Multiple Registers - Raw Addr=${address}, Unit=${unitId} → Actual Unit=${actualUnitId} (${deviceId ?? 'unknown'}), Relative Addr=${baseRelativeAddress}, Qty=${quantity}, Values=[${values.join(', ')}]`);

		try {
			for (let i = 0; i < values.length && i < quantity; i++) {
				const relativeAddr = baseRelativeAddress + i;
				const regValue = values[i];
				
				// Проверяем границы
				if (relativeAddr >= 30) {
					this.logger.warn(`  ⚠️  Address ${address + i} is out of bounds for device ${actualUnitId} (max 30 registers)`);
					continue;
				}
				
				// Валидация значения перед записью
				if (typeof regValue !== 'number' || isNaN(regValue) || !isFinite(regValue)) {
					this.logger.error(`FC16: Invalid register value at address ${address + i} (rel ${relativeAddr}): ${regValue}`);
					continue;
				}

				// Записываем в память
				this.memoryManager.writeRegister(actualUnitId, ModbusAreaType.HOLDING_REGISTERS, relativeAddr, regValue);

				// Синхронизируем каждый регистр
				const change = this.mapper.readHoldingRegisterChange(actualUnitId, relativeAddr, regValue);
				if (change) {
					this.logger.log(`  🔄 Applying change: ${change.deviceId}.${change.parameter} = ${change.value}`);
					try {
						this.applyHeatingChange(change.deviceId, change.parameter, change.value);
					} catch (changeError) {
						this.logger.error(`  ❌ Error applying change ${change.parameter}=${change.value}: ${changeError.message}`);
					}
				}
			}

			// Проверяем, не была ли записана команда (относительный адрес 10)
			for (let i = 0; i < quantity; i++) {
				const relativeAddr = baseRelativeAddress + i;
				if (relativeAddr === 10) {
					this.processCommand(actualUnitId);
					break;
				}
			}

			if (response && response.body) {
				response.body.address = address;
				response.body.quantity = quantity;
			}
		} catch (error) {
			this.logger.error(`❌ Error writing multiple registers: ${error.message}`);
		}
	}

	/**
	 * Очистить объект для безопасного логирования (ограничить размер массивов/буферов)
	 */
	private sanitizeForLogging(obj: any, maxArrayLength: number = 10): any {
		if (obj === null || obj === undefined) {
			return obj;
		}

		if (Buffer.isBuffer(obj)) {
			const bufferPreview = Array.from(obj.slice(0, Math.min(20, obj.length)));
			return `<Buffer[${obj.length}] bytes: [${bufferPreview.join(', ')}${obj.length > 20 ? '...' : ''}]>`;
		}

		if (Array.isArray(obj)) {
			if (obj.length > maxArrayLength) {
				return `<Array[${obj.length}] items: [${obj.slice(0, maxArrayLength).join(', ')}... (${obj.length - maxArrayLength} more)]>`;
			}
			return obj.map(item => this.sanitizeForLogging(item, maxArrayLength));
		}

		if (typeof obj === 'object') {
			const sanitized: any = {};
			for (const key in obj) {
				if (Object.prototype.hasOwnProperty.call(obj, key)) {
					sanitized[key] = this.sanitizeForLogging(obj[key], maxArrayLength);
				}
			}
			return sanitized;
		}

		return obj;
	}

	/**
	 * Преобразование массива boolean в Buffer для Modbus
	 */
	private boolArrayToBuffer(values: boolean[]): Buffer {
		const byteCount = Math.ceil(values.length / 8);
		const buffer = Buffer.alloc(byteCount);

		for (let i = 0; i < values.length; i++) {
			if (values[i]) {
				const byteIndex = Math.floor(i / 8);
				const bitIndex = i % 8;
				buffer[byteIndex] |= (1 << bitIndex);
			}
		}

		return buffer;
	}

	/**
	 * Подписка на события изменения состояния Heating
	 */
	private subscribeToHeatingEvents(): void {
		// Обновление любого параметра heating
		this.eventEmitter.on('heating.update', (heatingId: string) => {
			this.syncHeatingToModbus(heatingId);
		});

		// Обновление температуры
		this.eventEmitter.on('heating.temperature.updated', (data: { heatingId: string; temperature: number }) => {
			this.syncHeatingToModbus(data.heatingId);
		});

		// Изменение уставки температуры
		this.eventEmitter.on('heating.setpoint.changed', (data: { heatingId: string; temperature?: number; setpointTemperature?: number }) => {
			// Поддерживаем оба варианта имени поля (temperature и setpointTemperature)
			const heatingId = data.heatingId;
			this.logger.debug(`heating.setpoint.changed event received for ${heatingId}`);
			this.syncHeatingToModbus(heatingId);
		});

		// Включение автоконтроля
		this.eventEmitter.on('heating.auto.control.enabled', (data: { heatingId: string }) => {
			this.syncHeatingToModbus(data.heatingId);
		});

		// Выключение автоконтроля
		this.eventEmitter.on('heating.auto.control.disabled', (data: { heatingId: string }) => {
			this.syncHeatingToModbus(data.heatingId);
		});

		// Аварийная остановка
		this.eventEmitter.on('heating.emergency.stop', (data: { heatingId: string }) => {
			this.syncHeatingToModbus(data.heatingId);
		});

		// Сброс аварийной остановки
		this.eventEmitter.on('heating.emergency.stop.reset', (data: { heatingId: string }) => {
			this.syncHeatingToModbus(data.heatingId);
		});

		// Изменение состояния клапана
		this.eventEmitter.on('heating.valve.state.changed', (data: { heatingId: string; valveState: 'open' | 'closed' }) => {
			this.syncHeatingToModbus(data.heatingId);
		});

		// Обновление PID
		this.eventEmitter.on('heating.pid.updated', (data: { heatingId: string; pidOutput: number }) => {
			this.syncHeatingToModbus(data.heatingId);
		});

		this.logger.log('Subscribed to all heating events');
	}

	/**
	 * Синхронизация состояния Heating в Modbus
	 */
	private syncHeatingToModbus(heatingId: string): void {
		const state = this.heatingService.getState(heatingId);
		if (state) {
			// Получаем Unit ID для проверки
			const unitId = this.mapper.getUnitId(heatingId);
			this.logger.log(`🔄 Syncing ${heatingId} (Unit ID: ${unitId}) to Modbus: temp=${state.currentTemperature}°C, setpoint=${state.setpointTemperature}°C, online=${state.isOnline}`);
			
			if (unitId === undefined) {
				this.logger.error(`❌ Cannot sync ${heatingId} to Modbus: Unit ID not found!`);
				return;
			}
			
			this.mapper.syncHeatingStateToModbus(heatingId, state);
			
			// Синхронизируем данные в буфер jsmodbus
			this.syncToModbusBuffers(heatingId);
			
			// Проверяем, что данные записались правильно
			const syncedTemp = this.memoryManager.readRegister(unitId, ModbusAreaType.INPUT_REGISTERS, 0);
			this.logger.log(`✅ Synced ${heatingId} (Unit ${unitId}): Input Register 0 = ${syncedTemp} (expected=${Math.round(state.currentTemperature * 10)})`);
		} else {
			this.logger.warn(`No state found for heating device: ${heatingId}`);
		}
	}

	/**
	 * Синхронизация данных из memoryManager в буферы jsmodbus
	 * Использует сквозную адресацию: ШУК1=0-19, ШУК2=20-39, ШУК3=40-59 для INPUT_REGISTERS
	 * и ШУК1=0-29, ШУК2=30-59, ШУК3=60-89 для HOLDING_REGISTERS
	 */
	private syncToModbusBuffers(deviceId: string): void {
		if (!this.modbusServer) return;
		
		const unitId = this.mapper.getUnitId(deviceId);
		if (unitId === undefined) return;

		try {
			// Синхронизируем Input Registers (первые 5 регистров: 0-3 данные, 4 статусное слово)
			// Сквозная адресация: offset = (unitId - 1) * 20
			for (let i = 0; i < 5; i++) {
				const value = this.memoryManager.readRegister(unitId, ModbusAreaType.INPUT_REGISTERS, i);
				if (value !== undefined) {
					// Вычисляем сквозной адрес для буфера jsmodbus
					const throughAddress = this.getInputRegisterAddress(unitId, i);
					const bufferOffset = throughAddress * 2; // Адрес в байтах
					
					if (bufferOffset + 2 <= this.modbusServer.input.length) {
						// Правильная обработка INT16 (включая отрицательные значения)
						let valueToWrite = value & 0xFFFF;
						if (value < 0 && value >= -32768) {
							valueToWrite = value + 0x10000;
						}
						this.modbusServer.input.writeUInt16BE(valueToWrite, bufferOffset);
						this.logger.debug(`Synced ${deviceId} (Unit ${unitId}) input register ${i} (through addr ${throughAddress}) = ${value} to buffer offset ${bufferOffset}`);
					}
				}
			}
			
			// Синхронизируем Holding Registers (уставки и параметры)
			// Сквозная адресация: offset = (unitId - 1) * 30
			for (let i = 0; i < 30; i++) { // Синхронизируем все 30 регистров
				const value = this.memoryManager.readRegister(unitId, ModbusAreaType.HOLDING_REGISTERS, i);
				if (value !== undefined) {
					// Вычисляем сквозной адрес для буфера jsmodbus
					const throughAddress = this.getHoldingRegisterAddress(unitId, i);
					const bufferOffset = throughAddress * 2; // Адрес в байтах
					
					if (bufferOffset + 2 <= this.modbusServer.holding.length) {
						// Правильная обработка INT16 (включая отрицательные значения)
						let valueToWrite = value & 0xFFFF;
						if (value < 0 && value >= -32768) {
							valueToWrite = value + 0x10000;
						}
						this.modbusServer.holding.writeUInt16BE(valueToWrite, bufferOffset);
						if (i === 0) { // Логируем только для уставки температуры
							this.logger.debug(`Synced ${deviceId} (Unit ${unitId}) holding register ${i} (through addr ${throughAddress}, SETPOINT_TEMP) = ${value} (${value / 10}°C) to buffer offset ${bufferOffset}`);
						}
					}
				}
			}
		} catch (error) {
			this.logger.error(`Error syncing to Modbus buffers for ${deviceId}: ${error.message}`);
		}
	}

	/**
	 * Начальная синхронизация всех состояний
	 */
	private async initialSync(): Promise<void> {
		this.logger.log('Performing initial state synchronization...');

		let syncedCount = 0;
		for (const device of MODBUS_HEATING_DEVICES) {
			if (device.enabled) {
				this.logger.debug(`Initial sync for device: ${device.deviceId} (Unit ID: ${device.unitId})`);
				this.syncHeatingToModbus(device.deviceId);
				syncedCount++;
			}
		}

		this.logger.log(`Initial synchronization completed for ${syncedCount} enabled devices`);
	}

	/**
	 * Применить изменение к HeatingService
	 */
	private applyHeatingChange(deviceId: string, parameter: string, value: any): void {
		// Валидация входных данных
		if (!deviceId || typeof deviceId !== 'string') {
			this.logger.error(`Invalid deviceId: ${deviceId}`);
			return;
		}

		this.logger.log(`Applying change from Modbus: ${deviceId}.${parameter} = ${value}`);

		try {
			switch (parameter) {
				case 'autoControlEnabled':
					if (typeof value !== 'boolean') {
						this.logger.error(`Invalid value for autoControlEnabled: ${value} (expected boolean)`);
						return;
					}
					if (value) {
						this.heatingService.enableAutoControl(deviceId);
					} else {
						this.heatingService.disableAutoControl(deviceId);
					}
					break;

				case 'setpointTemperature':
					// Валидация температуры перед установкой
					if (typeof value !== 'number' || isNaN(value) || !isFinite(value)) {
						this.logger.error(`Invalid temperature value: ${value}`);
						return;
					}
					
					// Проверяем диапазон (5-35°C, как в HeatingService)
					if (value < 5 || value > 35) {
						this.logger.warn(`Temperature ${value}°C is outside valid range (5-35°C) for ${deviceId}`);
						return;
					}
					
					this.heatingService.setTemperature(deviceId, value);
					break;

				default:
					this.logger.warn(`Unknown parameter: ${parameter}`);
			}
		} catch (error) {
			this.logger.error(`Error applying change: ${error.message}`, error.stack);
		}
	}

	/**
	 * Обработка команды из COMMAND регистра
	 */
	private processCommand(unitID: number): void {
		const cmdData = this.mapper.readCommand(unitID);
		if (!cmdData) {
			return;
		}

		const { deviceId, command } = cmdData;

		this.logger.log(`Processing command word value=${command} for ${deviceId} (bit-based command)`);

		try {
			// Обработка битовых команд (значение = 2 или 4)
			if (command === ModbusCommand.ENABLE_AUTO_CONTROL) {
				// Бит 1 (значение 2) - включить автоуправление
				this.logger.log(`  ✅ Executing ENABLE_AUTO_CONTROL (bit 1 = 2) for ${deviceId}`);
				this.heatingService.enableAutoControl(deviceId);
			} else if (command === ModbusCommand.DISABLE_AUTO_CONTROL) {
				// Бит 2 (значение 4) - выключить автоуправление
				this.logger.log(`  ✅ Executing DISABLE_AUTO_CONTROL (bit 2 = 4) for ${deviceId}`);
				this.heatingService.disableAutoControl(deviceId);
			} else if (command === 0) {
				// NOP - нет операции
				this.logger.debug(`NOP command (value = 0) for ${deviceId}`);
			} else {
				// Неизвестная команда
				this.logger.warn(`Unknown command value: ${command} for ${deviceId}. Expected 2 (ENABLE) or 4 (DISABLE)`);
			}

			// Очищаем COMMAND регистр после выполнения
			this.mapper.clearCommand(unitID);

		} catch (error) {
			this.logger.error(`Error processing command: ${error.message}`);
		}
	}

	/**
	 * Периодическая проверка команд
	 */
	private startCommandPolling(): void {
		this.commandCheckInterval = setInterval(() => {
			for (const unitId of this.memoryManager.getAllUnitIds()) {
				this.processCommand(unitId);
			}
		}, 100); // Проверяем каждые 100ms
	}

	/**
	 * Получить статус сервера (публичный метод для API)
	 */
	getStatus() {
		return {
			isRunning: this.isRunning,
			port: MODBUS_HEATING_PORT,
			devicesCount: this.memoryManager.getAllUnitIds().length,
			devices: this.memoryManager.getAllUnitIds().map(unitId => ({
				unitId,
				deviceId: this.memoryManager.getDeviceId(unitId),
			})),
		};
	}

	/**
	 * Принудительная синхронизация устройства (публичный метод для API)
	 */
	forceSync(deviceId: string) {
		this.logger.log(`Force syncing ${deviceId} to Modbus...`);
		this.syncHeatingToModbus(deviceId);
		const state = this.heatingService.getState(deviceId);
		const unitId = this.mapper.getUnitId(deviceId);
		
		return {
			success: true,
			deviceId,
			unitId,
			state: state ? {
				currentTemperature: state.currentTemperature,
				setpointTemperature: state.setpointTemperature,
				currentFanSpeed: state.currentFanSpeed,
				valveState: state.valveState,
				isOnline: state.isOnline,
			} : null,
			modbusValues: unitId !== undefined ? {
				inputReg0: this.memoryManager.readRegister(unitId, ModbusAreaType.INPUT_REGISTERS, 0),
				inputReg1: this.memoryManager.readRegister(unitId, ModbusAreaType.INPUT_REGISTERS, 1),
				inputReg2: this.memoryManager.readRegister(unitId, ModbusAreaType.INPUT_REGISTERS, 2),
				inputReg3: this.memoryManager.readRegister(unitId, ModbusAreaType.INPUT_REGISTERS, 3),
			} : null,
		};
	}

	/**
	 * Получить отладочную информацию для Unit ID (публичный метод для API)
	 */
	getDebugInfo(unitId: number) {
		const deviceId = this.memoryManager.getDeviceId(unitId);
		const state = deviceId ? this.heatingService.getState(deviceId) : null;

		return {
			unitId,
			deviceId,
			heatingState: state,
			modbusMemory: {
				discreteInputs: {
					bit0: this.memoryManager.readBit(unitId, ModbusAreaType.DISCRETE_INPUTS, 0),
					bit1: this.memoryManager.readBit(unitId, ModbusAreaType.DISCRETE_INPUTS, 1),
				},
				inputRegisters: {
					reg0: this.memoryManager.readRegister(unitId, ModbusAreaType.INPUT_REGISTERS, 0),
					reg1: this.memoryManager.readRegister(unitId, ModbusAreaType.INPUT_REGISTERS, 1),
					reg2: this.memoryManager.readRegister(unitId, ModbusAreaType.INPUT_REGISTERS, 2),
					reg3: this.memoryManager.readRegister(unitId, ModbusAreaType.INPUT_REGISTERS, 3),
				},
				holdingRegisters: {
					reg0: this.memoryManager.readRegister(unitId, ModbusAreaType.HOLDING_REGISTERS, 0),
					reg1: this.memoryManager.readRegister(unitId, ModbusAreaType.HOLDING_REGISTERS, 1),
				},
			},
		};
	}
}
