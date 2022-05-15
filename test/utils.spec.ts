import { isExplicitMemorySizeOption } from '../src/utils';

describe('utils', () => {
	describe('isExplicitMemorySizeOption', () => {
		['old-space', 'semi-space', 'heap'].forEach(memoryRegion => {
			it.each([`--max-${memoryRegion}-size`, `--max-${memoryRegion}-size=400`])('%s: yes', option => {
				expect(isExplicitMemorySizeOption(option)).toEqual(true);
			});
			it.each([`--max-${memoryRegion}-size-something-unknown`, `--max-${memoryRegion}-size-something-unknown=400`])('%s: no', option => {
				expect(isExplicitMemorySizeOption(option)).toEqual(false);
			});

		});
	});
});
