import { Controller, Get, Post, Put, Body, Param } from '@nestjs/common';
import { BatteriesService } from './batteries.service';
import { BatteriesControl, BatteriesControlParameters } from '../interfaces/batteries.interface';

@Controller('batteries')
export class BatteriesController {
	constructor(private readonly batteriesService: BatteriesService) {}

	@Get()
	getAllBatteriesDevices() {
		return this.batteriesService.getAllStates();
	}

	@Get('configs')
	getAllConfigs() {
		return this.batteriesService.getAllConfigs();
	}

	@Get('stats')
	getSystemStats() {
		return this.batteriesService.getSystemStats();
	}

	@Get(':deviceId')
	getBatteriesDevice(@Param('deviceId') deviceId: string) {
		const state = this.batteriesService.getState(deviceId);
		if (!state) {
			return { error: 'Batteries device not found' };
		}
		return state;
	}

	@Get(':deviceId/config')
	getDeviceConfig(@Param('deviceId') deviceId: string) {
		const config = this.batteriesService.getConfig(deviceId);
		if (!config) {
			return { error: 'Batteries device config not found' };
		}
		return config;
	}

	@Post(':deviceId/control')
	controlBatteries(@Param('deviceId') deviceId: string, @Body() control: BatteriesControl) {
		const { command, parameters } = control;

		try {
			switch (command) {
				case 'turn_on':
					this.batteriesService.enableAutoControl(deviceId);
					break;
				case 'turn_off':
					this.batteriesService.disableAutoControl(deviceId);
					break;
				case 'set_temperature':
					if (parameters?.temperature) {
						this.batteriesService.setTemperature(deviceId, parameters.temperature);
					}
					break;
				case 'set_valve_state':
					if (parameters?.groupName && parameters?.valveState !== undefined) {
						const open = parameters.valveState === 'open';
						this.batteriesService.setGroupValveManually(deviceId, parameters.groupName, open);
					}
					break;
				default:
					return { success: false, message: `Unknown command: ${command}` };
			}

			return { success: true, message: `Command ${command} executed for batteries ${deviceId}` };
		} catch (error) {
			return { success: false, message: `Error executing command: ${error.message}` };
		}
	}

	@Put(':deviceId/temperature')
	setTemperature(@Param('deviceId') deviceId: string, @Body() body: { temperature: number }) {
		try {
			this.batteriesService.setTemperature(deviceId, body.temperature);
			return { success: true, message: `Temperature set to ${body.temperature}°C for batteries ${deviceId}` };
		} catch (error) {
			return { success: false, message: `Error setting temperature: ${error.message}` };
		}
	}

	@Post(':deviceId/auto-control/enable')
	enableAutoControl(@Param('deviceId') deviceId: string) {
		try {
			this.batteriesService.enableAutoControl(deviceId);
			return { success: true, message: `Auto control enabled for batteries ${deviceId}` };
		} catch (error) {
			return { success: false, message: `Error enabling auto control: ${error.message}` };
		}
	}

	@Post(':deviceId/auto-control/disable')
	disableAutoControl(@Param('deviceId') deviceId: string) {
		try {
			this.batteriesService.disableAutoControl(deviceId);
			return { success: true, message: `Auto control disabled for batteries ${deviceId}` };
		} catch (error) {
			return { success: false, message: `Error disabling auto control: ${error.message}` };
		}
	}

	@Post(':deviceId/emergency-stop')
	emergencyStop(@Param('deviceId') deviceId: string) {
		try {
			this.batteriesService.emergencyStop(deviceId);
			return { success: true, message: `Emergency stop activated for batteries ${deviceId}` };
		} catch (error) {
			return { success: false, message: `Error activating emergency stop: ${error.message}` };
		}
	}

	@Post(':deviceId/emergency-stop/reset')
	resetEmergencyStop(@Param('deviceId') deviceId: string) {
		try {
			this.batteriesService.resetEmergencyStop(deviceId);
			return { success: true, message: `Emergency stop reset for batteries ${deviceId}` };
		} catch (error) {
			return { success: false, message: `Error resetting emergency stop: ${error.message}` };
		}
	}

	@Post(':deviceId/group/:groupName/valve')
	setGroupValve(@Param('deviceId') deviceId: string, @Param('groupName') groupName: string, @Body() body: { open: boolean }) {
		try {
			this.batteriesService.setGroupValveManually(deviceId, groupName, body.open);
			return { 
				success: true, 
				message: `Valve for group ${groupName} in device ${deviceId} set to ${body.open ? 'open' : 'closed'}` 
			};
		} catch (error) {
			return { success: false, message: `Error setting group valve: ${error.message}` };
		}
	}

	@Post(':deviceId/test-mqtt')
	testMqtt(@Param('deviceId') deviceId: string, @Body() body: { 
		groupName: string; 
		relay: string; 
		value: number;
	}) {
		try {
			this.batteriesService.testMqttCommand(deviceId, body.groupName, body.relay, body.value);
			return { 
				success: true, 
				message: `Test MQTT command sent to device ${deviceId}, group ${body.groupName}, relay ${body.relay}, value: ${body.value}` 
			};
		} catch (error) {
			return { success: false, message: `Error sending test MQTT: ${error.message}` };
		}
	}
}
