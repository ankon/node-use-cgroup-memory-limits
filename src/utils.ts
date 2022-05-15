
export function isExplicitMemorySizeOption(option: string) {
	return /^--max-(old-space|semi-space|heap)-size(=\d+)?$/.test(option);
}
