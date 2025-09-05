import { Controller, Get, Param } from '@nestjs/common';
import { TemperatureSensorService } from './temperature-sensor.service';

@Controller('temperature-sensors')
export class TemperatureSensorController {
	constructor(private readonly temperatureSensorService: TemperatureSensorService) {}

	@Get()
	getAllSensors() {
		return this.temperatureSensorService.getAllSensorData();
	}

	@Get(':sensorId')
	getSensorData(@Param('sensorId') sensorId: string) {
		return this.temperatureSensorService.getSensorData(sensorId);
	}

	@Get(':sensorId/temperature')
	getTemperature(@Param('sensorId') sensorId: string) {
		return {
			sensorId,
			temperature: this.temperatureSensorService.getTemperature(sensorId),
		};
	}

	@Get(':sensorId/humidity')
	getHumidity(@Param('sensorId') sensorId: string) {
		return {
			sensorId,
			humidity: this.temperatureSensorService.getHumidity(sensorId),
		};
	}

	@Get(':sensorId/pressure')
	getPressure(@Param('sensorId') sensorId: string) {
		return {
			sensorId,
			pressure: this.temperatureSensorService.getPressure(sensorId),
		};
	}
}
