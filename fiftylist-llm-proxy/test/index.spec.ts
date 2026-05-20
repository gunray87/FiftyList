import { env, createExecutionContext, waitOnExecutionContext, SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import worker from '../src/index';

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

describe('fiftylist-llm-proxy', () => {
	it('GET /health returns ok', async () => {
		const request = new IncomingRequest('http://example.com/health', { method: 'GET' });
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(200);
		const body = (await response.json()) as { ok: boolean; provider?: string };
		expect(body.ok).toBe(true);
		expect(['anthropic_claude', 'unconfigured']).toContain(body.provider);
	});

	it('POST /llm/import-clean without premium returns 403', async () => {
		const request = new IncomingRequest('http://example.com/llm/import-clean', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ rawText: 'a\nb' }),
		});
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(403);
	});

	it('POST /llm/item-draft without premium returns 403', async () => {
		const request = new IncomingRequest('http://example.com/llm/item-draft', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ mediaType: 'book', title: 'Dune' }),
		});
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(403);
	});

	it('POST /llm/suggestions-refine without premium returns 403', async () => {
		const request = new IncomingRequest('http://example.com/llm/suggestions-refine', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				mediaType: 'book',
				mode: 'rerank',
				maxResults: 3,
				candidates: [{ id: '1', title: 'Dune', author: 'Frank Herbert', isBook: true }],
			}),
		});
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(403);
	});

	it('POST /llm/taste-profile without premium returns 403', async () => {
		const request = new IncomingRequest('http://example.com/llm/taste-profile', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				summaryHash: 'abc',
				topRated: [],
				aggregates: { topGenres: [], formatSplitPct: {} },
			}),
		});
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(403);
	});

	it('POST /llm/mood-intent without premium returns 403', async () => {
		const request = new IncomingRequest('http://example.com/llm/mood-intent', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ phrase: 'cozy mystery' }),
		});
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(403);
	});

	it('POST /llm/stopped-recovery without premium returns 403', async () => {
		const request = new IncomingRequest('http://example.com/llm/stopped-recovery', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				stopped: { title: 'Some Book', author: 'Author', media: 'book', lengthBucket: 'long' },
				userStats: { topGenres: ['fantasy'], completionRatePct: 72 },
			}),
		});
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(403);
	});

	it('POST /llm/import-clean (SELF) with premium: not 403 (AI may be 200 or inference error 502)', async () => {
		const response = await SELF.fetch('https://example.com/llm/import-clean', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'X-Subscription-Tier': 'premium',
			},
			body: JSON.stringify({ rawText: 'Some list line' }),
		});
		expect(response.status).not.toBe(403);
		// Miniflare / remote Workers AI may return 200, or 502 on inference failure; not OpenAI
		expect([200, 502, 503].includes(response.status)).toBe(true);
	});
});
