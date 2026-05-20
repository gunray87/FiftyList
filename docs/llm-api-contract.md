# LLM Proxy API Contract (Premium Tier)

## Single proxy (current scope)

- **All** premium LLM features are implemented behind **one** backend: `fiftylist-llm-proxy` (Cloudflare Worker). The Expo app only calls `EXPO_PUBLIC_LLM_PROXY_BASE_URL` — it must **not** call OpenAI, Anthropic, or any other model host directly.
- **Inference:** the worker calls **Anthropic Claude** (`POST https://api.anthropic.com/v1/messages`). The API key lives only on the Worker as secret **`ANTHROPIC_API_KEY`** (set via `wrangler secret put ANTHROPIC_API_KEY`). Models are configured in `wrangler.jsonc` vars: `LLM_CLAUDE_MODEL`, `LLM_CLAUDE_MODEL_TASTE`, `LLM_CLAUDE_MODEL_FAST` (defaults: `claude-3-5-haiku-20241022`).
- System prompts use Anthropic **prompt caching** (`cache_control: { type: "ephemeral" }`) where supported.
- The Expo app must **not** call Anthropic directly.

The reference proxy implements import clean, search intent, item draft, suggestions refine, taste profile, mood-intent, and stopped-recovery.

## Auth and gating

- Only premium users (`subscription.tier = premium`) may call these endpoints.
- Backend validates entitlement and quota before provider calls.
- App sends informational headers:
  - `X-Subscription-Tier: premium`
  - `X-App-Feature: search_assist | item_draft | import_clean`

## Endpoint: `POST /llm/search-intent`

### Request body

```json
{
  "query": "sci fi book about memory and identity",
  "mediaType": "book"
}
```

### Success response

```json
{
  "results": [
    {
      "id": "provider-id",
      "title": "Example Title",
      "author": "Example Author",
      "publicationYear": 2020,
      "description": "Optional summary",
      "thumbnail": "https://...",
      "rating": 4.2
    }
  ],
  "remaining_actions": 127,
  "reset_at": "2026-05-01T00:00:00Z"
}
```

### Quota-limited response

`429 Too Many Requests`

```json
{
  "error": "quota_exceeded",
  "message": "Monthly AI action limit reached.",
  "remaining_actions": 0,
  "reset_at": "2026-05-01T00:00:00Z"
}
```

## Endpoint: `POST /llm/import-clean`

Used to scan and normalize uploaded import text before local parsing.

### Request body

```json
{
  "rawText": "pasted user import text",
  "maxItems": 300,
  "mediaTypes": ["book", "movie"]
}
```

### Model output (Workers AI)

The model returns a **line diff** (shorter than echoing the full paste):

```json
{
  "remove_lines": [4, 12, 47],
  "replace_lines": {
    "3": "Dune by Frank Herbert (1965)",
    "9": "1984 by George Orwell (1949)"
  },
  "duplicates_removed": 2,
  "warnings": []
}
```

- `remove_lines`: 1-based line indexes into the user’s `rawText` (split on newlines; CRLF normalized for counting). Lines are deleted from highest index first.
- `replace_lines`: keys are line numbers (strings); values replace that entire line. Replacements are applied before removals.
- Line numbers always refer to the **original** pasted line list.

The worker applies this diff server-side and still responds with full `cleaned_text` for the app (same shape as before).

### Success response (API — unchanged for clients)

```json
{
  "cleaned_text": "full normalized text after applying the model diff",
  "duplicates_removed": 3,
  "warnings": ["optional short notes, e.g. ambiguous rows"],
  "remaining_actions": 125,
  "reset_at": "2026-05-01T00:00:00Z"
}
```

- `duplicates_removed`: number of duplicate works merged or dropped from the user’s pasted text (same title + author/creator, case-insensitive), as reported by the model.
- The app also runs a local merge pass on the parsed preview so near-duplicate lines still map to a single import row.

## Endpoint: `POST /llm/item-draft`

### Request body

```json
{
  "mediaType": "movie",
  "title": "Arrival",
  "author": "",
  "notes": "I want a clean summary and suggested tags"
}
```

## Endpoint: `POST /llm/suggestions-refine`

Premium-only refinement endpoint for the Suggestions tab. This endpoint should **rerank existing local candidates** instead of generating new content from scratch.

### Request body

