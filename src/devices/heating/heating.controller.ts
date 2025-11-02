import { Controller, Get, Post, Put, Body, Param } from '@nestjs/common';
import { HeatingService } from './heating.service';
import { HeatingControl, HeatingControlParameters } from '../interfaces/heating.interface';

@Controller('heating')
export class HeatingController {
	constructor(private readonly heatingService: HeatingService) {}

	@Get()
	getAllHeatingSystems() {
		return this.heatingService.getAllStates();
	}

	@Get('stats')
	getSystemStats() {
		return this.heatingService.getSystemStats();
	}

	@Get(':heatingId')
	getHeatingSystem(@Param('heatingId') heatingId: string) {
		const state = this.heatingService.getState(heatingId);
		if (!state) {
			return { error: 'Heating system not found' };
		}
		return state;
	}

	@Post(':heatingId/control')
	controlHeating(@Param('heatingId') heatingId: string, @Body() control: HeatingControl) {
		const { command, parameters } = control;

		try {
			switch (command) {
				case 'turn_on':
					this.heatingService.enableAutoControl(heatingId);
					break;
				case 'turn_off':
					this.heatingService.disableAutoControl(heatingId);
					break;
				case 'set_temperature':
					if (parameters?.temperature) {
						this.heatingService.setTemperature(heatingId, parameters.temperature);
					}
					break;
							case 'set_pump_speed':
				if (parameters?.pumpSpeed !== undefined) {
					this.heatingService.setFanSpeed(heatingId, parameters.pumpSpeed);
				}
				break;
			case 'set_valve':
				// Управление клапаном отключено - используется сезонная логика
				break;
				default:
					return { success: false, message: `Unknown command: ${command}` };
			}

			return { success: true, message: `Command ${command} executed for heating ${heatingId}` };
		} catch (error) {
			return { success: false, message: `Error executing command: ${error.message}` };
		}
	}

	@Put(':heatingId/temperature')
	setTemperature(@Param('heatingId') heatingId: string, @Body() body: { temperature: number }) {
		try {
			this.heatingService.setTemperature(heatingId, body.temperature);
			return { success: true, message: `Temperature set to ${body.temperature}°C for heating ${heatingId}` };
		} catch (error) {
			return { success: false, message: `Error setting temperature: ${error.message}` };
		}
	}

	@Post(':heatingId/auto-control/enable')
	enableAutoControl(@Param('heatingId') heatingId: string) {
		try {
			this.heatingService.enableAutoControl(heatingId);
			return { success: true, message: `Auto control enabled for heating ${heatingId}` };
		} catch (error) {
			return { success: false, message: `Error enabling auto control: ${error.message}` };
		}
	}

	@Post(':heatingId/auto-control/disable')
	disableAutoControl(@Param('heatingId') heatingId: string) {
		try {
			this.heatingService.disableAutoControl(heatingId);
			return { success: true, message: `Auto control disabled for heating ${heatingId}` };
		} catch (error) {
			return { success: false, message: `Error disabling auto control: ${error.message}` };
		}
	}

	@Post(':heatingId/pid-parameters')
	setPIDParameters(@Param('heatingId') heatingId: string, @Body() body: { Kp?: number; Ki?: number; Kd?: number }) {
		try {
			this.heatingService.setPIDParameters(heatingId, body.Kp, body.Ki, body.Kd);
			return { success: true, message: `PID parameters updated for heating ${heatingId}` };
		} catch (error) {
			return { success: false, message: `Error setting PID parameters: ${error.message}` };
		}
	}

	@Get(':heatingId/pid-parameters')
	getPIDParameters(@Param('heatingId') heatingId: string) {
		try {
			const params = this.heatingService.getPIDParameters(heatingId);
			if (!params) {
				return { success: false, message: 'Heating system not found' };
			}
			return { success: true, data: params };
		} catch (error) {
			return { success: false, message: `Error getting PID parameters: ${error.message}` };
		}
	}

	@Post(':heatingId/emergency-stop')
	emergencyStop(@Param('heatingId') heatingId: string) {
		try {
			this.heatingService.emergencyStop(heatingId);
			return { success: true, message: `Emergency stop activated for heating ${heatingId}` };
		} catch (error) {
			return { success: false, message: `Error activating emergency stop: ${error.message}` };
		}
	}

	@Post(':heatingId/emergency-stop/reset')
	resetEmergencyStop(@Param('heatingId') heatingId: string) {
		try {
			this.heatingService.resetEmergencyStop(heatingId);
			return { success: true, message: `Emergency stop reset for heating ${heatingId}` };
		} catch (error) {
			return { success: false, message: `Error resetting emergency stop: ${error.message}` };
		}
	}

	@Post(':heatingId/test-mqtt')
	testMqtt(@Param('heatingId') heatingId: string, @Body() body: { fanSpeed?: number; valveOpen?: boolean; testTopic?: string; testValue?: string }) {
		try {
			// Если указан тестовый топик, отправляем прямую MQTT команду
			if (body.testTopic && body.testValue !== undefined) {
				this.heatingService.testMqttCommand(body.testTopic, body.testValue);
				return { success: true, message: `Test MQTT command sent to topic: ${body.testTopic}, value: ${body.testValue}` };
			}

			if (body.fanSpeed !== undefined) {
				this.heatingService.setFanSpeed(heatingId, body.fanSpeed);
			}
			// Управление клапаном отключено - используется сезонная логика
			return { success: true, message: `Test MQTT commands sent for heating ${heatingId}` };
		} catch (error) {
			return { success: false, message: `Error sending test MQTT: ${error.message}` };
		}
	}

	@Post(':heatingId/test-modbus-sync')
	testModbusSync(@Param('heatingId') heatingId: string) {
		try {
			// Принудительно генерируем событие для синхронизации с Modbus
			const state = this.heatingService.getState(heatingId);
			if (state) {
				// Генерируем событие обновления
				this.heatingService['eventEmitter'].emit('heating.update', heatingId);
				return { 
					success: true, 
					message: `Forced Modbus sync for ${heatingId}`, 
					currentTemp: state.currentTemperature,
					setpointTemp: state.setpointTemperature,
					isOnline: state.isOnline
				};
			} else {
				return { success: false, message: `No state found for ${heatingId}` };
			}
		} catch (error) {
			return { success: false, message: `Error testing Modbus sync: ${error.message}` };
		}
	}
}
