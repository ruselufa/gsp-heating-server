import { Module } from '@nestjs/common';
import { SelectiveWebsocketGateway } from './selective-websocket.gateway';
import { HeatingModule } from '../devices/heating/heating.module';
import { TemperatureSensorModule } from '../devices/temperature-sensor/temperature-sensor.module';

@Module({
	providers: [SelectiveWebsocketGateway],
	exports: [SelectiveWebsocketGateway],
	imports: [HeatingModule, TemperatureSensorModule],
})
export class SelectiveWebsocketModule {}
