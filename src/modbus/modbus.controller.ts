import { Controller, Get, Post, Param } from '@nestjs/common';
import { ModbusSlaveService } from './modbus-slave.service';

@Controller('modbus')
export class ModbusController {
	constructor(private readonly modbusSlaveService: ModbusSlaveService) {}

	@Get('status')
	getStatus() {
		return this.modbusSlaveService.getStatus();
	}

	@Post('sync/:deviceId')
	forceSync(@Param('deviceId') deviceId: string) {
		return this.modbusSlaveService.forceSync(deviceId);
	}

	@Get('debug/:unitId')
	getDebugInfo(@Param('unitId') unitId: string) {
		return this.modbusSlaveService.getDebugInfo(parseInt(unitId, 10));
	}
}

