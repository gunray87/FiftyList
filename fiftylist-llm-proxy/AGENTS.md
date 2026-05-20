# Cloudflare Workers

STOP. Your knowledge of Cloudflare Workers APIs and limits may be outdated. Always retrieve current documentation before any Workers, KV, R2, D1, Durable Objects, Queues, Vectorize, AI, or Agents SDK task.

## Docs

- https://developers.cloudflare.com/workers/
- MCP: `https://docs.mcp.cloudflare.com/mcp`

For all limits and quotas, retrieve from the product's `/platform/limits/` page. eg. `/workers/platform/limits`

## Commands

| Command | Purpose |
|---------|---------|
| `npx wrangler dev` | Local development |
| `npx wrangler deploy` | Deploy to Cloudflare |
| `npx wrangler types` | Generate TypeScript types |

Run `wrangler types` after changing bindings in wrangler.jsonc.

## Anthropic Claude (required)

1. `npx wrangler secret put ANTHROPIC_API_KEY` (paste your Anthropic API key).
2. Optional model overrides in `wrangler.jsonc` vars: `LLM_CLAUDE_MODEL_TASTE`, `LLM_CLAUDE_MODEL_FAST`.
3. Local dev: copy `.dev.vars.example` → `.dev.vars` with `ANTHROPIC_API_KEY=...`
4. `npx wrangler deploy`

Health: `GET /health` → `"provider": "anthropic_claude"` when the secret is set.

## Taste profile KV (daily narrative cache)

1. `npx wrangler kv namespace create TASTE_PROFILE_CACHE`
2. Copy the returned `id` into `wrangler.jsonc` → `kv_namespaces[0].id` (replace `REPLACE_WITH_KV_NAMESPACE_ID`).
3. `npx wrangler deploy`

Without KV, taste-profile still works; narratives are not cached server-side (client AsyncStorage cache still applies).

## Node.js Compatibility

https://developers.cloudflare.com/workers/runtime-apis/nodejs/

## Errors

- **Error 1102** (CPU/Memory exceeded): Retrieve limits from `/workers/platform/limits/`
- **All errors**: https://developers.cloudflare.com/workers/observability/errors/

## Product Docs

Retrieve API references and limits from:
`/kv/` · `/r2/` · `/d1/` · `/durable-objects/` · `/queues/` · `/vectorize/` · `/workers-ai/` · `/agents/`

## Best Practices (conditional)

If the application uses Durable Objects or Workflows, refer to the relevant best practices:

- Durable Objects: https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/
- Workflows: https://developers.cloudflare.com/workflows/build/rules-of-workflows/
