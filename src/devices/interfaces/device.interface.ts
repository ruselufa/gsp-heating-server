export interface Device {
	id: string;
	name: string;
	type: string;
	location: string;
	status: {
		isOnline: boolean;
		lastSeen: Date;
	};
}
