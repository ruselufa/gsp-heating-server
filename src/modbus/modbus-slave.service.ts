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

				// Создаем Modbus server
				const modbusServer = new jsmodbus.server.TCP(this.netServer, {
					coils: Buffer.alloc(8192),
					discrete: Buffer.alloc(8192),
					holding: Buffer.alloc(8192 * 2),
					input: Buffer.alloc(8192 * 2),
				});

				// FC01: Read Coils
				modbusServer.on('readCoils', (request, response) => {
					this.handleReadCoils(request, response);
				});

				// FC02: Read Discrete Inputs
				modbusServer.on('readDiscreteInputs', (request, response) => {
					this.handleReadDiscreteInputs(request, response);
				});

				// FC03: Read Holding Registers
				modbusServer.on('readHoldingRegisters', (request, response) => {
					this.handleReadHoldingRegisters(request, response);
				});

				// FC04: Read Input Registers
				modbusServer.on('readInputRegisters', (request, response) => {
					this.handleReadInputRegisters(request, response);
				});

				// FC05: Write Single Coil
				modbusServer.on('writeSingleCoil', (request, response) => {
					this.handleWriteSingleCoil(request, response);
				});

				// FC06: Write Single Register
				modbusServer.on('writeSingleRegister', (request, response) => {
					this.handleWriteSingleRegister(request, response);
				});

				// FC15: Write Multiple Coils
				modbusServer.on('writeMultipleCoils', (request, response) => {
					this.handleWriteMultipleCoils(request, response);
				});

				// FC16: Write Multiple Registers
				modbusServer.on('writeMultipleRegisters', (request, response) => {
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
	 */
	private handleReadDiscreteInputs(request: any, response: any): void {
		const { address, quantity, unitId } = request.body;
		this.logger.debug(`FC02: Read Discrete Inputs - Unit ${unitId}, Addr ${address}, Qty ${quantity}`);

		try {
			const values: boolean[] = [];
			for (let i = 0; i < quantity; i++) {
				const value = this.memoryManager.readBit(unitId, ModbusAreaType.DISCRETE_INPUTS, address + i);
				values.push(value ?? false);
			}

			response.body.valuesAsArray = values;
			response.body.valuesAsBuffer = this.boolArrayToBuffer(values);
		} catch (error) {
			this.logger.error(`Error reading discrete inputs: ${error.message}`);
			response.body.valuesAsArray = [];
		}
	}

	/**
	 * FC03: Read Holding Registers
	 */
	private handleReadHoldingRegisters(request: any, response: any): void {
		const { address, quantity, unitId } = request.body;
		this.logger.debug(`FC03: Read Holding Registers - Unit ${unitId}, Addr ${address}, Qty ${quantity}`);

		try {
			const values: number[] = [];
			for (let i = 0; i < quantity; i++) {
				const value = this.memoryManager.readRegister(unitId, ModbusAreaType.HOLDING_REGISTERS, address + i);
				values.push(value ?? 0);
			}

			response.body.valuesAsArray = values;
			response.body.valuesAsBuffer = Buffer.from(values.flatMap(v => [v >> 8, v & 0xFF]));
		} catch (error) {
			this.logger.error(`Error reading holding registers: ${error.message}`);
			response.body.valuesAsArray = [];
		}
	}

	/**
	 * FC04: Read Input Registers
	 */
	private handleReadInputRegisters(request: any, response: any): void {
		const { address, quantity, unitId } = request.body;
		this.logger.debug(`FC04: Read Input Registers - Unit ${unitId}, Addr ${address}, Qty ${quantity}`);

		try {
			const values: number[] = [];
			for (let i = 0; i < quantity; i++) {
				const value = this.memoryManager.readRegister(unitId, ModbusAreaType.INPUT_REGISTERS, address + i);
				values.push(value ?? 0);
			}

			response.body.valuesAsArray = values;
			response.body.valuesAsBuffer = Buffer.from(values.flatMap(v => [v >> 8, v & 0xFF]));
		} catch (error) {
			this.logger.error(`Error reading input registers: ${error.message}`);
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
	 */
	private handleWriteSingleRegister(request: any, response: any): void {
		const { address, value, unitId } = request.body;
		this.logger.debug(`FC06: Write Single Register - Unit ${unitId}, Addr ${address}, Value ${value}`);

		try {
			// Записываем в память
			this.memoryManager.writeRegister(unitId, ModbusAreaType.HOLDING_REGISTERS, address, value);

			// Синхронизируем с HeatingService
			const change = this.mapper.readHoldingRegisterChange(unitId, address, value);
			if (change) {
				this.applyHeatingChange(change.deviceId, change.parameter, change.value);
			}

			// Проверяем, не была ли записана команда
			if (address === 10) { // COMMAND регистр
				this.processCommand(unitId);
			}

			response.body.address = address;
			response.body.value = value;
		} catch (error) {
			this.logger.error(`Error writing single register: ${error.message}`);
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
		const { address, quantity, valuesAsArray, unitId } = request.body;
		this.logger.debug(`FC16: Write Multiple Registers - Unit ${unitId}, Addr ${address}, Qty ${quantity}`);

		try {
			for (let i = 0; i < valuesAsArray.length; i++) {
				this.memoryManager.writeRegister(unitId, ModbusAreaType.HOLDING_REGISTERS, address + i, valuesAsArray[i]);

				// Синхронизируем каждый регистр
				const change = this.mapper.readHoldingRegisterChange(unitId, address + i, valuesAsArray[i]);
				if (change) {
					this.applyHeatingChange(change.deviceId, change.parameter, change.value);
				}
			}

			// Проверяем, не была ли записана команда
			if (address <= 10 && address + quantity > 10) {
				this.processCommand(unitId);
			}

			response.body.address = address;
			response.body.quantity = quantity;
		} catch (error) {
			this.logger.error(`Error writing multiple registers: ${error.message}`);
		}
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
		this.eventEmitter.on('heating.setpoint.changed', (data: { heatingId: string; setpointTemperature: number }) => {
			this.syncHeatingToModbus(data.heatingId);
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
			this.logger.debug(`Syncing ${heatingId} to Modbus: temp=${state.currentTemperature}°C, setpoint=${state.setpointTemperature}°C, online=${state.isOnline}`);
			this.mapper.syncHeatingStateToModbus(heatingId, state);
		} else {
			this.logger.warn(`No state found for heating device: ${heatingId}`);
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
		this.logger.log(`Applying change from Modbus: ${deviceId}.${parameter} = ${value}`);

		try {
			switch (parameter) {
				case 'autoControlEnabled':
					if (value) {
						this.heatingService.enableAutoControl(deviceId);
					} else {
						this.heatingService.disableAutoControl(deviceId);
					}
					break;

				case 'setpointTemperature':
					this.heatingService.setTemperature(deviceId, value);
					break;

				default:
					this.logger.warn(`Unknown parameter: ${parameter}`);
			}
		} catch (error) {
			this.logger.error(`Error applying change: ${error.message}`);
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

		const { deviceId, command, param1, param2 } = cmdData;

		this.logger.log(`Processing command ${command} for ${deviceId}, params: ${param1}, ${param2}`);

		try {
			switch (command) {
				case ModbusCommand.NOP:
					// Нет операции
					break;

				case ModbusCommand.ENABLE_AUTO_CONTROL:
					this.heatingService.enableAutoControl(deviceId);
					break;

				case ModbusCommand.DISABLE_AUTO_CONTROL:
					this.heatingService.disableAutoControl(deviceId);
					break;

				case ModbusCommand.SET_TEMPERATURE:
					// param1 содержит температуру x10
					const temperature = param1 / 10;
					this.heatingService.setTemperature(deviceId, temperature);
					break;

				case ModbusCommand.SET_FAN_SPEED:
					// param1 содержит скорость вентилятора (0-30)
					this.heatingService.setFanSpeed(deviceId, param1);
					break;

				case ModbusCommand.EMERGENCY_STOP:
					this.heatingService.emergencyStop(deviceId);
					break;

				case ModbusCommand.RESET_EMERGENCY:
					this.heatingService.resetEmergencyStop(deviceId);
					break;

				default:
					this.logger.warn(`Unknown command: ${command}`);
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
}
