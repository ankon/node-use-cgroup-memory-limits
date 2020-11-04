import { readFileSync } from 'fs';

interface MountInfo {
	mountId: string;
	parentId: string;
	majorMinor: string;
	mountRoot: string;
	mountPoint: string;
	flags: string[];
	type: string;
}

function readMountInfo(): MountInfo[] {
	try {
		// See https://man7.org/linux/man-pages/man5/proc.5.html for a description of the fields
		const mountInfoContents = readFileSync('/proc/self/mountinfo', 'utf8');
		return mountInfoContents
			.split(/\n/)
			.filter(mountInfoLine => mountInfoLine.trim().length > 0)
			.map(mountInfoLine => {
				// "1503 1494 0:27 / /sys/fs/cgroup ro,nosuid,nodev,noexec,relatime - cgroup2 cgroup2 rw,seclabel,nsdelegate"
				const [
					mountId,
					parentId,
					majorMinor,
					mountRoot,
					mountPoint,
					flags,
					/* Ignored */,
					type,
					/* Ignored */,
					/* Ignored */,
				] = mountInfoLine.split(/ /);
				return {
					mountId,
					parentId,
					majorMinor,
					mountRoot,
					mountPoint,
					flags: flags.split(/,/),
					type,
				};
			});
	} catch (err) {
		// This should be fine, just indicating an unsupported operating system (or a bug in parsing ...)
		console.debug(`Cannot read mount info: ${err.message}`);
		return [];
	}
}

type GetMemoryLimits = () => number;

function readLimitValue(path: string, maxValue: number = -1): number {
	try {
		const memoryLimitString = readFileSync(path, 'utf8').trim();
		return memoryLimitString === 'max' ? maxValue : Number(memoryLimitString);
	} catch (err) {
		// Fine then.
		console.debug(`Cannot read limit at ${path}: ${err.message}`);
	}
	return -1;
}

function createGetMemoryLimitsCgroups(mountPoint: string): GetMemoryLimits {
	return () => {
		return readLimitValue(`${mountPoint}/memory/memory.limit_in_bytes`);
	};
}

function createGetMemoryLimitsCgroupsV2(mountPoint: string): GetMemoryLimits {
	return () => {
		// The limit we want is essentially the sum of the memory.max value and the memory.swap.max
		// value.
		// See https://github.com/openjdk/jdk/blob/master/src/hotspot/os/linux/cgroupV2Subsystem_linux.cpp
		// See https://git.kernel.org/pub/scm/linux/kernel/git/tj/cgroup.git/tree/Documentation/admin-guide/cgroup-v2.rst
		// The question here is how we account a swap max of "max" (-1): One can argue that this means the process
		// could use whatever memory it wants, as it will get paged out if needed. On the other hand clearly
		// this feels wrong in a containerized environment.
		const memorySwapMax = readLimitValue(`${mountPoint}/memory.swap.max`);
		if (memorySwapMax === -1) {
			return -1;
		}

		const memoryMax = readLimitValue(`${mountPoint}/memory.max`);
		if (memoryMax === -1) {
			return -1;
		}

		return memoryMax + memorySwapMax;
	};
}

export function findExtraNodeOptions() {
	// Note that this is very much inspired by the logic used in Hotspot, see
	// https://github.com/openjdk/jdk/blob/master/src/hotspot/os/linux/cgroupSubsystem_linux.cpp
	// and related sources for more details on what could be done.
	const mountInfo = readMountInfo();

	let getMemoryLimits: GetMemoryLimits | undefined;
	// Find a cgroup mount point
	// XXX: Cgroup v1 seems to be outdated ...
	const cgroup1MountInfo = mountInfo.find(({ type }) => type === 'cgroup');
	// XXX: This might need to also look into the /proc/self/cgroup file to find the mount point
	const cgroup2MountInfo = mountInfo.find(({ type }) => type === 'cgroup2');
	if (cgroup1MountInfo) {
		console.debug(`Detected cgroups at ${cgroup1MountInfo.mountPoint}`);
		getMemoryLimits = createGetMemoryLimitsCgroups(cgroup1MountInfo.mountPoint);
	} else if (cgroup2MountInfo) {
		console.debug(`Detected cgroups v2 at ${cgroup2MountInfo.mountPoint}`);
		getMemoryLimits = createGetMemoryLimitsCgroupsV2(cgroup2MountInfo.mountPoint);
	}

	if (getMemoryLimits) {
		const limitInBytes = getMemoryLimits();
		if (limitInBytes > 0) {
			console.debug(`Applying cgroup memory limit: ${limitInBytes}`);
			return `--max-old-space-size=${limitInBytes / 1048576}`;
		}
	}
	return '';
}
