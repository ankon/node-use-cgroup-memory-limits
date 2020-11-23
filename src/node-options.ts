import { readFileSync } from 'fs';

import { procfs } from '@stroncium/procfs';

import { isExplicitMemorySizeOption } from './utils';

/** @visibleForTesting */
export type GetMemoryLimits = () => number;

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

function createGetMemoryLimitsCgroups(memoryControllerMountPoint: string): GetMemoryLimits {
	return () => {
		return readLimitValue(`${memoryControllerMountPoint}/memory.limit_in_bytes`);
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

function selectGetMemoryLimits(): GetMemoryLimits | undefined {
	// Note that this is very much inspired by the logic used in Hotspot, see
	// https://github.com/openjdk/jdk/blob/master/src/hotspot/os/linux/cgroupSubsystem_linux.cpp
	// and related sources for more details on what could be done.
	const mountInfo = procfs.processMountinfo();

	let getMemoryLimits: GetMemoryLimits | undefined;
	// Find the cgroup mount point for the 'memory' controller
	const cgroup1MountInfo = mountInfo.find(({ type, superOptions }) => type === 'cgroup' && superOptions.includes('memory'));
	// XXX: This might need to also look into the /proc/self/cgroup file to find the mount point
	const cgroup2MountInfo = mountInfo.find(({ type }) => type === 'cgroup2');
	if (cgroup1MountInfo) {
		console.debug(`Detected cgroups at ${cgroup1MountInfo.mountPoint}`);
		getMemoryLimits = createGetMemoryLimitsCgroups(cgroup1MountInfo.mountPoint);
	} else if (cgroup2MountInfo) {
		console.debug(`Detected cgroups v2 at ${cgroup2MountInfo.mountPoint}`);
		getMemoryLimits = createGetMemoryLimitsCgroupsV2(cgroup2MountInfo.mountPoint);
	}

	return getMemoryLimits;
}

/**
 * @param getMemoryLimits for testing
 */
export function findExtraNodeOptions(cgroupMemoryFraction: number, getMemoryLimits?: GetMemoryLimits): string[] {
	if (!getMemoryLimits) {
		getMemoryLimits = selectGetMemoryLimits();
	}

	if (getMemoryLimits) {
		const limitInBytes = getMemoryLimits();
		if (limitInBytes > 0) {
			const limitInMiB = Math.floor(limitInBytes / 1048576 * cgroupMemoryFraction);
			console.debug(`Applying cgroup memory limit: ${limitInMiB}MiB`);
			return [`--max-old-space-size=${limitInMiB}`];
		}
	}
	return [];
}

export function getCgroupMemoryFraction(env: typeof process.env, argv: typeof process.argv, defaultCgroupMemoryFraction: number = 0.7): { cgroupMemoryFraction: number, argv: typeof process.argv } {
	let requireDashDash = false;
	let cgroupMemoryFraction = Number(env.CGROUP_MEMORY_FRACTION) || defaultCgroupMemoryFraction;
	let spawnArgvIndex = 0;
	for (; spawnArgvIndex < argv.length; spawnArgvIndex++) {
		if (argv[spawnArgvIndex] === '--cgroup-memory-fraction') {
			requireDashDash = true;
			cgroupMemoryFraction = Number(argv[++spawnArgvIndex]);
			continue;
		} else if (argv[spawnArgvIndex].startsWith('--cgroup-memory-fraction=')) {
			requireDashDash = true;
			cgroupMemoryFraction = Number(argv[spawnArgvIndex].substring('--cgroup-memory-fraction='.length));
			continue;
		}

		// Unknown for us, depending on whether we require a '--' this is either that, or
		// we can stop.
		if (argv[spawnArgvIndex] === '--') {
			// Great, but we don't want to see this one in the spawn args.
			spawnArgvIndex++;
			break;
		} else if (requireDashDash) {
			// Bad: We need a '--', but this is not it.
			throw new Error(`Cannot parse command-line, expected a '--' at position ${spawnArgvIndex}`);
		} else {
			// Also fine, we didn't expect a '--', and we didn't get one.
			break;
		}
	}

	return {
		cgroupMemoryFraction,
		argv: argv.slice(spawnArgvIndex),
	};
}

/**
 * Get the spawn options
 *
 * @param env the initial process environment
 * @param argv the process arguments
 * @param getExtraNodeOptions For testing: function get extra node options
 */
export function getSpawnOptions(env: typeof process.env, argv: typeof process.argv, getExtraNodeOptions = findExtraNodeOptions): { env: typeof process.env, argv: typeof process.argv } {
	const { cgroupMemoryFraction, argv: spawnArgv } = getCgroupMemoryFraction(env, argv);
	const nodeOptions = env.NODE_OPTIONS ?? '';
	const hasExplicitMemoryLimitInNodeOptions = nodeOptions
		.split(/\s/)
		.some(isExplicitMemorySizeOption);
	const hasExplicitMemoryLimitInArgv = spawnArgv
		.some(isExplicitMemorySizeOption);
	if (!hasExplicitMemoryLimitInNodeOptions && !hasExplicitMemoryLimitInArgv) {
		const extraNodeOptions = getExtraNodeOptions(cgroupMemoryFraction);
		// Put the arguments in the front, as the end will usually be options for whatever is running
		// inside node.
		spawnArgv.unshift(...extraNodeOptions);
	}

	return { env, argv: spawnArgv };
}