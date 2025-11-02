import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { WebsocketModule } from './websocket/websocket.module';
import { SelectiveWebsocketModule } from './websocket/selective-websocket.module';
import { ConfigModule } from '@nestjs/config';
import { MqttModule } from './mqtt/mqtt.module';
import { HeatingModule } from './devices/heating/heating.module';
import { BatteriesModule } from './devices/batteries/batteries.module';
import { DatabaseModule } from './database/database.module';
import { ModbusSlaveModule } from './modbus/modbus-slave.module';

@Module({
	imports: [
		ConfigModule.forRoot(),
		EventEmitterModule.forRoot({
			global: true,
			maxListeners: 100,
			ignoreErrors: false,
		}),
		DatabaseModule,
		WebsocketModule,
		SelectiveWebsocketModule,
		MqttModule,
		HeatingModule,
		BatteriesModule,
		ModbusSlaveModule,
	],
})
export class AppModule {}
