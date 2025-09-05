import { Module } from '@nestjs/common';
import { SelectiveWebsocketGateway } from './selective-websocket.gateway';
import { HeatingModule } from '../devices/heating/heating.module';

@Module({
	providers: [SelectiveWebsocketGateway],
	exports: [SelectiveWebsocketGateway],
	imports: [HeatingModule],
})
export class SelectiveWebsocketModule {}
