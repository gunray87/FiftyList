/**
 * Suggestion card copy limits — keep in sync with fiftylist-llm-proxy/src/suggestionCopyLimits.ts
 * Sized for ~4 lines (reason) + ~2 lines (caveat) on a typical phone width.
 */
export const SUGGESTION_EXPLANATION_MAX_CHARS = 200;
export const SUGGESTION_CAVEAT_MAX_CHARS = 96;
export const SUGGESTION_REASON_SHORT_MAX_CHARS = 80;

export function trimSuggestionCopy(text: string, max: number): string {
	const trimmed = text.trim();
	if (!trimmed || trimmed.length <= max) return trimmed;
	const cut = trimmed.slice(0, max);
	const lastSpace = cut.lastIndexOf(' ');
	if (lastSpace > Math.floor(max * 0.65)) {
		return `${cut.slice(0, lastSpace).trimEnd()}…`;
	}
	return `${cut.trimEnd()}…`;
}
