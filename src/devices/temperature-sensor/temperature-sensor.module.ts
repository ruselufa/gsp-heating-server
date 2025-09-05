import { Module } from '@nestjs/common';
import { TemperatureSensorService } from './temperature-sensor.service';
import { TemperatureSensorController } from './temperature-sensor.controller';
import { MqttModule } from '../../mqtt/mqtt.module';

@Module({
	imports: [MqttModule],
	controllers: [TemperatureSensorController],
	providers: [TemperatureSensorService],
	exports: [TemperatureSensorService],
})
export class TemperatureSensorModule {}
