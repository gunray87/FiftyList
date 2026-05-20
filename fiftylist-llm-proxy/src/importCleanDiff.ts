/**
 * Apply model-produced line edits to pasted import text.
 * Line numbers are 1-based, relative to the input split on /\r?\n/.
 * Order: apply all replace_lines in-place, then remove_lines from highest index to lowest.
 */
export function applyImportCleanDiff(
	rawText: string,
	diff: {
		remove_lines?: unknown;
		replace_lines?: unknown;
	},
): string {
	const lines = rawText.split(/\r?\n/);
	const initialLen = lines.length;

	const replaceRaw = diff.replace_lines;
	if (replaceRaw && typeof replaceRaw === 'object' && !Array.isArray(replaceRaw)) {
		for (const [k, v] of Object.entries(replaceRaw as Record<string, unknown>)) {
			if (typeof v !== 'string') continue;
			const lineNum = Number.parseInt(k, 10);
			if (!Number.isFinite(lineNum) || lineNum < 1 || lineNum > initialLen) continue;
			lines[lineNum - 1] = v;
		}
	}

	const removeRaw = diff.remove_lines;
	const toRemove: number[] = [];
	if (Array.isArray(removeRaw)) {
		for (const item of removeRaw) {
			const lineNum = typeof item === 'number' ? item : Number(item);
			if (!Number.isFinite(lineNum)) continue;
			const n = Math.floor(lineNum);
			if (n < 1 || n > initialLen) continue;
			toRemove.push(n);
		}
	}

	const uniqueDesc = [...new Set(toRemove)].sort((a, b) => b - a);
	for (const lineNum of uniqueDesc) {
		const idx = lineNum - 1;
		if (idx >= 0 && idx < lines.length) {
			lines.splice(idx, 1);
		}
	}

	return lines.join('\n');
}

export function hasImportCleanDiffOps(parsed: {
	remove_lines?: unknown;
	replace_lines?: unknown;
}): boolean {
	const removes = Array.isArray(parsed.remove_lines) && parsed.remove_lines.length > 0;
	const rep = parsed.replace_lines;
	const hasReplaces =
		rep &&
		typeof rep === 'object' &&
		!Array.isArray(rep) &&
		Object.keys(rep as object).length > 0;
	return removes || Boolean(hasReplaces);
}
