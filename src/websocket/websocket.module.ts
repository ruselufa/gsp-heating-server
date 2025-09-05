import { Module } from '@nestjs/common';
import { WebsocketGateway } from './websocket.gateway';
import { HeatingModule } from '../devices/heating/heating.module';

@Module({
	imports: [HeatingModule],
	providers: [WebsocketGateway],
	exports: [WebsocketGateway],
})
export class WebsocketModule {}
