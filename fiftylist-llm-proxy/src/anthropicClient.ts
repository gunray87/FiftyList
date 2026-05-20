export type ClaudeTextResult = {
	response?: string;
};

type AnthropicContentBlock = { type?: string; text?: string };

type AnthropicMessagesResponse = {
	content?: AnthropicContentBlock[];
	error?: { type?: string; message?: string };
};

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

export function isAnthropicConfigured(env: Cloudflare.Env): boolean {
	const key = env.ANTHROPIC_API_KEY;
	return typeof key === 'string' && key.trim().length > 10;
}

export async function runClaude(
	env: Cloudflare.Env,
	opts: {
		model: string;
		systemPrompt: string;
		userPrompt: string;
		maxTokens: number;
		temperature: number;
		/** Cache system prompt block (Anthropic prompt caching). Default true. */
		cacheSystemPrompt?: boolean;
	}
): Promise<ClaudeTextResult> {
	const apiKey = env.ANTHROPIC_API_KEY?.trim();
	if (!apiKey) {
		throw new Error('ANTHROPIC_API_KEY is not configured');
	}

	const useCache = opts.cacheSystemPrompt !== false;
	const system = useCache
		? [{ type: 'text', text: opts.systemPrompt, cache_control: { type: 'ephemeral' } }]
		: opts.systemPrompt;

	const body = {
		model: opts.model,
		max_tokens: opts.maxTokens,
		temperature: opts.temperature,
		system,
		messages: [{ role: 'user', content: opts.userPrompt }],
	};

	const RETRYABLE_STATUSES = new Set([429, 502, 503, 529]);
	const MAX_ATTEMPTS = 3;
	let rawText = '';
	let res: Response | null = null;

	for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
		res = await fetch(ANTHROPIC_API_URL, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-api-key': apiKey,
				'anthropic-version': ANTHROPIC_VERSION,
			},
			body: JSON.stringify(body),
		});

		rawText = await res.text();
		if (res.ok) break;

		const retryable = RETRYABLE_STATUSES.has(res.status);
		if (retryable && attempt < MAX_ATTEMPTS - 1) {
			const delayMs = 600 * (attempt + 1) + Math.floor(Math.random() * 400);
			await new Promise((r) => setTimeout(r, delayMs));
			continue;
		}

		throw new Error(`Anthropic API ${res.status}: ${rawText.slice(0, 400)}`);
	}

	if (!res?.ok) {
		throw new Error(`Anthropic API ${res?.status ?? 0}: ${rawText.slice(0, 400)}`);
	}

	let data: AnthropicMessagesResponse;
	try {
		data = JSON.parse(rawText) as AnthropicMessagesResponse;
	} catch {
		throw new Error('Anthropic API returned non-JSON response');
	}

	const text = (data.content ?? [])
		.filter((b) => b.type === 'text' && typeof b.text === 'string')
		.map((b) => b.text as string)
		.join('')
		.trim();

	return { response: text };
}
