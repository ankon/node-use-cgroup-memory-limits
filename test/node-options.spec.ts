import { patchRequire } from 'fs-monkey';
import { DirectoryJSON, vol } from 'memfs';

import { findExtraNodeOptions, getCgroupMemoryFraction, GetMemoryLimits, getSpawnOptions } from '../src/node-options';

// Mock 'fs', EXCEPT for require() calls.
jest.mock('fs', () => require('memfs').fs);
const fs = jest.requireActual('fs');
patchRequire(fs);

const { readFileSync } = fs;

function runFindExtraNodeOptions(contents: DirectoryJSON, cgroupMemoryFraction: number, getMemoryLimits?: GetMemoryLimits) {
	// Configure the mocked file system
	vol.fromJSON(contents, '/');
	return findExtraNodeOptions(cgroupMemoryFraction, getMemoryLimits);
}

describe('node-options', () => {
	describe('findExtraNodeOptions', () => {
		describe('cgroups', () => {
			it.each(['cgroup-eks'])('finds the memory limit (%s)', fixture => {
				const cgroupsFS = {
					'/proc/self/mountinfo': readFileSync(`${__dirname}/${fixture}/mountinfo`, 'utf8'),
					'/proc/self/cgroup': readFileSync(`${__dirname}/${fixture}/cgroup`, 'utf8'),
					'/sys/fs/cgroup/memory/memory.limit_in_bytes': '314572800\n',
				};
				const extraOptions = runFindExtraNodeOptions(cgroupsFS, 1);
				expect(extraOptions).toEqual(['--max-old-space-size=300']);
			});
		});

		describe('cgroups v2', () => {
			it.each(['cgroupv2-fedora-podman'])('finds the memory limit (%s)', fixture => {
				const cgroupsV2FS = {
					'/proc/self/mountinfo': readFileSync(`${__dirname}/${fixture}/mountinfo`, 'utf8'),
					'/proc/self/cgroup': '0::/\n',
					'/sys/fs/cgroup/memory.max': '314572800\n',
					'/sys/fs/cgroup/memory.swap.max': '314572800\n',
				};
				const extraOptions = runFindExtraNodeOptions(cgroupsV2FS, 1);
				expect(extraOptions).toEqual(['--max-old-space-size=600']);
			});
		});

		it('applies cgroup memory fraction', () => {
			const extraOptions = runFindExtraNodeOptions({}, 0.5, () => 600 * 1048576);
			expect(extraOptions).toEqual(['--max-old-space-size=300']);

		});
	});

	describe('getSpawnOptions', () => {
		it('ignores extra options when --max-old-space-size exists in argv', () => {
			const { argv } = getSpawnOptions({}, ['--max-old-space-size=400'], () => ['EXTRA']);
			expect(argv).not.toContain('EXTRA');
		});
		it('ignores extra options when --max-old-space-size exists in env.NODE_OPTIONS', () => {
			const { argv } = getSpawnOptions({ NODE_OPTIONS: '--max-old-space-size=400' }, [], () => ['EXTRA']);
			expect(argv).not.toContain('EXTRA');
		});

		it('prepends extra options to argv', () => {
			const { argv } = getSpawnOptions({}, ['existing'], () => ['EXTRA']);
			expect(argv).toEqual(['EXTRA', 'existing']);
		});
	});

	describe('getCgroupMemoryFraction', () => {
		it('returns default', () => {
			const defaultValue = 0.7;
			const { cgroupMemoryFraction } = getCgroupMemoryFraction({}, [], defaultValue);
			expect(cgroupMemoryFraction).toEqual(defaultValue);
		});
		it('returns argv unmodified if not found', () => {
			const argv = ['alpha', 'beta', 'gamma'];
			const { argv: returnedArgv } = getCgroupMemoryFraction({}, argv);
			expect(returnedArgv).toEqual(argv);
		});
		it('returns value from CGROUP_MEMORY_FRACTION environment variable', () => {
			const envValue = 0.8;
			const { cgroupMemoryFraction } = getCgroupMemoryFraction({ CGROUP_MEMORY_FRACTION: `${envValue}`}, [], 0.7);
			expect(cgroupMemoryFraction).toEqual(envValue);
		});
		it('removes leading "--" from argv', () => {
			const argv = ['--', 'alpha', 'beta', 'gamma'];
			const { argv: returnedArgv } = getCgroupMemoryFraction({}, argv);
			expect(returnedArgv).toEqual(argv.slice(1));
		});

		const argvValue = 0.2;
		[['--cgroup-memory-fraction', `${argvValue}`], [`--cgroup-memory-fraction=${argvValue}`]].forEach(fractionArgv => {
			it(`parses fraction argument "${fractionArgv.join(' ')}"`, () => {
				const otherArgv = ['alpha', 'beta', 'gamma'];
				const argv = [...fractionArgv, '--', ...otherArgv];
				const { cgroupMemoryFraction, argv: returnedArgv } = getCgroupMemoryFraction({}, argv);
				expect(cgroupMemoryFraction).toEqual(argvValue);
				expect(returnedArgv).toEqual(otherArgv);

			});
			it(`throws error for unexpected argument after fraction argument "${fractionArgv.join(' ')}"`, () => {
				const argv = [...fractionArgv, 'unexpected thing'];
				expect(() => getCgroupMemoryFraction({}, argv)).toThrowError();
			});
			it(`uses fraction argument "${fractionArgv.join(' ')}" over environment variable`, () => {
				const envValue = 0.8;
				const argv = [...fractionArgv];
				const { cgroupMemoryFraction } = getCgroupMemoryFraction({ CGROUP_MEMORY_FRACTION: `${envValue}` }, argv, 0.7);
				expect(cgroupMemoryFraction).toEqual(argvValue);
			});
		});
	});
});
