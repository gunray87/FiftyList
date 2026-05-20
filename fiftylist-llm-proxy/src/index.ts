/**
 * FiftyList LLM proxy (Cloudflare Worker). Inference uses Anthropic Claude via Messages API.
 * API key: ANTHROPIC_API_KEY (Worker secret). App never sees the key.
 */
import { isAnthropicConfigured } from './anthropicClient';
import { applyImportCleanDiff, hasImportCleanDiffOps } from './importCleanDiff';
import { classifyProviderError } from './providerErrors';
import {
	SUGGESTION_CAVEAT_MAX_CHARS,
	SUGGESTION_EXPLANATION_MAX_CHARS,
	SUGGESTION_REASON_SHORT_MAX_CHARS,
	trimSuggestionCopy,
} from './suggestionCopyLimits';
import {
	extractAiResponseText,
	getMoodIntentSystemPrompt,
	getStoppedRecoverySystemPrompt,
	getSuggestionsRichSystemPrompt,
	getTasteProfileSystemPrompt,
	getTasteProfileFromKv,
	putTasteProfileKv,
	mergeFilmIntoTasteNarrative,
	finalizeTasteNarrative,
	runLlm,
	type LlmTextResult,
} from './llmInference';
type ImportCleanBody = {
	rawText: string;
	maxItems?: number;
	mediaTypes?: string[];
};

/** Model output: prefer diff (short); legacy full `cleaned_text` still accepted. */
type ImportCleanModelResult = {
	cleaned_text?: string;
	remove_lines?: unknown;
	replace_lines?: unknown;
	duplicates_removed?: number;
	warnings?: unknown;
};

type SearchIntentBody = {
	query: string;
	mediaType?: 'book' | 'movie';
	scope?: 'user_list' | string;
};

type ItemDraftBody = {
	mediaType?: 'book' | 'movie';
	title?: string;
	author?: string;
	/** Catalog / synopsis — optional extra context besides personal notes */
	description?: string;
	notes?: string;
};

type SuggestionsRefineBody = {
	mediaType?: 'book' | 'movie';
	mode?: 'rerank' | string;
	maxResults?: number;
	/** When true, expect 1–3 candidates and return richer per-card copy (explanation, caveat, format_suggestion). */
	richTopThree?: boolean;
	userFeatures?: {
		preferredGenres?: string[];
		avoidGenres?: string[];
		lengthPreference?: 'short' | 'medium' | 'long' | 'any' | string;
		minRating?: number;
		recentAuthors?: string[];
		additionalContext?: string;
	};
	/** Pre-computed taste summary (~400 tokens) from the client */
	userSummary?: {
		topRated?: Array<{
			title?: string;
			author?: string;
			media?: string;
			rating?: number;
			format?: string | null;
			lengthBucket?: string;
		}>;
		aggregates?: Record<string, unknown>;
		tasteNarrative?: string;
	};
	lovedHighlights?: Array<{ title?: string; author?: string; media?: string }>;
	refineContext?: {
		phrase?: string;
		primaryTitleAnchors?: string[];
		secondaryAuthorAnchors?: string[];
		primaryGenreSlugs?: string[];
	};
	includeFormatSuggestions?: boolean;
	sessionSignals?: {
		activeFilter?: string;
		sortBy?: string;
		recentInteractions?: Array<{ type?: string; itemId?: string }>;
	};
	candidates?: Array<{
		id?: string;
		title?: string;
		author?: string;
		year?: number;
		genres?: string[];
		rating?: number;
		estimatedLength?: string;
		confidence?: number;
		isBook?: boolean;
	}>;
};

type SearchIntentModelResult = {
	intent: {
		category?: 'completed' | 'inProgress' | 'planned' | 'fails' | 'allTime';
		textQuery?: string;
		titleIncludes?: string;
		authorIncludes?: string;
		notesIncludes?: string;
		sourceIncludes?: string;
		year?: number;
		sortBy?: 'newest' | 'oldest' | 'rating_desc' | 'rating_asc' | 'title_asc' | 'title_desc';
		explanationShort?: string;
	};
};

type ItemDraftModelResult = {
	draft?: {
		title?: string;
		author?: string;
		publicationYear?: number;
		notes?: string;
	};
};

type SuggestionsRefineModelResult = {
	items?: Array<{
		id?: string;
		score?: number;
		reason_short?: string;
		explanation?: string;
		caveat?: string | null;
		format_suggestion?: string | null;
	}>;
};

type TasteProfileBody = {
	summaryHash?: string;
	topRated?: Array<{
		title?: string;
		author?: string;
		media?: string;
		rating?: number;
		format?: string | null;
		lengthBucket?: string;
		genres?: string[];
	}>;
	topRatedBooks?: Array<{
		title?: string;
		author?: string;
		media?: string;
		rating?: number;
		format?: string | null;
		lengthBucket?: string;
		genres?: string[];
	}>;
	topRatedMovies?: Array<{
		title?: string;
		author?: string;
		media?: string;
		rating?: number;
		format?: string | null;
		lengthBucket?: string;
		genres?: string[];
	}>;
	aggregates?: {
		avgRating?: number | null;
		formatSplitPct?: Record<string, number>;
		avgLengthBucket?: string | null;
		topGenres?: string[];
		formatDataCount?: number;
		completionRatePct?: number | null;
	};
};

type MoodIntentBody = {
	phrase?: string;
};

