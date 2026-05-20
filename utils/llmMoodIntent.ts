import { llmPremiumPost } from '@/utils/llmProxyRequest';

export type LlmMoodIntent = {
  maxLength: 'short' | 'medium' | 'long' | 'any';
  boostGenres: string[];
  avoidGenres: string[];
};

export async function fetchMoodIntentFromProxy(phrase: string): Promise<LlmMoodIntent | null> {
  const trimmed = phrase.trim().slice(0, 120);
  if (trimmed.length < 2) return null;

  const res = await llmPremiumPost<{ intent?: Partial<LlmMoodIntent> }>(
    '/llm/mood-intent',
    'mood_intent',
    { phrase: trimmed },
    10000
  );
  if (!res.ok) return null;

  const raw = res.data.intent ?? {};
  const ml = typeof raw.maxLength === 'string' ? raw.maxLength.trim().toLowerCase() : '';
  const maxLength =
    ml === 'short' || ml === 'medium' || ml === 'long' || ml === 'any' ? ml : 'any';
  const boostGenres = Array.isArray(raw.boostGenres)
    ? raw.boostGenres.filter((g): g is string => typeof g === 'string').map((g) => g.toLowerCase().slice(0, 40)).slice(0, 6)
    : [];
  const avoidGenres = Array.isArray(raw.avoidGenres)
    ? raw.avoidGenres.filter((g): g is string => typeof g === 'string').map((g) => g.toLowerCase().slice(0, 40)).slice(0, 6)
    : [];

  return { maxLength, boostGenres, avoidGenres };
}