```json
{
  "mediaType": "book",
  "mode": "rerank",
  "maxResults": 8,
  "userFeatures": {
    "preferredGenres": ["sci-fi", "mystery"],
    "avoidGenres": ["horror"],
    "lengthPreference": "medium",
    "minRating": 3.5,
    "recentAuthors": ["Ursula K. Le Guin"]
  },
  "sessionSignals": {
    "activeFilter": "all",
    "sortBy": "confidence",
    "recentInteractions": [
      { "type": "view", "itemId": "b_123" },
      { "type": "positive_feedback", "itemId": "b_888" }
    ]
  },
  "candidates": [
    {
      "id": "b_123",
      "title": "The Left Hand of Darkness",
      "author": "Ursula K. Le Guin",
      "year": 1969,
      "genres": ["sci-fi"],
      "rating": 4.4,
      "estimatedLength": "medium",
      "confidence": 78,
      "isBook": true
    }
  ]
}
```

### Request guardrails

- Without `richTopThree`: `candidates.length <= 12`, `maxResults` clamped to candidate count.
- With **`richTopThree: true`**: send **at most 3** candidates plus **`userSummary`**, **`lovedHighlights`**, and **`includeFormatSuggestions`** (omit format field from model output unless user has 5+ saved items with format). Response items include **`explanation`** (2 sentences tied to loved picks), optional **`caveat`**, optional **`format_suggestion`**, **`reason_short`**, **`score`**. Single call, ~250–300 completion tokens.
- Keep each candidate compact; avoid long descriptions/notes in this request.
- `mode` currently supports: `rerank`.

### Success response

```json
{
  "items": [
    {
      "id": "b_123",
      "score": 92,
      "reason_short": "Matches your recent sci-fi interest and preferred length.",
      "explanation": "Optional longer personalized line when richTopThree is true.",
      "caveat": "Optional short hedge or null.",
      "format_suggestion": "text"
    }
  ],
  "remaining_actions": 121,
  "reset_at": "2026-05-01T00:00:00Z",
  "usage": {
    "prompt_tokens": 620,
    "completion_tokens": 140
  }
}
```

- App merges this on top of local suggestions and keeps local order as fallback if response is incomplete.
- If this endpoint fails or quota is exceeded, app should show local suggestions without blocking UI.

## Endpoint: `POST /llm/taste-profile`

Premium-only. Client **pre-computes** a compact summary (~400 tokens) before calling:

- `topRated` (≤10): `{ title, author, media, rating, format, lengthBucket }`
- `aggregates`: `{ avgRating, formatSplitPct, avgLengthBucket, topGenres, formatDataCount, completionRatePct }`
- `summaryHash`: stable hash of list state

Success: `{ "narrative": string, "cached"?: boolean, "remaining_actions", "reset_at" }`.

**Caching:** Worker stores narrative in **KV** keyed by `summaryHash`, **24h TTL** (at most one model call per hash per day). App also caches locally with the same hash + 24h window.

**Model:** `LLM_TASTE_PROFILE_MODEL` (default `@cf/meta/llama-3.1-8b-instruct` on Workers AI).

## Endpoint: `POST /llm/mood-intent`

Premium-only. Request: `{ "phrase": string }` (≤ 120 chars).

Success: `{ "intent": { "maxLength": "short"|"medium"|"long"|"any", "boostGenres": string[], "avoidGenres": string[] }, ... }`.

Structured weights only (~50 output tokens). Client applies to local candidate scoring; LLM never sees the catalog list.

**Model:** `LLM_FAST_MODEL` (default `@cf/meta/llama-3.2-3b-instruct`).

## Endpoint: `POST /llm/stopped-recovery`

Premium-only. Triggered when a user moves an item to **Stopped** (`fails`).

Request:

```json
{
  "stopped": { "title", "author?", "media", "genres?", "lengthBucket?" },
  "userStats": {
    "avgHighRatedLength": "short|medium|long",
    "topGenres": ["..."],
    "completionRatePct": 72,
    "formatSplitPct": { "audio": 40, "print": 60 }
  }
}
```

Success: `{ "alternative": { "title", "author", "media", "explanation" }, "remaining_actions", "reset_at" }` where `explanation` is **two causal sentences** (why they stopped + why the alternative fits).

**Model:** `LLM_FAST_MODEL`.

### Success response (example)

```json
{
  "draft": {
    "title": "Arrival",
    "author": "Denis Villeneuve",
    "publicationYear": 2016,
    "notes": "Refined user-facing summary"
  },
  "remaining_actions": 126,
  "reset_at": "2026-05-01T00:00:00Z"
}
```

## Error contract

- `400` invalid_request
- `401` unauthorized
- `403` premium_required
- `429` quota_exceeded
- `500` provider_unavailable

All errors should include:

```json
{
  "error": "machine_readable_code",
  "message": "Human-readable message",
  "remaining_actions": 0
}
```
