import { patchRequire } from 'fs-monkey';
import { DirectoryJSON, vol } from 'memfs';

import { findExtraNodeOptions, processOwnOptions, GetMemoryLimits, getSpawnOptions, OwnOptions, DEFAULT_OPTIONS } from '../src/node-options';

// Mock 'fs', EXCEPT for require() calls.
jest.mock('fs', () => require('memfs').fs);
const fs = jest.requireActual('fs');
patchRequire(fs);

const { readFileSync } = fs;

function runFindExtraNodeOptions(contents: DirectoryJSON, defaultOptions: OwnOptions, getMemoryLimits?: GetMemoryLimits) {
	// Configure the mocked file system
	vol.fromJSON(contents, '/');
	return findExtraNodeOptions(defaultOptions, getMemoryLimits);
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
				const extraOptions = runFindExtraNodeOptions(cgroupsFS, { memoryFraction: 1, memoryRegion: 'old-space' });
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
				const extraOptions = runFindExtraNodeOptions(cgroupsV2FS, { memoryFraction: 1, memoryRegion: 'old-space' });
				expect(extraOptions).toEqual(['--max-old-space-size=600']);
			});
		});

		it('applies cgroup memory fraction', () => {
			const extraOptions = runFindExtraNodeOptions({}, { memoryFraction: 0.5, memoryRegion: 'old-space' }, () => 600 * 1048576);
			expect(extraOptions).toEqual(['--max-old-space-size=300']);

		});
	});

	describe('getSpawnOptions', () => {
		['--max-old-space-size', '--max-semi-space-size', '--max-heap-size'].forEach(option => {
			it(`ignores extra options when ${option} exists in argv`, () => {
				const { argv } = getSpawnOptions({}, [`${option}=400`], () => ['EXTRA']);
				expect(argv).not.toContain('EXTRA');
			});
			it(`ignores extra options when ${option} exists in env.NODE_OPTIONS`, () => {
				const { argv } = getSpawnOptions({ NODE_OPTIONS: `${option}=400` }, [], () => ['EXTRA']);
				expect(argv).not.toContain('EXTRA');
			});
		});
		it('prepends extra options to argv', () => {
			const { argv } = getSpawnOptions({}, ['existing'], () => ['EXTRA']);
			expect(argv).toEqual(['EXTRA', 'existing']);
		});
	});

	describe('processOwnOptions', () => {
		it('returns argv unmodified if not found', () => {
			const argv = ['alpha', 'beta', 'gamma'];
			const { argv: returnedArgv } = processOwnOptions({}, argv);
			expect(returnedArgv).toEqual(argv);
		});
		it('removes leading "--" from argv', () => {
			const argv = ['--', 'alpha', 'beta', 'gamma'];
			const { argv: returnedArgv } = processOwnOptions({}, argv);
			expect(returnedArgv).toEqual(argv.slice(1));
		});

		describe('memory fraction', () => {
			it('returns default', () => {
				const { memoryFraction } = processOwnOptions({}, [], DEFAULT_OPTIONS);
				expect(memoryFraction).toEqual(DEFAULT_OPTIONS.memoryFraction);
			});
			it('returns value from CGROUP_MEMORY_FRACTION environment variable', () => {
				const envValue = 0.8;
				const { memoryFraction } = processOwnOptions({ CGROUP_MEMORY_FRACTION: `${envValue}`}, [], DEFAULT_OPTIONS);
				expect(memoryFraction).toEqual(envValue);
			});

			const argvValue = 0.2;
			[['--cgroup-memory-fraction', `${argvValue}`], [`--cgroup-memory-fraction=${argvValue}`]].forEach(fractionArgv => {
				it(`parses fraction argument "${fractionArgv.join(' ')}"`, () => {
					const otherArgv = ['alpha', 'beta', 'gamma'];
					const argv = [...fractionArgv, '--', ...otherArgv];
					const { memoryFraction, argv: returnedArgv } = processOwnOptions({}, argv);
					expect(memoryFraction).toEqual(argvValue);
					expect(returnedArgv).toEqual(otherArgv);

				});
				it(`throws error for unexpected argument after fraction argument "${fractionArgv.join(' ')}"`, () => {
					const argv = [...fractionArgv, 'unexpected thing'];
					expect(() => processOwnOptions({}, argv)).toThrowError();
				});
				it(`uses fraction argument "${fractionArgv.join(' ')}" over environment variable`, () => {
					const envValue = 0.8;
					const argv = [...fractionArgv];
					const { memoryFraction } = processOwnOptions({ CGROUP_MEMORY_FRACTION: `${envValue}` }, argv, DEFAULT_OPTIONS);
					expect(memoryFraction).toEqual(argvValue);
				});
				it(`uses last fraction argument "${fractionArgv.join(' ')}"`, () => {
					const argv = ['--cgroup-memory-fraction=1', ...fractionArgv];
					const { memoryFraction } = processOwnOptions({}, argv, DEFAULT_OPTIONS);
					expect(memoryFraction).toEqual(argvValue);
				});
			});
		});
		describe('memory region', () => {
			it('returns default', () => {
				const { memoryRegion } = processOwnOptions({}, [], DEFAULT_OPTIONS);
				expect(memoryRegion).toEqual(DEFAULT_OPTIONS.memoryRegion);
			});
			['old-space', 'heap'].forEach(envValue => {
				it('returns value from CGROUP_MEMORY_REGION environment variable', () => {
					const { memoryRegion } = processOwnOptions({ CGROUP_MEMORY_REGION: envValue}, [], DEFAULT_OPTIONS);
					expect(memoryRegion).toEqual(envValue);
				});
			});

			['old-space', 'heap'].forEach(argvValue => {
				[['--cgroup-memory-region', `${argvValue}`], [`--cgroup-memory-region=${argvValue}`]].forEach(regionArgv => {
					it(`parses region argument "${regionArgv.join(' ')}"`, () => {
						const otherArgv = ['alpha', 'beta', 'gamma'];
						const argv = [...regionArgv, '--', ...otherArgv];
						const { memoryRegion, argv: returnedArgv } = processOwnOptions({}, argv);
						expect(memoryRegion).toEqual(argvValue);
						expect(returnedArgv).toEqual(otherArgv);

					});
					it(`throws error for unexpected argument after fraction argument "${regionArgv.join(' ')}"`, () => {
						const argv = [...regionArgv, 'unexpected thing'];
						expect(() => processOwnOptions({}, argv)).toThrowError();
					});
					it(`uses region argument "${regionArgv.join(' ')}" over environment variable`, () => {
						const envValue = 'env-value-is-invalid';
						const argv = [...regionArgv];
						const { memoryRegion } = processOwnOptions({ CGROUP_MEMORY_REGION: `${envValue}` }, argv, DEFAULT_OPTIONS);
						expect(memoryRegion).toEqual(argvValue);
					});
					it(`uses last region argument "${regionArgv.join(' ')}"`, () => {
						const argv = ['--cgroup-memory-region=initial-value-is-invalid', ...regionArgv];
						const { memoryRegion } = processOwnOptions({}, argv, DEFAULT_OPTIONS);
						expect(memoryRegion).toEqual(argvValue);
					});
				});
			});
		});
	});
});
