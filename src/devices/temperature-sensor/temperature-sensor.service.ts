import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MqttService } from '../../mqtt/mqtt.service';
import { temperatureSensorConfigs } from './temperature-sensor.config';
import { TemperatureSensorData } from '../interfaces/temperature-sensor.interface';

@Injectable()
export class TemperatureSensorService implements OnModuleInit {
	private readonly logger = new Logger(TemperatureSensorService.name);
	private sensorData: Record<string, TemperatureSensorData> = {};

	constructor(private readonly mqttService: MqttService) {}

	onModuleInit() {
		// Подписываемся на топики всех датчиков температуры
		Object.entries(temperatureSensorConfigs).forEach(([sensorId, config]) => {
			this.logger.log(`Initializing temperature sensor: ${sensorId}`);

			// Подписываемся на температуру
			this.mqttService.subscribe(config.topics.TEMPERATURE, (topic, message) => {
				const temperature = parseFloat(message.toString());
				if (!isNaN(temperature)) {
					this.updateSensorData(sensorId, { temperature });
				}
			});

			// Подписываемся на влажность, если есть
			if (config.topics.HUMIDITY) {
				this.mqttService.subscribe(config.topics.HUMIDITY, (topic, message) => {
					const humidity = parseFloat(message.toString());
					if (!isNaN(humidity)) {
						this.updateSensorData(sensorId, { humidity });
					}
				});
			}

			// Подписываемся на давление, если есть
			if (config.topics.PRESSURE) {
				this.mqttService.subscribe(config.topics.PRESSURE, (topic, message) => {
					const pressure = parseFloat(message.toString());
					if (!isNaN(pressure)) {
						this.updateSensorData(sensorId, { pressure });
					}
				});
			}
		});
	}

	private updateSensorData(sensorId: string, data: Partial<TemperatureSensorData>) {
		if (!this.sensorData[sensorId]) {
			this.sensorData[sensorId] = {
				temperature: 0,
				timestamp: new Date(),
			};
		}

		this.sensorData[sensorId] = {
			...this.sensorData[sensorId],
			...data,
			timestamp: new Date(),
		};

		this.logger.debug(`Sensor ${sensorId} data updated:`, this.sensorData[sensorId]);
	}

	getSensorData(sensorId: string): TemperatureSensorData | null {
		return this.sensorData[sensorId] || null;
	}

	getAllSensorData(): Record<string, TemperatureSensorData> {
		return { ...this.sensorData };
	}

	getTemperature(sensorId: string): number | null {
		const data = this.sensorData[sensorId];
		return data ? data.temperature : null;
	}

	getHumidity(sensorId: string): number | null {
		const data = this.sensorData[sensorId];
		return data && data.humidity !== undefined ? data.humidity : null;
	}

	getPressure(sensorId: string): number | null {
		const data = this.sensorData[sensorId];
		return data && data.pressure !== undefined ? data.pressure : null;
	}

	// Экспортируем данные для использования в других модулях
	get temperatureReadings(): Record<string, number> {
		const readings: Record<string, number> = {};
		Object.entries(this.sensorData).forEach(([sensorId, data]) => {
			readings[sensorId] = data.temperature;
		});
		return readings;
	}
}
