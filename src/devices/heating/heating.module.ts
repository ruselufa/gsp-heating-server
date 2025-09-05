import { Module } from '@nestjs/common';
import { HeatingService } from './heating.service';
import { HeatingController } from './heating.controller';
import { MqttModule } from '../../mqtt/mqtt.module';
import { TemperatureSensorModule } from '../temperature-sensor/temperature-sensor.module';

@Module({
	imports: [MqttModule, TemperatureSensorModule],
	controllers: [HeatingController],
	providers: [HeatingService],
	exports: [HeatingService],
})
export class HeatingModule {}