type StoppedRecoveryBody = {
	stopped?: {
		title?: string;
		author?: string;
		media?: string;
		genres?: string[];
		lengthBucket?: string;
	};
	userStats?: {
		avgHighRatedLength?: string | null;
		topGenres?: string[];
		completionRatePct?: number | null;
		formatSplitPct?: Record<string, number>;
	};
};

const corsHeaders: Record<string, string> = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type, X-Subscription-Tier, X-App-Feature, Authorization',
};

function jsonResponse(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { 'Content-Type': 'application/json', ...corsHeaders },
	});
}

function extractJsonObject(text: string): string {
	const t = text.trim();
	const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
	if (fence) {
		return fence[1].trim();
	}
	const start = t.indexOf('{');
	const end = t.lastIndexOf('}');
	if (start >= 0 && end > start) {
		return t.slice(start, end + 1);
	}
	return t;
}

export default {
	async fetch(request, env, _ctx): Promise<Response> {
		if (request.method === 'OPTIONS') {
			return new Response(null, { status: 204, headers: { ...corsHeaders } });
		}

		const url = new URL(request.url);
		if (url.pathname === '/health' && request.method === 'GET') {
			return jsonResponse({
				ok: true,
				service: 'fiftylist-llm-proxy',
				provider: isAnthropicConfigured(env) ? 'anthropic_claude' : 'unconfigured',
			});
		}
		if (url.pathname === '/llm/import-clean' && request.method === 'POST') {
			return handleImportClean(request, env);
		}
		if (url.pathname === '/llm/search-intent' && request.method === 'POST') {
			return handleSearchIntent(request, env);
		}
		if (url.pathname === '/llm/item-draft' && request.method === 'POST') {
			return handleItemDraft(request, env);
		}
		if (url.pathname === '/llm/suggestions-refine' && request.method === 'POST') {
			return handleSuggestionsRefine(request, env);
		}
		if (url.pathname === '/llm/taste-profile' && request.method === 'POST') {
			return handleTasteProfile(request, env);
		}
		if (url.pathname === '/llm/mood-intent' && request.method === 'POST') {
			return handleMoodIntent(request, env);
		}
		if (url.pathname === '/llm/stopped-recovery' && request.method === 'POST') {
			return handleStoppedRecovery(request, env);
		}
		return jsonResponse({ error: 'not_found', message: 'No route' }, 404);
	},
} satisfies ExportedHandler<Cloudflare.Env>;

function assertPremium(request: Request): Response | null {
	const tier = request.headers.get('X-Subscription-Tier');
	if (tier !== 'premium') {
		return jsonResponse({ error: 'premium_required', message: 'Premium subscription required.', remaining_actions: 0 }, 403);
	}
	return null;
}

function assertLlmProvider(env: Cloudflare.Env): Response | null {
	if (!isAnthropicConfigured(env)) {
		return jsonResponse(
			{
				error: 'provider_unavailable',
				message: 'Anthropic is not configured (set ANTHROPIC_API_KEY secret on the Worker).',
				remaining_actions: 0,
			},
			503,
		);
	}
	return null;
}

function providerErrorResponse(e: unknown): Response {
	const errMsg = e instanceof Error ? e.message : String(e);
	const info = classifyProviderError(e);
	return jsonResponse(
		{
			error: 'provider_unavailable',
			code: info.code,
			message: info.userMessage,
			retryable: info.retryable,
			details: errMsg.slice(0, 400),
			remaining_actions: 0,
		},
		info.retryable ? 503 : 502,
	);
}

