/**
 * TMDB — use EXPO_PUBLIC_TMDB_API_KEY from .env (local) or EAS env (builds).
 * Do not hardcode keys in source.
 */
export const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

export function getTmdbApiKey(): string | undefined {
  const key = process.env.EXPO_PUBLIC_TMDB_API_KEY;
  return typeof key === 'string' && key.trim().length > 0 ? key.trim() : undefined;
}
