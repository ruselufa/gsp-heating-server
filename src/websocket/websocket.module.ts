import { Module } from '@nestjs/common';
import { WebsocketGateway } from './websocket.gateway';
import { HeatingModule } from '../devices/heating/heating.module';
import { TemperatureSensorModule } from '../devices/temperature-sensor/temperature-sensor.module';

@Module({
	imports: [HeatingModule, TemperatureSensorModule],
	providers: [WebsocketGateway],
	exports: [WebsocketGateway],
})
export class WebsocketModule {}