async function handleSearchIntent(request: Request, env: Cloudflare.Env): Promise<Response> {
	const premiumError = assertPremium(request);
	if (premiumError) return premiumError;
	const aiBindingError = assertLlmProvider(env);
	if (aiBindingError) return aiBindingError;

	let body: SearchIntentBody;
	try {
		body = (await request.json()) as SearchIntentBody;
	} catch {
		return jsonResponse({ error: 'invalid_request', message: 'Invalid JSON', remaining_actions: 0 }, 400);
	}

	const rawQuery = typeof body.query === 'string' ? body.query.trim() : '';
	if (!rawQuery) {
		return jsonResponse({ error: 'invalid_request', message: 'query is required', remaining_actions: 0 }, 400);
	}
	if (rawQuery.length > 120) {
		return jsonResponse({ error: 'invalid_request', message: 'query must be <= 120 characters', remaining_actions: 0 }, 400);
	}

	const mediaType = body.mediaType === 'movie' ? 'movie' : 'book';
	const systemPrompt = `You convert a user's natural-language search request into a JSON intent for filtering THEIR OWN ${mediaType} list in-app.
Never return external recommendations.
Only JSON object with shape:
{"intent":{"category":"completed|inProgress|planned|fails|allTime|null","textQuery":string|null,"titleIncludes":string|null,"authorIncludes":string|null,"notesIncludes":string|null,"sourceIncludes":string|null,"year":number|null,"sortBy":"newest|oldest|rating_desc|rating_asc|title_asc|title_desc|null","explanationShort":string|null}}

Rules:
- Map "read/watched/finished/done" -> completed.
- Map "reading/watching/currently" -> inProgress.
- Map "plan/want to read/watch/to-read/watchlist" -> planned.
- Map "stopped/dnf/abandoned" -> fails.
- If user asks for creator ("by Maas"), place in authorIncludes.
- Keep fields concise and null when unknown.
- explanationShort max 12 words.
- Default sortBy to "newest" when unspecified.
- textQuery should be compact literal keywords only.`;

	let aiResult: LlmTextResult;
	try {
		aiResult = await runLlm(env, 'fast', systemPrompt, rawQuery, 512, 0.1);
	} catch (e) {
		return providerErrorResponse(e);
	}

	const content = extractAiResponseText(aiResult);
	if (!content.trim()) {
		return jsonResponse({ error: 'provider_unavailable', message: 'Model returned an empty response.', remaining_actions: 0 }, 502);
	}

	let parsed: SearchIntentModelResult;
	try {
		parsed = JSON.parse(extractJsonObject(content)) as SearchIntentModelResult;
	} catch {
		return jsonResponse({ error: 'provider_unavailable', message: 'Model did not return valid JSON.', remaining_actions: 0 }, 502);
	}

	const rawIntent = parsed?.intent ?? {};
	const allowedCategory = ['completed', 'inProgress', 'planned', 'fails', 'allTime'] as const;
	const allowedSortBy = ['newest', 'oldest', 'rating_desc', 'rating_asc', 'title_asc', 'title_desc'] as const;
	const asText = (v: unknown) => (typeof v === 'string' && v.trim().length > 0 ? v.trim().slice(0, 80) : undefined);
	const intent = {
		category:
			typeof rawIntent.category === 'string' && (allowedCategory as readonly string[]).includes(rawIntent.category)
				? rawIntent.category
				: undefined,
		textQuery: asText(rawIntent.textQuery),
		titleIncludes: asText(rawIntent.titleIncludes),
		authorIncludes: asText(rawIntent.authorIncludes),
		notesIncludes: asText(rawIntent.notesIncludes),
		sourceIncludes: asText(rawIntent.sourceIncludes),
		year:
			typeof rawIntent.year === 'number' && Number.isFinite(rawIntent.year) && rawIntent.year > 1900 && rawIntent.year < 3000
				? Math.floor(rawIntent.year)
				: undefined,
		sortBy:
			typeof rawIntent.sortBy === 'string' && (allowedSortBy as readonly string[]).includes(rawIntent.sortBy)
				? rawIntent.sortBy
				: 'newest',
		explanationShort: asText(rawIntent.explanationShort),
	};

	const resetAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
	return jsonResponse({
		intent,
		remaining_actions: 999,
		reset_at: resetAt,
	});
}

async function handleImportClean(request: Request, env: Cloudflare.Env): Promise<Response> {
	const premiumError = assertPremium(request);
	if (premiumError) return premiumError;
	const aiBindingError = assertLlmProvider(env);
	if (aiBindingError) return aiBindingError;

	let body: ImportCleanBody;
	try {
		body = (await request.json()) as ImportCleanBody;
	} catch {
		return jsonResponse({ error: 'invalid_request', message: 'Invalid JSON', remaining_actions: 0 }, 400);
	}

	const rawText = typeof body.rawText === 'string' ? body.rawText : '';
	if (rawText.trim().length === 0) {
		return jsonResponse({ error: 'invalid_request', message: 'rawText is required', remaining_actions: 0 }, 400);
	}

	const maxItems = Math.min(Math.max(1, body.maxItems ?? 300), 500);
	const mediaTypes = Array.isArray(body.mediaTypes) && body.mediaTypes.length > 0 ? body.mediaTypes : ['book', 'movie'];

	// Cap input size to stay within model limits while allowing large pastes
	const safeText = rawText.slice(0, 100_000);

	const lineCount = safeText.split(/\r?\n/).length;
	const systemPrompt = `Clean pasted text for import into a reading/movie list app.

Rules:
- Normalize to: Title by Author (Year) when inferable — use replace_lines for changed lines only; do not echo unchanged lines.
- Deduplicate same title+creator (case-insensitive) — keep most complete line; remove others via remove_lines.
- Remove junk: empty lines, broken fragments, duplicate blank headers — remove_lines.
- Strip list ordinals: "1. 12 The Hobbit"→"The Hobbit", "03) 7. Dune"→"Dune"
  Preserve title numbers: 1984, 11/22/63, 2001: A Space Odyssey, 12 Angry Men
- Keep section hints as plain lines: "Currently reading", "Want to watch"
- Never invent titles; line numbers refer only to lines present in the input.

Line numbers are 1-based (first line = 1). Input lines are separated by newlines (LF or CRLF).

Return raw JSON only, no markdown:
{"remove_lines":[...],"replace_lines":{"<lineNumber>":"<full new line text>"},"duplicates_removed":0,"warnings":[]}
- remove_lines: 1-based indexes of lines to delete entirely (junk or duplicate rows).
- replace_lines: object whose keys are line numbers as strings; values replace that entire line.
- duplicates_removed: integer count of duplicate/junk rows removed or merged.
- warnings: [] or short strings.`;

	const userContent = `lineCount: ${lineCount}
maxItems: ${maxItems}
mediaTypes: ${mediaTypes.join(', ')}

---BEGIN USER TEXT---
${safeText}
---END USER TEXT---`;

	let aiResult: LlmTextResult;
	try {
		aiResult = await runLlm(env, 'fast', systemPrompt, userContent, 4096, 0.2);
	} catch (e) {
		return providerErrorResponse(e);
	}

	const content = extractAiResponseText(aiResult);
	if (!content.trim()) {
		return jsonResponse({ error: 'provider_unavailable', message: 'Model returned an empty response.', remaining_actions: 0 }, 502);
	}

	let parsed: ImportCleanModelResult;
	try {
		parsed = JSON.parse(extractJsonObject(content)) as ImportCleanModelResult;
	} catch {
		return jsonResponse({ error: 'provider_unavailable', message: 'Model did not return valid JSON.', remaining_actions: 0 }, 502);
	}

	let cleanedText: string;
	if (hasImportCleanDiffOps(parsed)) {
		cleanedText = applyImportCleanDiff(safeText, parsed);
	} else if (typeof parsed.cleaned_text === 'string' && parsed.cleaned_text.trim().length > 0) {
		cleanedText = parsed.cleaned_text.trim();
	} else {
		cleanedText = safeText;
	}

	if (cleanedText.trim().length === 0 && safeText.trim().length > 0) {
		return jsonResponse(
			{ error: 'provider_unavailable', message: 'Model produced an empty result; try again or shorten the paste.', remaining_actions: 0 },
			502,
		);
	}

	const duplicatesRemoved =
		typeof parsed.duplicates_removed === 'number' && Number.isFinite(parsed.duplicates_removed) && parsed.duplicates_removed >= 0
			? Math.floor(parsed.duplicates_removed)
			: 0;
	const warnings = Array.isArray(parsed.warnings) ? parsed.warnings.filter((w) => typeof w === 'string' && w.trim().length > 0) : [];

	const resetAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
	return jsonResponse({
		cleaned_text: cleanedText,
		duplicates_removed: duplicatesRemoved,
		warnings,
		remaining_actions: 999,
		reset_at: resetAt,
	});
}

