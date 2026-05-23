import AsyncStorage from '@react-native-async-storage/async-storage';

export const PREMIUM_SUGGESTION_CONTEXT_BOOKS_KEY = 'premium_suggestion_llm_context_books';
export const PREMIUM_SUGGESTION_CONTEXT_MOVIES_KEY = 'premium_suggestion_llm_context_movies';
/** Legacy single refine field — migrated to books on first load. */
export const PREMIUM_SUGGESTION_CONTEXT_LEGACY_KEY = 'premium_suggestion_llm_context';
export const TASTE_PROFILE_CACHE_KEY = 'fiftylist_taste_profile_cache_v7';

/** Removes stored Premium refine text and taste snapshot (e.g. downgrade to Entry). */
export async function clearPremiumRefineContext(): Promise<void> {
  await Promise.all([
    AsyncStorage.removeItem(PREMIUM_SUGGESTION_CONTEXT_BOOKS_KEY),
    AsyncStorage.removeItem(PREMIUM_SUGGESTION_CONTEXT_MOVIES_KEY),
    AsyncStorage.removeItem(PREMIUM_SUGGESTION_CONTEXT_LEGACY_KEY),
    AsyncStorage.removeItem(TASTE_PROFILE_CACHE_KEY),
  ]);
}
