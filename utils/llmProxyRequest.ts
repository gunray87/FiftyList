const LLM_PROXY_BASE_URL = process.env.EXPO_PUBLIC_LLM_PROXY_BASE_URL;

export function getLlmProxyBaseUrl(): string | undefined {
  const u = typeof LLM_PROXY_BASE_URL === 'string' ? LLM_PROXY_BASE_URL.trim() : '';
  return u.length > 0 ? u : undefined;
}

async function readProxyErrorMessage(response: Response): Promise<string | undefined> {
  try {
    const text = await response.text();
    if (!text.trim()) return undefined;
    const parsed = JSON.parse(text) as unknown;
    if (parsed && typeof parsed === 'object' && 'message' in parsed) {
      const m = (parsed as { message?: unknown }).message;
      if (typeof m === 'string') {
        const s = m.trim();
        return s.length > 0 ? s : undefined;
      }
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

export async function llmPremiumPost<T>(
  path: string,
  featureHeader: string,
  body: unknown,
  timeoutMs = 12000
): Promise<{ ok: true; data: T } | { ok: false; status: number; message?: string }> {
  const base = getLlmProxyBaseUrl();
  if (!base) return { ok: false, status: 0 };

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${base.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Subscription-Tier': 'premium',
        'X-App-Feature': featureHeader,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      const message = await readProxyErrorMessage(response);
      return { ok: false, status: response.status, message };
    }
    const data = (await response.json()) as T;
    return { ok: true, data };
  } catch {
    return { ok: false, status: 0 };
  } finally {
    clearTimeout(t);
  }
}
