import { Module } from '@nestjs/common';
import { BatteriesService } from './batteries.service';
import { BatteriesController } from './batteries.controller';
import { MqttModule } from '../../mqtt/mqtt.module';
import { DatabaseModule } from '../../database/database.module';

@Module({
	imports: [MqttModule, DatabaseModule],
	controllers: [BatteriesController],
	providers: [BatteriesService],
	exports: [BatteriesService],
})
export class BatteriesModule {}
