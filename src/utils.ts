
export function isExplicitMemorySizeOption(option: string) {
	return /^--max[-_](old[-_]space|semi[-_]space|heap)[-_]size(=\d+)?$/.test(option);
}
