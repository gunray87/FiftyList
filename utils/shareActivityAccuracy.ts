import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ActivityLog, Book, BookData, ItemType, Movie, MovieData } from '@/types';
import { isLegacySampleActivity } from '@/utils/activityLogger';

const BOOKS_STORAGE_KEY = 'fiftylist_books_data';
const MOVIES_STORAGE_KEY = 'fiftylist_movies_data';

const EMPTY_BOOKS: BookData = {
  completed: [],
  inProgress: [],
  planned: [],
  fails: [],
  allTime: [],
};
const EMPTY_MOVIES: MovieData = {
  completed: [],
  inProgress: [],
  planned: [],
  fails: [],
  allTime: [],
};

export type ListItemSnapshot = {
  item: Book | Movie;
  category: Book['category'];
};

const CATEGORY_RANK: Record<Book['category'], number> = {
  completed: 5,
  inProgress: 4,
  planned: 3,
  fails: 2,
  allTime: 1,
};

export async function loadStoredListsForShare(): Promise<{
  books: BookData;
  movies: MovieData;
}> {
  try {
    const [booksRaw, moviesRaw] = await Promise.all([
      AsyncStorage.getItem(BOOKS_STORAGE_KEY),
      AsyncStorage.getItem(MOVIES_STORAGE_KEY),
    ]);
    return {
      books: booksRaw ? (JSON.parse(booksRaw) as BookData) : { ...EMPTY_BOOKS },
      movies: moviesRaw ? (JSON.parse(moviesRaw) as MovieData) : { ...EMPTY_MOVIES },
    };
  } catch {
    return { books: { ...EMPTY_BOOKS }, movies: { ...EMPTY_MOVIES } };
  }
}

export function buildListItemIndex(
  books: BookData,
  movies: MovieData
): Map<string, ListItemSnapshot> {
  const index = new Map<string, ListItemSnapshot>();

  const addItem = (item: Book | Movie, itemType: ItemType, category: Book['category']) => {
    if (!item?.id || !String(item.title ?? '').trim()) return;
    const key = `${itemType}:${item.id}`;
    const existing = index.get(key);
    if (!existing || CATEGORY_RANK[category] > CATEGORY_RANK[existing.category]) {
      index.set(key, { item, category });
    }
  };

  const bookBuckets: Array<{ items: Book[]; category: Book['category'] }> = [
    { items: books.completed ?? [], category: 'completed' },
    { items: books.inProgress ?? [], category: 'inProgress' },
    { items: books.planned ?? [], category: 'planned' },
    { items: books.fails ?? [], category: 'fails' },
    { items: books.allTime ?? [], category: 'allTime' },
  ];
  for (const bucket of bookBuckets) {
    for (const book of bucket.items) addItem(book, 'book', bucket.category);
  }

  const movieBuckets: Array<{ items: Movie[]; category: Movie['category'] }> = [
    { items: movies.completed ?? [], category: 'completed' },
    { items: movies.inProgress ?? [], category: 'inProgress' },
    { items: movies.planned ?? [], category: 'planned' },
    { items: movies.fails ?? [], category: 'fails' },
    { items: movies.allTime ?? [], category: 'allTime' },
  ];
  for (const bucket of movieBuckets) {
    for (const movie of bucket.items) addItem(movie, 'movie', bucket.category);
  }

  return index;
}

export function formatCategoryLabel(
  category: string | undefined,
  itemType: ItemType
): string {
  const c = (category || '').trim();
  switch (c) {
    case 'completed':
      return itemType === 'book' ? 'Done' : 'Watched';
    case 'inProgress':
      return itemType === 'book' ? 'Reading' : 'Watching';
    case 'planned':
      return 'Planned';
    case 'fails':
      return 'Did not finish';
    case 'allTime':
      return 'All-time favorites';
    default:
      return c ? c.replace(/([A-Z])/g, ' $1').trim() : 'your list';
  }
}

function normalizeRating(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n < 1 || n > 5) return undefined;
  return Math.round(n);
}

/** Drop samples, deleted items; refresh title/author/rating from the live list. */
export function resolveActivityForShare(
  activity: ActivityLog,
  index: Map<string, ListItemSnapshot>
): ActivityLog | null {
  if (isLegacySampleActivity(activity)) return null;

  const key = `${activity.itemType}:${activity.itemId}`;
  const snapshot = index.get(key);
  if (!snapshot) return null;

  const { item } = snapshot;
  const title = String(item.title ?? '').trim();
  if (!title) return null;

  const author = String(item.author ?? '').trim();
  const listRating = normalizeRating(item.rating);
  const eventRating = normalizeRating(activity.metadata?.rating);
  const rating =
    activity.type === 'rated'
      ? eventRating ?? listRating
      : listRating ?? eventRating;

  return {
    ...activity,
    itemTitle: title,
    itemAuthor: author || activity.itemAuthor || 'Unknown',
    metadata: {
      ...activity.metadata,
      rating,
      format: item.format ?? activity.metadata?.format,
    },
  };
}

export type SanitizedShareActivities = {
  activities: ActivityLog[];
  omittedCount: number;
};

export function sanitizeActivitiesForShare(
  activities: ActivityLog[],
  index: Map<string, ListItemSnapshot>
): SanitizedShareActivities {
  let omittedCount = 0;
  const resolved: ActivityLog[] = [];

  for (const activity of activities) {
    const row = resolveActivityForShare(activity, index);
    if (!row) {
      omittedCount += 1;
      continue;
    }
    if (row.type === 'rated' && !normalizeRating(row.metadata?.rating)) {
      omittedCount += 1;
      continue;
    }
    resolved.push(row);
  }

  return { activities: resolved, omittedCount };
}

/** One row per item + activity type (keeps the most recent event). */
export function dedupeActivitiesByItemAndType(activities: ActivityLog[]): ActivityLog[] {
  const sorted = [...activities].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
  const seen = new Map<string, ActivityLog>();
  for (const activity of sorted) {
    const key = `${activity.itemType}:${activity.itemId}:${activity.type}`;
    if (!seen.has(key)) seen.set(key, activity);
  }
  return [...seen.values()].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
}

export type ListFormatRow = {
  activity: ActivityLog;
  snapshot: ListItemSnapshot;
};

/** List format: one line per item using current list status (not stale event labels). */
export function buildListFormatRows(
  activities: ActivityLog[],
  index: Map<string, ListItemSnapshot>
): ListFormatRow[] {
  const sorted = [...activities].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
  const byItem = new Map<string, ListFormatRow>();

  for (const activity of sorted) {
    const resolved = resolveActivityForShare(activity, index);
    if (!resolved) continue;
    const key = `${resolved.itemType}:${resolved.itemId}`;
    if (!byItem.has(key)) {
      const snapshot = index.get(key);
      if (!snapshot) continue;
      byItem.set(key, { activity: resolved, snapshot });
    }
  }

  return [...byItem.values()].sort((a, b) =>
    a.activity.itemTitle.localeCompare(b.activity.itemTitle, undefined, { sensitivity: 'base' })
  );
}

export function shareAccuracyFooter(omittedCount: number): string {
  if (omittedCount <= 0) return '';
  const noun = omittedCount === 1 ? 'entry was' : 'entries were';
  return `\nNote: ${omittedCount} logged ${noun} omitted because those items are no longer on your lists.\n`;
}
