import { Module } from '@nestjs/common';
import { ModbusSlaveService } from './modbus-slave.service';
import { ModbusController } from './modbus.controller';
import { HeatingModule } from '../devices/heating/heating.module';

/**
 * Modbus TCP Slave модуль
 * Обеспечивает двустороннюю синхронизацию между OPC сервером и Heating системой
 */
@Module({
	imports: [HeatingModule],
	controllers: [ModbusController],
	providers: [ModbusSlaveService],
	exports: [ModbusSlaveService],
})
export class ModbusSlaveModule {}

