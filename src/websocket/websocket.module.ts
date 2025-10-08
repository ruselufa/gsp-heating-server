import { Module } from '@nestjs/common';
import { WebsocketGateway } from './websocket.gateway';
import { HeatingModule } from '../devices/heating/heating.module';
import { BatteriesModule } from '../devices/batteries/batteries.module';

@Module({
	imports: [HeatingModule, BatteriesModule],
	providers: [WebsocketGateway],
	exports: [WebsocketGateway],
})
export class WebsocketModule {}
