/**
 * OMDb — use EXPO_PUBLIC_OMDB_API_KEY from .env (local) or EAS env (builds).
 * https://www.omdbapi.com/apikey.aspx
 */
export const OMDB_BASE_URL = 'https://www.omdbapi.com/';

export function getOmdbApiKey(): string | undefined {
  const key = process.env.EXPO_PUBLIC_OMDB_API_KEY;
  if (typeof key !== 'string') return undefined;
  const trimmed = key.trim();
  if (!trimmed || trimmed === 'your_omdb_api_key_here') return undefined;
  return trimmed;
}
