export interface MqttConfig {
	host: string;
	port: number;
	username?: string;
	password?: string;
	clientId: string;
	protocol: 'mqtt' | 'mqtts';
}

export const mqttConfigs: Record<string, MqttConfig> = {
	heating: {
		host: process.env.MQTT_HOST_HEATING || '192.168.1.10',
		port: parseInt(process.env.MQTT_PORT_HEATING || '1883'),
		clientId: 'gsp_heating_client',
		protocol: 'mqtt',
	},
	sensors: {
		host: process.env.MQTT_HOST_SENSORS || '192.168.1.10',
		port: parseInt(process.env.MQTT_PORT_SENSORS || '1883'),
		clientId: 'gsp_heating_sensors_client',
		protocol: 'mqtt',
	},
};
