import { Alert } from 'react-native';
import type { Book, BookData, Movie, MovieData } from '@/types';
import { buildTasteProfileSnapshot } from '@/utils/tasteProfileSummary';
import { estimateLengthFromTitle, type LengthBucket } from '@/utils/lengthBucket';
import { llmPremiumPost } from '@/utils/llmProxyRequest';

function collectHighRatedLengthBuckets(books: BookData, movies: MovieData): LengthBucket[] {
  const buckets: LengthBucket[] = [];
  const take = (list: (Book | Movie)[] | undefined) => {
    for (const it of list || []) {
      if (typeof it.rating !== 'number' || it.rating < 4) continue;
      buckets.push(estimateLengthFromTitle(it.title));
    }
  };
  take(books.completed);
  take(books.allTime);
  take(movies.completed);
  take(movies.allTime);
  return buckets;
}

function avgLengthLabel(buckets: LengthBucket[]): string | null {
  if (!buckets.length) return null;
  const score =
    buckets.reduce((sum, b) => sum + (b === 'short' ? 1 : b === 'long' ? 3 : 2), 0) / buckets.length;
  if (score < 1.6) return 'short';
  if (score > 2.4) return 'long';
  return 'medium';
}

export async function runStoppedRecoveryAlert(
  kind: 'book' | 'movie',
  stopped: Book | Movie,
  books: BookData,
  movies: MovieData,
  canUseLLM: boolean
): Promise<void> {
  if (!canUseLLM) return;
  if (process.env.EXPO_PUBLIC_ENABLE_LLM_ASSIST !== 'true' && !__DEV__) return;

  const snap = buildTasteProfileSnapshot(books, movies);
  const lengthBuckets = collectHighRatedLengthBuckets(books, movies);

  const res = await llmPremiumPost<{
    alternative?: {
      title?: string;
      author?: string;
      media?: string;
      explanation?: string;
    };
  }>(
    '/llm/stopped-recovery',
    'stopped_recovery',
    {
      stopped: {
        title: stopped.title,
        author: stopped.author || '',
        media: kind === 'movie' ? 'movie' : 'book',
        genres: [],
        lengthBucket: estimateLengthFromTitle(stopped.title),
      },
      userStats: {
        avgHighRatedLength: avgLengthLabel(lengthBuckets),
        topGenres: snap.aggregates.topGenres,
        completionRatePct: snap.aggregates.completionRatePct,
        formatSplitPct: snap.aggregates.formatSplitPct,
      },
    },
    12000
  );

  if (!res.ok) return;

  const alt = res.data.alternative;
  if (!alt || typeof alt.title !== 'string' || !alt.title.trim()) return;

  const explanation =
    typeof alt.explanation === 'string' && alt.explanation.trim().length > 0
      ? alt.explanation.trim()
      : '';
  const author =
    typeof alt.author === 'string' && alt.author.trim() ? ` — ${alt.author.trim()}` : '';
  const titleLine = `${alt.title.trim()}${author}`;

  const message = explanation
    ? `${explanation}\n\nTry next: ${titleLine}`
    : `Try next: ${titleLine}`;

  Alert.alert('After a pause', message);
}
