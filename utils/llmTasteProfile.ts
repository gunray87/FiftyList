import { llmPremiumPost } from '@/utils/llmProxyRequest';
import {
  finalizeTasteNarrative,
  mergeFilmIntoTasteNarrative,
} from '@/utils/tasteNarrativeFormat';
import type { TasteProfileAggregates, TasteProfileTopItem } from '@/utils/tasteProfileSummary';

export type TasteProfileRequestPayload = {
  summaryHash: string;
  topRated: TasteProfileTopItem[];
  topRatedBooks: TasteProfileTopItem[];
  topRatedMovies: TasteProfileTopItem[];
  aggregates: TasteProfileAggregates;
};

export type TasteProfileResponse = {
  narrative?: string;
  cached?: boolean;
  remaining_actions?: number;
  reset_at?: string;
};

export async function fetchTasteProfileNarrative(
  payload: TasteProfileRequestPayload
): Promise<{ narrative: string | null; fromCache: boolean }> {
  const topRatedMovies =
    payload.topRatedMovies.length > 0
      ? payload.topRatedMovies
      : payload.topRated.filter((i) => i.media === 'movie');
  const topRatedBooks =
    payload.topRatedBooks.length > 0
      ? payload.topRatedBooks
      : payload.topRated.filter((i) => i.media === 'book');
  const listedMovies =
    payload.aggregates.mediaSummary?.listedMovies ?? topRatedMovies.length;
  const movieGenres = payload.aggregates.topMovieGenres ?? [];

  const res = await llmPremiumPost<TasteProfileResponse>(
    '/llm/taste-profile',
    'taste_profile',
    {
      summaryHash: payload.summaryHash,
      topRated: payload.topRated,
      topRatedBooks,
      topRatedMovies,
      aggregates: payload.aggregates,
    },
    12000
  );
  if (!res.ok) return { narrative: null, fromCache: false };
  const n = typeof res.data.narrative === 'string' ? res.data.narrative.trim() : '';
  if (n.length === 0) return { narrative: null, fromCache: res.data.cached === true };

  const finalized = mergeFilmIntoTasteNarrative(
    finalizeTasteNarrative(n),
    listedMovies,
    topRatedMovies.map((m) => ({ title: m.title, author: m.author })),
    movieGenres
  );
  return {
    narrative: finalized,
    fromCache: res.data.cached === true,
  };
}
