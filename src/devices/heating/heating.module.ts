import { Module } from '@nestjs/common';
import { HeatingService } from './heating.service';
import { HeatingController } from './heating.controller';
import { MqttModule } from '../../mqtt/mqtt.module';
import { DatabaseModule } from '../../database/database.module';

@Module({
	imports: [MqttModule, DatabaseModule],
	controllers: [HeatingController],
	providers: [HeatingService],
	exports: [HeatingService],
})
export class HeatingModule {}