async function handleItemDraft(request: Request, env: Cloudflare.Env): Promise<Response> {
	const premiumError = assertPremium(request);
	if (premiumError) return premiumError;
	const aiBindingError = assertLlmProvider(env);
	if (aiBindingError) return aiBindingError;

	let body: ItemDraftBody;
	try {
		body = (await request.json()) as ItemDraftBody;
	} catch {
		return jsonResponse({ error: 'invalid_request', message: 'Invalid JSON', remaining_actions: 0 }, 400);
	}

	const mediaType = body.mediaType === 'movie' ? 'movie' : 'book';
	const seedTitle = typeof body.title === 'string' ? body.title.trim().slice(0, 120) : '';
	const seedAuthor = typeof body.author === 'string' ? body.author.trim().slice(0, 120) : '';
	const seedDescription =
		typeof body.description === 'string' ? body.description.trim().slice(0, 800) : '';
	const seedNotes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 800) : '';

	if (!seedTitle && !seedAuthor && !seedNotes && !seedDescription) {
		return jsonResponse(
			{ error: 'invalid_request', message: 'Provide title, author, description, or notes', remaining_actions: 0 },
			400,
		);
	}

	const systemPrompt = `You enrich a partially entered ${mediaType} item for a tracking app.
Return JSON only with this shape:
{"draft":{"title":string|null,"author":string|null,"publicationYear":number|null,"notes":string|null}}

Rules:
- Keep edits conservative; prefer user-provided values.
- Never invent highly specific factual claims.
- publicationYear must be an integer between 1850 and 2100, or null.
- notes max 220 characters.
- If unsure, return null for that field.`;

	const userPrompt = JSON.stringify(
		{
			mediaType,
			input: {
				title: seedTitle || null,
				author: seedAuthor || null,
				description: seedDescription || null,
				notes: seedNotes || null,
			},
		},
		null,
		2,
	);

	let aiResult: LlmTextResult;
	try {
		aiResult = await runLlm(env, 'fast', systemPrompt, userPrompt, 400, 0.2);
	} catch (e) {
		return providerErrorResponse(e);
	}

	const content = extractAiResponseText(aiResult);
	if (!content.trim()) {
		return jsonResponse({ error: 'provider_unavailable', message: 'Model returned an empty response.', remaining_actions: 0 }, 502);
	}

	let parsed: ItemDraftModelResult;
	try {
		parsed = JSON.parse(extractJsonObject(content)) as ItemDraftModelResult;
	} catch {
		return jsonResponse({ error: 'provider_unavailable', message: 'Model did not return valid JSON.', remaining_actions: 0 }, 502);
	}

	const rawDraft = parsed?.draft ?? {};
	const asText = (v: unknown, maxLen: number) => (typeof v === 'string' && v.trim().length > 0 ? v.trim().slice(0, maxLen) : undefined);
	const publicationYear =
		typeof rawDraft.publicationYear === 'number' &&
		Number.isFinite(rawDraft.publicationYear) &&
		rawDraft.publicationYear >= 1850 &&
		rawDraft.publicationYear <= 2100
			? Math.floor(rawDraft.publicationYear)
			: undefined;

	const draft = {
		title: asText(rawDraft.title, 120),
		author: asText(rawDraft.author, 120),
		publicationYear,
		notes: asText(rawDraft.notes, 220),
	};

	const resetAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
	return jsonResponse({
		draft,
		remaining_actions: 999,
		reset_at: resetAt,
	});
}

