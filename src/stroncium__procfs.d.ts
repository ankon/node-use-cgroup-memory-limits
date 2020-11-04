declare module '@stroncium/procfs' {
	type DevId = number;
	type Path = string;

	interface ProcessMountinfo {
		devId: DevId;
		mountId: number;
		mountOptions: string[];
		mountPoint: Path;
		mountSource: string;
		optionalFields: string[];
		parentId: number;
		root: string;
		superOptions: string[];
		type: string;
	}

	export class Procfs {
		processMountinfo: (pid?: number) => ProcessMountinfo[];
	}

	export const procfs: Procfs;
}
