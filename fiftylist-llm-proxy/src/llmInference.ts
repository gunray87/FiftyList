import { runClaude } from './anthropicClient';
import {
	SUGGESTION_CAVEAT_MAX_CHARS,
	SUGGESTION_EXPLANATION_MAX_CHARS,
} from './suggestionCopyLimits';
import {
	mergeFilmIntoTasteNarrative,
	finalizeTasteNarrative,
	TASTE_NARRATIVE_MAX_CHARS,
} from './tasteNarrative';

export {
	ensureMovieCoverageInNarrative,
	mergeFilmIntoTasteNarrative,
	buildFilmTasteParagraph,
	finalizeTasteNarrative,
	trimTasteNarrative,
	TASTE_NARRATIVE_MAX_CHARS,
} from './tasteNarrative';

export type LlmTextResult = {
	response?: string;
};

/** @deprecated alias */
export type WorkersAiTextResult = LlmTextResult;

export function extractAiResponseText(result: unknown): string {
	if (result == null) return '';
	if (typeof result === 'string') return result;
	if (typeof result !== 'object') return '';

	const r = result as Record<string, unknown>;
	if (typeof r.response === 'string') return r.response;
	if (r.response && typeof r.response === 'object') {
		try {
			return JSON.stringify(r.response);
		} catch {
			return '';
		}
	}
	return '';
}

const TASTE_PROFILE_SYSTEM = `You write a taste profile for someone tracking books and movies in FiftyList.
Return JSON only: {"narrative":string}

Rules:
- narrative: 4-6 complete sentences, second person ("you"), max ${TASTE_NARRATIVE_MAX_CHARS} characters.
- Every sentence must end with . ! or ? — never stop mid-sentence or mid-word.
- Input splits topRatedBooks and topRatedMovies. Use BOTH arrays when non-empty.
- If mediaSummary.ratedMovies > 0 AND mediaSummary.ratedBooks > 0: dedicate at least one full sentence to books (titles/authors from topRatedBooks) AND at least one full sentence to films (titles/directors from topRatedMovies). Never call them only a "reader" or imply they only read.
- If only movies: focus on films, directors, topMovieGenres, and viewing formats (streaming/theater). If only books: focus on reading and topBookGenres.
- Name at least one concrete title from topRatedMovies when that array is non-empty; same for books when topRatedBooks is non-empty.
- Use "film"/"movie"/"director" for movies; "book"/"author" for books.
- Only use supplied data; never invent private facts.
- No medical, financial, or dating advice.`;

const MOOD_INTENT_SYSTEM = `Map a short mood phrase for book+movie suggestions into structured weights only.
Return JSON only:
{"maxLength":"short|medium|long|any","boostGenres":string[],"avoidGenres":string[]}

Rules:
- boostGenres / avoidGenres: lowercase slugs (e.g. "thriller", "literary", "horror"). Max 5 each.
- maxLength: short = quick reads/shorter films; long = epic; any if unclear.
- If phrase has "like [title]" early (e.g. adventure nonfiction), that theme is primary; author names after "love" at the end are secondary — do not boost fantasy only because an author writes fantasy.
- No prose. No extra keys.`;

const STOPPED_RECOVERY_SYSTEM = `A user stopped a book or movie. Suggest ONE alternative work.
Return JSON only:
{"alternative":{"title":string,"author":string,"media":"book"|"movie","explanation":string}}

Rules:
- explanation: exactly 2 sentences, causal — why they likely stopped THIS item and why the alternative reduces that friction.
- Use real, well-known titles. author may be "" for films.
- No shame. No extra keys.`;