async function handleTasteProfile(request: Request, env: Cloudflare.Env): Promise<Response> {
	const premiumError = assertPremium(request);
	if (premiumError) return premiumError;
	const aiBindingError = assertLlmProvider(env);
	if (aiBindingError) return aiBindingError;

	let body: TasteProfileBody;
	try {
		body = (await request.json()) as TasteProfileBody;
	} catch {
		return jsonResponse({ error: 'invalid_request', message: 'Invalid JSON', remaining_actions: 0 }, 400);
	}

	const summaryHash = typeof body.summaryHash === 'string' ? body.summaryHash.trim().slice(0, 64) : '';
	if (!summaryHash) {
		return jsonResponse({ error: 'invalid_request', message: 'summaryHash is required', remaining_actions: 0 }, 400);
	}

	const cachedNarrative = await getTasteProfileFromKv(env, summaryHash);
	if (cachedNarrative) {
		const resetAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
		return jsonResponse({
			narrative: cachedNarrative,
			cached: true,
			remaining_actions: 999,
			reset_at: resetAt,
		});
	}

	const legacyTop = Array.isArray(body.topRated) ? body.topRated : [];
	const topRatedBooks = (
		Array.isArray(body.topRatedBooks) && body.topRatedBooks.length > 0
			? body.topRatedBooks
			: legacyTop.filter((i) => i.media === 'book')
	).slice(0, 5);
	const topRatedMovies = (
		Array.isArray(body.topRatedMovies) && body.topRatedMovies.length > 0
			? body.topRatedMovies
			: legacyTop.filter((i) => i.media === 'movie')
	).slice(0, 5);
	const aggregates = body.aggregates ?? {};
	const mediaSummary = (aggregates as { mediaSummary?: Record<string, number> }).mediaSummary;
	const listedMovies =
		typeof mediaSummary?.listedMovies === 'number'
			? mediaSummary.listedMovies
			: topRatedMovies.length;
	const movieGenres = Array.isArray(
		(aggregates as { topMovieGenres?: string[] }).topMovieGenres
	)
		? (aggregates as { topMovieGenres: string[] }).topMovieGenres
		: [];

	const userPrompt = JSON.stringify(
		{
			topRatedBooks,
			topRatedMovies,
			aggregates,
		},
		null,
		0,
	);

	let aiResult: LlmTextResult;
	try {
		aiResult = await runLlm(env, 'taste', getTasteProfileSystemPrompt(), userPrompt, 520, 0.28);
	} catch (e) {
		return providerErrorResponse(e);
	}

	const content = extractAiResponseText(aiResult);
	if (!content.trim()) {
		return jsonResponse({ error: 'provider_unavailable', message: 'Model returned an empty response.', remaining_actions: 0 }, 502);
	}

	let parsed: { narrative?: string };
	try {
		parsed = JSON.parse(extractJsonObject(content)) as { narrative?: string };
	} catch {
		return jsonResponse({ error: 'provider_unavailable', message: 'Model did not return valid JSON.', remaining_actions: 0 }, 502);
	}

	let narrative =
		typeof parsed.narrative === 'string' && parsed.narrative.trim().length > 0
			? finalizeTasteNarrative(parsed.narrative)
			: 'Your lists show a mix of curiosity and follow-through—keep exploring what pulls you in.';

	narrative = mergeFilmIntoTasteNarrative(
		narrative,
		listedMovies,
		topRatedMovies,
		movieGenres
	);

	await putTasteProfileKv(env, summaryHash, narrative);

	const resetAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
	return jsonResponse({
		narrative,
		cached: false,
		remaining_actions: 999,
		reset_at: resetAt,
	});
}

async function handleMoodIntent(request: Request, env: Cloudflare.Env): Promise<Response> {
	const premiumError = assertPremium(request);
	if (premiumError) return premiumError;
	const aiBindingError = assertLlmProvider(env);
	if (aiBindingError) return aiBindingError;

	let body: MoodIntentBody;
	try {
		body = (await request.json()) as MoodIntentBody;
	} catch {
		return jsonResponse({ error: 'invalid_request', message: 'Invalid JSON', remaining_actions: 0 }, 400);
	}

	const phrase = typeof body.phrase === 'string' ? body.phrase.trim().slice(0, 120) : '';
	if (!phrase) {
		return jsonResponse({ error: 'invalid_request', message: 'phrase is required', remaining_actions: 0 }, 400);
	}

	const userPrompt = JSON.stringify({ phrase });

	let aiResult: LlmTextResult;
	try {
		aiResult = await runLlm(env, 'fast', getMoodIntentSystemPrompt(), userPrompt, 150, 0.1);
	} catch (e) {
		return providerErrorResponse(e);
	}

	const content = extractAiResponseText(aiResult);
	if (!content.trim()) {
		return jsonResponse({ error: 'provider_unavailable', message: 'Model returned an empty response.', remaining_actions: 0 }, 502);
	}

	type MoodParsed = {
		intent?: {
			maxLength?: string | null;
			boostGenres?: string[];
			avoidGenres?: string[];
		};
		maxLength?: string | null;
		boostGenres?: string[];
		avoidGenres?: string[];
	};
	let parsed: MoodParsed;
	try {
		parsed = JSON.parse(extractJsonObject(content)) as MoodParsed;
	} catch {
		return jsonResponse({ error: 'provider_unavailable', message: 'Model did not return valid JSON.', remaining_actions: 0 }, 502);
	}

	const raw = parsed.intent ?? parsed;
	const slug = (s: string) => s.trim().toLowerCase().slice(0, 40);
	const boostGenres = Array.isArray(raw.boostGenres)
		? raw.boostGenres.filter((g) => typeof g === 'string').map((g) => slug(g)).filter(Boolean).slice(0, 6)
		: [];
	const avoidGenres = Array.isArray(raw.avoidGenres)
		? raw.avoidGenres.filter((g) => typeof g === 'string').map((g) => slug(g)).filter(Boolean).slice(0, 6)
		: [];
	const ml = typeof raw.maxLength === 'string' ? raw.maxLength.trim().toLowerCase() : '';
	const maxLength =
		ml === 'short' || ml === 'medium' || ml === 'long' || ml === 'any' ? (ml as 'short' | 'medium' | 'long' | 'any') : 'any';

	const resetAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
	return jsonResponse({
		intent: { maxLength, boostGenres, avoidGenres },
		remaining_actions: 999,
		reset_at: resetAt,
	});
}

