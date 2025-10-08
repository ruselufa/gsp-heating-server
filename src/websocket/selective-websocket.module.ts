import { Module } from '@nestjs/common';
import { SelectiveWebsocketGateway } from './selective-websocket.gateway';
import { HeatingModule } from '../devices/heating/heating.module';
import { BatteriesModule } from '../devices/batteries/batteries.module';

@Module({
	providers: [SelectiveWebsocketGateway],
	exports: [SelectiveWebsocketGateway],
	imports: [HeatingModule, BatteriesModule],
})
export class SelectiveWebsocketModule {}
