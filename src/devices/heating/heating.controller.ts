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
						this.heatingService.setPumpSpeed(heatingId, parameters.pumpSpeed);
					}
					break;
				case 'set_valve':
					if (parameters?.valvePosition !== undefined) {
						const action = parameters.valvePosition > 0 ? 'open' : 'close';
						this.heatingService.setValve(heatingId, action);
					}
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

	@Post(':heatingId/pump-speed')
	setPumpSpeed(@Param('heatingId') heatingId: string, @Body() body: { speed: number }) {
		try {
			this.heatingService.setPumpSpeed(heatingId, body.speed);
			return { success: true, message: `Pump speed set to ${body.speed} for heating ${heatingId}` };
		} catch (error) {
			return { success: false, message: `Error setting pump speed: ${error.message}` };
		}
	}

	@Post(':heatingId/valve')
	setValve(@Param('heatingId') heatingId: string, @Body() body: { action: 'open' | 'close' }) {
		try {
			this.heatingService.setValve(heatingId, body.action);
			return { success: true, message: `Valve ${body.action} command sent for heating ${heatingId}` };
		} catch (error) {
			return { success: false, message: `Error controlling valve: ${error.message}` };
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
}