async function handleStoppedRecovery(request: Request, env: Cloudflare.Env): Promise<Response> {
	const premiumError = assertPremium(request);
	if (premiumError) return premiumError;
	const aiBindingError = assertLlmProvider(env);
	if (aiBindingError) return aiBindingError;

	let body: StoppedRecoveryBody;
	try {
		body = (await request.json()) as StoppedRecoveryBody;
	} catch {
		return jsonResponse({ error: 'invalid_request', message: 'Invalid JSON', remaining_actions: 0 }, 400);
	}

	const st = body.stopped ?? {};
	const title = typeof st.title === 'string' ? st.title.trim().slice(0, 120) : '';
	if (!title) {
		return jsonResponse({ error: 'invalid_request', message: 'stopped.title is required', remaining_actions: 0 }, 400);
	}

	const userPrompt = JSON.stringify({
		stopped: {
			title,
			author: typeof st.author === 'string' ? st.author.trim().slice(0, 80) : '',
			media: st.media === 'movie' ? 'movie' : 'book',
			genres: Array.isArray(st.genres) ? st.genres.filter((g) => typeof g === 'string').map((g) => g.trim().slice(0, 40)).slice(0, 6) : [],
			lengthBucket: typeof st.lengthBucket === 'string' ? st.lengthBucket.trim().slice(0, 12) : undefined,
		},
		userStats: body.userStats ?? {},
	});

	let aiResult: LlmTextResult;
	try {
		aiResult = await runLlm(env, 'fast', getStoppedRecoverySystemPrompt(), userPrompt, 320, 0.25);
	} catch (e) {
		return providerErrorResponse(e);
	}

	const content = extractAiResponseText(aiResult);
	if (!content.trim()) {
		return jsonResponse({ error: 'provider_unavailable', message: 'Model returned an empty response.', remaining_actions: 0 }, 502);
	}

	type StopParsed = {
		alternative?: { title?: string; author?: string; media?: string; explanation?: string };
	};
	let parsed: StopParsed;
	try {
		parsed = JSON.parse(extractJsonObject(content)) as StopParsed;
	} catch {
		return jsonResponse({ error: 'provider_unavailable', message: 'Model did not return valid JSON.', remaining_actions: 0 }, 502);
	}

	const rawAlt = parsed.alternative;
	const alternative = rawAlt
		? {
				title: typeof rawAlt.title === 'string' ? rawAlt.title.trim().slice(0, 120) : '',
				author: typeof rawAlt.author === 'string' ? rawAlt.author.trim().slice(0, 80) : '',
				media: rawAlt.media === 'movie' ? ('movie' as const) : ('book' as const),
				explanation:
					typeof rawAlt.explanation === 'string' && rawAlt.explanation.trim().length > 0
						? rawAlt.explanation.trim().slice(0, 400)
						: '',
			}
		: null;

	if (!alternative?.title) {
		return jsonResponse({ error: 'provider_unavailable', message: 'Model did not return a valid alternative.', remaining_actions: 0 }, 502);
	}

	const resetAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
	return jsonResponse({
		alternative,
		remaining_actions: 999,
		reset_at: resetAt,
	});
}

