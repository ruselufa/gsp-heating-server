import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { WebsocketModule } from './websocket/websocket.module';
import { SelectiveWebsocketModule } from './websocket/selective-websocket.module';
import { ConfigModule } from '@nestjs/config';
import { MqttModule } from './mqtt/mqtt.module';
import { HeatingModule } from './devices/heating/heating.module';
import { TemperatureSensorModule } from './devices/temperature-sensor/temperature-sensor.module';

@Module({
	imports: [
		ConfigModule.forRoot(),
		EventEmitterModule.forRoot({
			global: true,
			maxListeners: 100,
			ignoreErrors: false,
		}),
		WebsocketModule,
		SelectiveWebsocketModule,
		MqttModule,
		HeatingModule,
		TemperatureSensorModule,
	],
})
export class AppModule {}