const SUGGESTIONS_RICH_SYSTEM = (exactCount: number, includeFormat: boolean) => {
	const formatRule = includeFormat
		? '- format_suggestion: books "text"|"audio"|null; movies "streaming"|null only when relevant.\n'
		: '- Do NOT include format_suggestion (omit the key entirely).\n';
	return `Write rich suggestion card copy for exactly ${exactCount} candidates.
Return JSON only:
{"items":[{"id":string,"score":number,"explanation":string,"caveat":string|null${includeFormat ? ',"format_suggestion":string|null' : ''}}]}

Rules:
- Output EXACTLY ${exactCount} items; each id MUST match input ids once.
- explanation: max ${SUGGESTION_EXPLANATION_MAX_CHARS} characters total, at most 2 short sentences. If refineContext is present, tie copy to primaryTitleAnchors and primaryGenreSlugs first; secondaryAuthorAnchors are optional flavor only. Otherwise use lovedHighlights and tasteNarrative. Use "film"/"movie" for movie candidates and "book" for book candidates. Never say "semantically similar".
- If candidate has similarToTitle, explain the link in plain language within the character limit.
- caveat: max ${SUGGESTION_CAVEAT_MAX_CHARS} characters, one brief hedge sentence, or null if not borderline.
${formatRule}- score: 0-100. No markdown. Compact JSON.`;
};

export function getTasteProfileSystemPrompt(): string {
	return TASTE_PROFILE_SYSTEM;
}

export function getMoodIntentSystemPrompt(): string {
	return MOOD_INTENT_SYSTEM;
}

export function getStoppedRecoverySystemPrompt(): string {
	return STOPPED_RECOVERY_SYSTEM;
}

export function getSuggestionsRichSystemPrompt(exactCount: number, includeFormat: boolean): string {
	return SUGGESTIONS_RICH_SYSTEM(exactCount, includeFormat);
}

export type LlmTier = 'taste' | 'fast';

export function modelForTasteProfile(env: Cloudflare.Env): string {
	return (
		env.LLM_CLAUDE_MODEL_TASTE ||
		env.LLM_CLAUDE_MODEL ||
		'claude-haiku-4-5'
	);
}

export function modelForFastLlm(env: Cloudflare.Env): string {
	return (
		env.LLM_CLAUDE_MODEL_FAST ||
		env.LLM_CLAUDE_MODEL ||
		'claude-haiku-4-5'
	);
}

/** All LLM routes call Anthropic Claude via Messages API (key in Worker secrets). */
export async function runLlm(
	env: Cloudflare.Env,
	tier: LlmTier,
	systemPrompt: string,
	userPrompt: string,
	maxTokens: number,
	temperature: number
): Promise<LlmTextResult> {
	const model = tier === 'taste' ? modelForTasteProfile(env) : modelForFastLlm(env);
	return runClaude(env, {
		model,
		systemPrompt,
		userPrompt,
		maxTokens,
		temperature,
		cacheSystemPrompt: true,
	});
}

/** @deprecated use runLlm */
export async function runWorkersAi(
	env: Cloudflare.Env,
	_model: string,
	systemPrompt: string,
	userPrompt: string,
	maxTokens: number,
	temperature: number
): Promise<LlmTextResult> {
	return runLlm(env, 'fast', systemPrompt, userPrompt, maxTokens, temperature);
}

const DAY_MS = 24 * 60 * 60 * 1000;

type KvNarrativeEntry = { narrative: string; cachedAt: string };

export async function getTasteProfileFromKv(
	env: Cloudflare.Env,
	summaryHash: string
): Promise<string | null> {
	if (!env.TASTE_PROFILE_CACHE || !summaryHash) return null;
	try {
		const raw = await env.TASTE_PROFILE_CACHE.get(`tp6:${summaryHash}`);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as KvNarrativeEntry;
		if (!parsed.narrative || !parsed.cachedAt) return null;
		const age = Date.now() - new Date(parsed.cachedAt).getTime();
		if (age > DAY_MS) return null;
		return finalizeTasteNarrative(parsed.narrative);
	} catch {
		return null;
	}
}

export async function putTasteProfileKv(
	env: Cloudflare.Env,
	summaryHash: string,
	narrative: string
): Promise<void> {
	if (!env.TASTE_PROFILE_CACHE || !summaryHash) return;
	const entry: KvNarrativeEntry = {
		narrative: trimTasteNarrative(narrative),
		cachedAt: new Date().toISOString(),
	};
	await env.TASTE_PROFILE_CACHE.put(`tp7:${summaryHash}`, JSON.stringify(entry), {
		expirationTtl: 86400,
	});
}