async function handleSuggestionsRefine(request: Request, env: Cloudflare.Env): Promise<Response> {
	const premiumError = assertPremium(request);
	if (premiumError) return premiumError;
	const aiBindingError = assertLlmProvider(env);
	if (aiBindingError) return aiBindingError;

	let body: SuggestionsRefineBody;
	try {
		body = (await request.json()) as SuggestionsRefineBody;
	} catch {
		return jsonResponse({ error: 'invalid_request', message: 'Invalid JSON', remaining_actions: 0 }, 400);
	}

	const mt =
		body.mediaType === 'mixed'
			? 'mixed'
			: body.mediaType === 'movie'
				? 'movie'
				: 'book';
	const candidates = Array.isArray(body.candidates) ? body.candidates : [];
	if (!candidates.length) {
		return jsonResponse({ error: 'invalid_request', message: 'candidates are required', remaining_actions: 0 }, 400);
	}

	const richTopThree = body.richTopThree === true;
	const cap = richTopThree ? 6 : 12;

	let normalizedCandidates = candidates
		.map((c) => ({
			id: typeof c.id === 'string' ? c.id.trim().slice(0, 80) : '',
			title: typeof c.title === 'string' ? c.title.trim().slice(0, 120) : '',
			author: typeof c.author === 'string' ? c.author.trim().slice(0, 80) : '',
			year:
				typeof c.year === 'number' && Number.isFinite(c.year) && c.year > 1850 && c.year < 3000
					? Math.floor(c.year)
					: undefined,
			genres: Array.isArray(c.genres)
				? c.genres.filter((g) => typeof g === 'string').map((g) => g.trim().slice(0, 40)).slice(0, 6)
				: [],
			rating:
				typeof c.rating === 'number' && Number.isFinite(c.rating) ? Math.max(0, Math.min(10, c.rating)) : 0,
			estimatedLength: typeof c.estimatedLength === 'string' ? c.estimatedLength.trim().slice(0, 20) : 'medium',
			confidence:
				typeof c.confidence === 'number' && Number.isFinite(c.confidence) ? Math.max(0, Math.min(100, c.confidence)) : 0,
			media: typeof c.isBook === 'boolean' ? (c.isBook ? 'book' : 'movie') : 'book',
			similarToTitle:
				typeof (c as { similarToTitle?: string }).similarToTitle === 'string'
					? (c as { similarToTitle?: string }).similarToTitle!.trim().slice(0, 80)
					: undefined,
		}))
		.filter((c) => c.id && c.title)
		.slice(0, cap);

	if (!normalizedCandidates.length) {
		return jsonResponse({ error: 'invalid_request', message: 'No valid candidates', remaining_actions: 0 }, 400);
	}

	const maxResults = typeof body.maxResults === 'number' && Number.isFinite(body.maxResults) ? Math.floor(body.maxResults) : 8;
	const clampedMaxResults = Math.min(Math.max(1, maxResults), normalizedCandidates.length);

	const mediaPhrase =
		mt === 'mixed' ? 'book and movie' : `${mt === 'movie' ? 'movie' : 'book'}`;
	const exactCount = normalizedCandidates.length;

	const userFeatures = body.userFeatures ?? {};
	const includeFormatSuggestions = body.includeFormatSuggestions === true;

	const systemPrompt = richTopThree
		? getSuggestionsRichSystemPrompt(exactCount, includeFormatSuggestions)
		: `You write personalized picks for ${mediaPhrase} suggestion cards.
Return JSON only:
{"items":[{"id":string,"score":number,"reason_short":string}]}

Rules:
- There are exactly ${exactCount} candidates below. Output EXACTLY ${exactCount} items.
- Each item's id MUST be one candidate id exactly once each (same id set — no omissions, no extras).
- Re-score each suggestion: score is 0..100 (relative quality for this viewer).
- reason_short max 12 words, plain conversational language, DIFFERENT wording for each row (don't repeat canned phrases across items).
`;

	const lovedHighlights = Array.isArray(body.lovedHighlights)
		? body.lovedHighlights
				.filter((x) => typeof x?.title === 'string' && x.title.trim().length > 0)
				.slice(0, 6)
				.map((x) => ({
					title: String(x.title).trim().slice(0, 80),
					author: typeof x.author === 'string' ? x.author.trim().slice(0, 60) : '',
					media: x.media === 'movie' ? 'movie' : 'book',
				}))
		: [];

	const userSummaryRaw = body.userSummary ?? {};
	const tasteNarrative =
		typeof userSummaryRaw.tasteNarrative === 'string' && userSummaryRaw.tasteNarrative.trim().length > 0
			? userSummaryRaw.tasteNarrative.trim().slice(0, 320)
			: undefined;

	const refineContextRaw = body.refineContext;
	const refineContext =
		refineContextRaw && typeof refineContextRaw === 'object'
			? {
					phrase:
						typeof refineContextRaw.phrase === 'string'
							? refineContextRaw.phrase.trim().slice(0, 120)
							: undefined,
					primaryTitleAnchors: Array.isArray(refineContextRaw.primaryTitleAnchors)
						? refineContextRaw.primaryTitleAnchors
								.filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
								.map((t) => t.trim().slice(0, 80))
								.slice(0, 4)
						: [],
					secondaryAuthorAnchors: Array.isArray(refineContextRaw.secondaryAuthorAnchors)
						? refineContextRaw.secondaryAuthorAnchors
								.filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
								.map((t) => t.trim().slice(0, 60))
								.slice(0, 3)
						: [],
					primaryGenreSlugs: Array.isArray(refineContextRaw.primaryGenreSlugs)
						? refineContextRaw.primaryGenreSlugs
								.filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
								.map((t) => t.trim().toLowerCase().slice(0, 40))
								.slice(0, 6)
						: [],
				}
			: undefined;

	const userPrompt = JSON.stringify(
		richTopThree
			? {
					lovedHighlights,
					...(refineContext ? { refineContext } : {}),
					userSummary: {
						...userSummaryRaw,
						...(tasteNarrative ? { tasteNarrative } : {}),
					},
					additionalContext:
						typeof userFeatures.additionalContext === 'string'
							? userFeatures.additionalContext.slice(0, 120)
							: undefined,
					candidates: normalizedCandidates.map((c) => ({
						id: c.id,
						title: c.title,
						author: c.author,
						genres: c.genres,
						confidence: c.confidence,
						estimatedLength: c.estimatedLength,
						media: c.media,
						...(c.similarToTitle ? { similarToTitle: c.similarToTitle } : {}),
					})),
				}
			: {
					mode: body.mode === 'rerank' ? 'rerank' : 'rerank',
					maxResults: clampedMaxResults,
					richTopThree,
					userFeatures: {
						preferredGenres: Array.isArray(userFeatures.preferredGenres) ? userFeatures.preferredGenres.slice(0, 8) : [],
						avoidGenres: Array.isArray(userFeatures.avoidGenres) ? userFeatures.avoidGenres.slice(0, 8) : [],
						lengthPreference:
							typeof userFeatures.lengthPreference === 'string' ? userFeatures.lengthPreference : 'any',
						minRating:
							typeof userFeatures.minRating === 'number' && Number.isFinite(userFeatures.minRating)
								? userFeatures.minRating
								: 0,
						recentAuthors: Array.isArray(userFeatures.recentAuthors) ? userFeatures.recentAuthors.slice(0, 8) : [],
						additionalContext:
							typeof userFeatures.additionalContext === 'string'
								? userFeatures.additionalContext.slice(0, 120)
								: undefined,
					},
					sessionSignals: body.sessionSignals ?? {},
					candidates: normalizedCandidates,
				},
		null,
		0,
	);

	let aiResult: LlmTextResult;
	try {
		aiResult = await runLlm(
			env,
			'fast',
			systemPrompt,
			userPrompt,
			richTopThree ? 420 : 900,
			richTopThree ? 0.22 : 0.2,
		);
	} catch (e) {
		return providerErrorResponse(e);
	}

	const content = extractAiResponseText(aiResult);
	if (!content.trim()) {
		return jsonResponse({ error: 'provider_unavailable', message: 'Model returned an empty response.', remaining_actions: 0 }, 502);
	}

	let parsed: SuggestionsRefineModelResult;
	try {
		parsed = JSON.parse(extractJsonObject(content)) as SuggestionsRefineModelResult;
	} catch {
		return jsonResponse({ error: 'provider_unavailable', message: 'Model did not return valid JSON.', remaining_actions: 0 }, 502);
	}

	const candidateIds = new Set(normalizedCandidates.map((c) => c.id));

	const normalizeFormat = (c: (typeof normalizedCandidates)[0], fmt: string | null | undefined): string | undefined => {
		if (fmt == null || typeof fmt !== 'string') return undefined;
		const f = fmt.trim().toLowerCase();
		if (c.media === 'movie') {
			if (f === 'streaming') return 'streaming';
			return undefined;
		}
		if (f === 'text' || f === 'audio') return f;
		if (f === 'ebook' || f === 'print') return 'text';
		return undefined;
	};

	const mapped = (Array.isArray(parsed.items) ? parsed.items : []).map((item) => {
		const id = typeof item.id === 'string' ? item.id.trim().slice(0, 80) : '';
		const score =
			typeof item.score === 'number' && Number.isFinite(item.score) ? Math.max(0, Math.min(100, item.score)) : 0;
		const explanation =
			typeof item.explanation === 'string' && item.explanation.trim().length > 0
				? trimSuggestionCopy(item.explanation, SUGGESTION_EXPLANATION_MAX_CHARS)
				: '';
		const reasonLegacy =
			typeof item.reason_short === 'string' && item.reason_short.trim().length > 0
				? trimSuggestionCopy(item.reason_short, SUGGESTION_REASON_SHORT_MAX_CHARS)
				: '';
		const reason_short = explanation
			? trimSuggestionCopy(explanation, SUGGESTION_REASON_SHORT_MAX_CHARS)
			: reasonLegacy || 'Strong match for your recent preferences';

		const caveatRaw = item.caveat;
		const caveat =
			caveatRaw != null && typeof caveatRaw === 'string' && caveatRaw.trim().length > 0
				? trimSuggestionCopy(caveatRaw, SUGGESTION_CAVEAT_MAX_CHARS)
				: undefined;

		const cand = normalizedCandidates.find((c) => c.id === id);
		const formatNorm =
			includeFormatSuggestions && cand
				? normalizeFormat(cand, item.format_suggestion as string | null | undefined)
				: undefined;

		const explanationOut =
			richTopThree && (explanation || reasonLegacy)
				? trimSuggestionCopy(explanation || reasonLegacy, SUGGESTION_EXPLANATION_MAX_CHARS)
				: undefined;

		return {
			id,
			score,
			reason_short,
			...(explanationOut ? { explanation: explanationOut } : {}),
			...(richTopThree && caveat ? { caveat } : {}),
			...(richTopThree && includeFormatSuggestions && formatNorm ? { format_suggestion: formatNorm } : {}),
		};
	});

	const dedupSeen = new Set<string>();
	let items = mapped.filter((item) => {
		if (!item.id || !candidateIds.has(item.id)) return false;
		if (dedupSeen.has(item.id)) return false;
		dedupSeen.add(item.id);
		return true;
	});

	for (const c of normalizedCandidates) {
		const has = items.some((i) => i.id === c.id);
		if (!has) {
			items.push({
				id: c.id,
				score: Math.round(c.confidence),
				reason_short: `${c.media === 'movie' ? 'Film' : 'Book'} pick aligned with your tastes`,
			});
		}
	}
	items = items
		.filter((item) => item.id && candidateIds.has(item.id))
		.slice(0, clampedMaxResults);

	const resetAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
	return jsonResponse({
		items,
		remaining_actions: 999,
		reset_at: resetAt,
	});
}
