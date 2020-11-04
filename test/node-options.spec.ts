import { patchRequire } from 'fs-monkey';
import { DirectoryJSON, vol } from 'memfs';

import { findExtraNodeOptions } from '../src/node-options';

// Mock 'fs', EXCEPT for require() calls.
jest.mock('fs', () => require('memfs').fs);
const fs = jest.requireActual('fs');
patchRequire(fs);

const { readFileSync } = fs;

function runFindExtraNodeOptions(contents: DirectoryJSON) {
	// XXX: Will this now configure the 'fs'?
	vol.fromJSON(contents, '/');
	return findExtraNodeOptions();
}

describe('node-options', () => {
	describe('cgroups', () => {
		it.each(['cgroup-eks'])('finds the memory limit (%s)', fixture => {
			const cgroupsFS = {
				'/proc/self/mountinfo': readFileSync(`${__dirname}/${fixture}/mountinfo`, 'utf8'),
				'/proc/self/cgroup': readFileSync(`${__dirname}/${fixture}/cgroup`, 'utf8'),
				'/sys/fs/cgroup/memory/memory.limit_in_bytes': '314572800\n',
			};
			const extraOptions = runFindExtraNodeOptions(cgroupsFS);
			expect(extraOptions).toEqual('--max-old-space-size=300');
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
			const extraOptions = runFindExtraNodeOptions(cgroupsV2FS);
			expect(extraOptions).toEqual('--max-old-space-size=600');
		});
	});
});
