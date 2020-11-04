import { isMaxOldSpaceSizeOption } from "../src/utils";

describe('utils', () => {
	describe('isMaxOldSpaceSizeOption', () => {
		it.each(['--max-old-space-size', '--max-old-space-size=400'])('%s: yes', option => {
			expect(isMaxOldSpaceSizeOption(option)).toEqual(true);
		});
		it.each(['--max-old-space-size-something-unknown', '--max-old-space-size-something-unknown=400'])('%s: no', option => {
			expect(isMaxOldSpaceSizeOption(option)).toEqual(true);
		});
	});
});
