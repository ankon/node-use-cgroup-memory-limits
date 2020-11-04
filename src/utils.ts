
export function isMaxOldSpaceSizeOption(option: string) {
	return /^--max-old-space-size(=\d+)?/.test(option);
}
