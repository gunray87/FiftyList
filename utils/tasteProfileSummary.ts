import type { Book, BookData, Movie, MovieData } from '@/types';
import { estimateLengthFromTitle, type LengthBucket } from '@/utils/lengthBucket';

export type TasteProfileFormat = 'text' | 'audio' | 'ebook' | 'streaming' | 'theater' | 'other';

export type TasteProfileTopItem = {
  title: string;
  author: string;
  media: 'book' | 'movie';
  rating: number;
  format: TasteProfileFormat | null;
  lengthBucket: LengthBucket;
  genres: string[];
};

export type TasteProfileMediaSummary = {
  ratedBooks: number;
  ratedMovies: number;
  /** Completed / in-progress / all-time items (may be unrated). */
  listedBooks: number;
  listedMovies: number;
  listCounts: {
    books: { completed: number; inProgress: number; planned: number };
    movies: { completed: number; inProgress: number; planned: number };
  };
};

export type TasteProfileAggregates = {
  avgRating: number | null;
  formatSplitPct: Record<string, number>;
  avgLengthBucket: LengthBucket | null;
  topGenres: string[];
  topBookGenres: string[];
  topMovieGenres: string[];
  formatDataCount: number;
  completionRatePct: number | null;
  mediaSummary: TasteProfileMediaSummary;
};

export type TasteProfileSnapshot = {
  summaryHash: string;
  topRated: TasteProfileTopItem[];
  topRatedBooks: TasteProfileTopItem[];
  topRatedMovies: TasteProfileTopItem[];
  aggregates: TasteProfileAggregates;
  /** Compact loved list for refine / recovery prompts */
  lovedHighlights: Array<{ title: string; author: string; media: 'book' | 'movie' }>;
  /** @deprecated — kept for older callers */
  stats: {
    books: { completed: number; inProgress: number; planned: number; fails: number };
    movies: { completed: number; inProgress: number; planned: number; fails: number };
    topGenres: string[];
  };
  recentLoved: Array<{ title: string; author: string; media: 'book' | 'movie' }>;
};

const BOOK_GENRE_KEYWORDS: Array<[string, RegExp]> = [
  ['science fiction', /\b(sci[\s-]?fi|science fiction|dystopi)\b/i],
  ['fantasy', /\b(fantasy|dragon|wizard|magic)\b/i],
  ['mystery', /\b(mystery|detective|noir|whodunit)\b/i],
  ['thriller', /\b(thriller|suspense|espionage)\b/i],
  ['horror', /\b(horror|ghost|vampire|zombie)\b/i],
  ['romance', /\b(romance|love story)\b/i],
  ['literary', /\b(literary|booker|pulitzer)\b/i],
  ['historical', /\b(historical|wwii|civil war|medieval)\b/i],
  ['comedy', /\b(comedy|humou?r|satire)\b/i],
  ['biography', /\b(biograph|memoir|autobiograph)\b/i],
  ['nonfiction', /\b(nonfiction|non-fiction|essay|journalism)\b/i],
];

const MOVIE_GENRE_KEYWORDS: Array<[string, RegExp]> = [
  ['action', /\b(action|superhero|marvel|heist)\b/i],
  ['drama', /\b(drama|prestige|character study)\b/i],
  ['comedy', /\b(comedy|rom-com|satire)\b/i],
  ['thriller', /\b(thriller|suspense|noir)\b/i],
  ['horror', /\b(horror|slasher|supernatural)\b/i],
  ['sci-fi', /\b(sci[\s-]?fi|space|alien|dystopi)\b/i],
  ['documentary', /\b(documentary|docu)\b/i],
  ['animation', /\b(animated|pixar|anime)\b/i],
  ['western', /\b(western|cowboy)\b/i],
  ['war', /\b(war film|wwii|vietnam)\b/i],
  ['crime', /\b(crime|gangster|mafia)\b/i],
];

type TasteListItem = {
  title: string;
  author?: string;
  rating?: number;
  format?: string;
  description?: string;
  notes?: string;
  genres?: string[];
};

function countCategory<T extends { id: number }>(arr: T[] | undefined): number {
  return Array.isArray(arr) ? arr.length : 0;
}

function hashPayload(payload: string): string {
  let hash = 5381;
  for (let i = 0; i < payload.length; i++) {
    hash = (hash * 33) ^ payload.charCodeAt(i);
  }
  return `h${(hash >>> 0).toString(16)}`;
}

function normalizeBookFormat(fmt: string | undefined): TasteProfileFormat | null {
  if (!fmt) return null;
  const f = fmt.toLowerCase();
  if (f === 'text' || f === 'print') return 'text';
  if (f === 'audio') return 'audio';
  if (f === 'ebook') return 'ebook';
  return 'other';
}

function normalizeMovieFormat(fmt: string | undefined): TasteProfileFormat | null {
  if (!fmt) return null;
  const f = fmt.toLowerCase();
  if (f === 'streaming') return 'streaming';
  if (f === 'theater') return 'theater';
  if (f === 'bluray' || f === 'dvd') return 'other';
  return 'other';
}

function inferGenresFromKeywords(
  title: string,
  extraText: string,
  keywords: Array<[string, RegExp]>
): string[] {
  const blob = `${title} ${extraText}`;
  const out: string[] = [];
  for (const [label, re] of keywords) {
    if (re.test(blob)) out.push(label);
  }
  return out;
}

function inferGenresForTasteItem(item: TasteListItem, media: 'book' | 'movie'): string[] {
  const stored =
    Array.isArray(item.genres) && item.genres.length > 0
      ? item.genres
          .filter((g): g is string => typeof g === 'string' && g.trim().length > 0)
          .map((g) => g.trim().toLowerCase())
      : [];
  const extra = `${item.description || ''} ${item.notes || ''}`.trim();
  const fromKeywords = inferGenresFromKeywords(
    item.title,
    extra,
    media === 'movie' ? [...BOOK_GENRE_KEYWORDS, ...MOVIE_GENRE_KEYWORDS] : BOOK_GENRE_KEYWORDS
  );
  return [...new Set([...stored, ...fromKeywords])].slice(0, 6);
}

/** Coerce persisted ratings (number or numeric string) for taste aggregation. */
export function normalizeListRating(rating: unknown): number | null {
  if (typeof rating === 'number' && Number.isFinite(rating)) {
    const n = Math.round(rating);
    return n >= 1 && n <= 5 ? n : null;
  }
  if (typeof rating === 'string' && rating.trim()) {
    const n = Math.round(Number(rating));
    return Number.isFinite(n) && n >= 1 && n <= 5 ? n : null;
  }
  return null;
}

function itemKey(title: string, author: string): string {
  return `${title.toLowerCase().trim()}:${author.toLowerCase().trim()}`;
}

function countUniqueRatedInData(data: BookData | MovieData): number {
  const seen = new Set<string>();
  for (const list of [data.completed, data.allTime, data.inProgress, data.planned, data.fails]) {
    for (const item of list || []) {
      if (normalizeListRating(item.rating) === null) continue;
      if (!item.title?.trim()) continue;
      seen.add(itemKey(item.title, item.author || ''));
    }
  }
  return seen.size;
}

function countUniqueListedInData(data: BookData | MovieData): number {
  const seen = new Set<string>();
  for (const list of [data.completed, data.allTime, data.inProgress]) {
    for (const item of list || []) {
      if (!item.title?.trim()) continue;
      seen.add(itemKey(item.title, item.author || ''));
    }
  }
  return seen.size;
}

function collectRatedItems(books: BookData, movies: MovieData): TasteProfileTopItem[] {
  const rows: TasteProfileTopItem[] = [];

  const pushBook = (b: Book) => {
    const rating = normalizeListRating(b.rating);
    if (rating === null) return;
    const tasteItem = b as Book & TasteListItem;
    rows.push({
      title: b.title,
      author: b.author || '',
      media: 'book',
      rating,
      format: normalizeBookFormat(b.format),
      lengthBucket: estimateLengthFromTitle(b.title),
      genres: inferGenresForTasteItem(tasteItem, 'book'),
    });
  };

  const pushMovie = (m: Movie) => {
    const rating = normalizeListRating(m.rating);
    if (rating === null) return;
    const tasteItem = m as Movie & TasteListItem;
    rows.push({
      title: m.title,
      author: m.author || '',
      media: 'movie',
      rating,
      format: normalizeMovieFormat(m.format),
      lengthBucket: estimateLengthFromTitle(m.title),
      genres: inferGenresForTasteItem(tasteItem, 'movie'),
    });
  };

  for (const list of [
    books.completed,
    books.allTime,
    books.inProgress,
    books.planned,
    books.fails,
  ]) {
    for (const b of list || []) pushBook(b);
  }
  for (const list of [
    movies.completed,
    movies.allTime,
    movies.inProgress,
    movies.planned,
    movies.fails,
  ]) {
    for (const m of list || []) pushMovie(m);
  }

  const byKey = new Map<string, TasteProfileTopItem>();
  for (const r of rows) {
    const key = `${r.media}:${r.title.toLowerCase()}:${r.author.toLowerCase()}`;
    const prev = byKey.get(key);
    if (!prev || r.rating > prev.rating) byKey.set(key, r);
  }

  return balanceTopRatedByMedia([...byKey.values()], TOP_RATED_PER_MEDIA);
}

const TOP_RATED_PER_MEDIA = 5;

/** Completed / in-progress films on the list without star ratings — still part of taste. */
function collectListedMoviesForTaste(
  movies: MovieData,
  ratedMovies: TasteProfileTopItem[],
  limit: number
): TasteProfileTopItem[] {
  if (limit <= 0) return [];
  const seen = new Set(ratedMovies.map((m) => itemKey(m.title, m.author)));
  const out: TasteProfileTopItem[] = [];

  for (const list of [movies.completed, movies.allTime, movies.inProgress]) {
    for (const m of list || []) {
      if (out.length >= limit) return out;
      if (!m.title?.trim()) continue;
      if (normalizeListRating(m.rating) !== null) continue;
      const key = itemKey(m.title, m.author || '');
      if (seen.has(key)) continue;
      seen.add(key);
      const tasteItem = m as Movie & TasteListItem;
      out.push({
        title: m.title.trim(),
        author: (m.author || '').trim(),
        media: 'movie',
        rating: 0,
        format: normalizeMovieFormat(m.format),
        lengthBucket: estimateLengthFromTitle(m.title),
        genres: inferGenresForTasteItem(tasteItem, 'movie'),
      });
    }
  }
  return out;
}

export function buildTopRatedMoviesForTaste(
  movies: MovieData,
  ratedPool: TasteProfileTopItem[]
): TasteProfileTopItem[] {
  const rated = ratedPool.filter((i) => i.media === 'movie').slice(0, TOP_RATED_PER_MEDIA);
  const fillers = collectListedMoviesForTaste(
    movies,
    rated,
    Math.max(0, TOP_RATED_PER_MEDIA - rated.length)
  );
  return [...rated, ...fillers];
}

/** Keep top picks from both books and movies (not only global top-N books). */
export function balanceTopRatedByMedia(
  items: TasteProfileTopItem[],
  perMedia = TOP_RATED_PER_MEDIA
): TasteProfileTopItem[] {
  const books = items.filter((i) => i.media === 'book').slice(0, perMedia);
  const movies = items.filter((i) => i.media === 'movie').slice(0, perMedia);
  return [...books, ...movies].sort((a, b) => b.rating - a.rating);
}

export function buildBalancedLovedHighlights(
  topRated: TasteProfileTopItem[],
  max = 6
): Array<{ title: string; author: string; media: 'book' | 'movie' }> {
  const perSide = Math.max(1, Math.floor(max / 2));
  const books = topRated.filter((i) => i.media === 'book').slice(0, perSide);
  const movies = topRated.filter((i) => i.media === 'movie').slice(0, perSide);
  const seen = new Set<string>();
  const out: TasteProfileTopItem[] = [];
  for (const item of [...books, ...movies, ...topRated]) {
    const key = `${item.media}:${item.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= max) break;
  }
  return out.map((i) => ({ title: i.title, author: i.author, media: i.media }));
}

function lengthBucketToScore(b: LengthBucket): number {
  if (b === 'short') return 1;
  if (b === 'long') return 3;
  return 2;
}

function scoreToLengthBucket(score: number): LengthBucket {
  if (score < 1.5) return 'short';
  if (score > 2.5) return 'long';
  return 'medium';
}

function buildAggregates(
  topRated: TasteProfileTopItem[],
  books: BookData,
  movies: MovieData,
  bookStats: { completed: number; inProgress: number; planned: number; fails: number },
  movieStats: { completed: number; inProgress: number; planned: number; fails: number }
): TasteProfileAggregates {
  const ratedBooks = countUniqueRatedInData(books);
  const ratedMovies = countUniqueRatedInData(movies);
  const listedBooks = countUniqueListedInData(books);
  const listedMovies = countUniqueListedInData(movies);
  const genreCounts = new Map<string, number>();
  const bookGenreCounts = new Map<string, number>();
  const movieGenreCounts = new Map<string, number>();
  for (const item of topRated) {
    const genres =
      item.genres.length > 0 ? item.genres : inferGenresForTasteItem(item, item.media);
    const target = item.media === 'book' ? bookGenreCounts : movieGenreCounts;
    for (const g of genres) {
      genreCounts.set(g, (genreCounts.get(g) || 0) + 1);
      target.set(g, (target.get(g) || 0) + 1);
    }
  }
  const topGenres = [...genreCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([g]) => g);
  const topBookGenres = [...bookGenreCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([g]) => g);
  const topMovieGenres = [...movieGenreCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([g]) => g);

  const ratings = topRated.map((i) => i.rating);
  const avgRating =
    ratings.length > 0 ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null;

  const formatCounts = new Map<string, number>();
  let formatDataCount = 0;
  const scanFormat = (fmt: TasteProfileFormat | null) => {
    if (!fmt) return;
    formatDataCount += 1;
    const key = fmt === 'text' ? 'print' : fmt;
    formatCounts.set(key, (formatCounts.get(key) || 0) + 1);
  };
  for (const item of topRated) scanFormat(item.format);
  for (const b of [...(books.completed || []), ...(books.allTime || []), ...(books.inProgress || [])]) {
    scanFormat(normalizeBookFormat(b.format));
  }
  for (const m of [...(movies.completed || []), ...(movies.allTime || []), ...(movies.inProgress || [])]) {
    scanFormat(normalizeMovieFormat(m.format));
  }

  const formatSplitPct: Record<string, number> = {};
  const formatTotal = [...formatCounts.values()].reduce((a, b) => a + b, 0);
  if (formatTotal > 0) {
    for (const [k, v] of formatCounts) {
      formatSplitPct[k] = Math.round((v / formatTotal) * 100);
    }
  }

  const lenScores = topRated.map((i) => lengthBucketToScore(i.lengthBucket));
  const avgLengthBucket =
    lenScores.length > 0
      ? scoreToLengthBucket(lenScores.reduce((a, b) => a + b, 0) / lenScores.length)
      : null;

  const completed =
    countCategory(books.completed) +
    countCategory(books.allTime) +
    countCategory(movies.completed) +
    countCategory(movies.allTime);
  const fails = countCategory(books.fails) + countCategory(movies.fails);
  const denom = completed + fails;
  const completionRatePct = denom > 0 ? Math.round((completed / denom) * 100) : null;

  return {
    avgRating,
    formatSplitPct,
    avgLengthBucket,
    topGenres,
    topBookGenres,
    topMovieGenres,
    formatDataCount,
    completionRatePct,
    mediaSummary: {
      ratedBooks,
      ratedMovies,
      listedBooks,
      listedMovies,
      listCounts: {
        books: {
          completed: bookStats.completed,
          inProgress: bookStats.inProgress,
          planned: bookStats.planned,
        },
        movies: {
          completed: movieStats.completed,
          inProgress: movieStats.inProgress,
          planned: movieStats.planned,
        },
      },
    },
  };
}

/** Compact snapshot + stable hash for taste-profile caching (~400 tokens input). */
export function buildTasteProfileSnapshot(books: BookData, movies: MovieData): TasteProfileSnapshot {
  const bookStats = {
    completed: countCategory(books.completed),
    inProgress: countCategory(books.inProgress),
    planned: countCategory(books.planned),
    fails: countCategory(books.fails),
  };
  const movieStats = {
    completed: countCategory(movies.completed),
    inProgress: countCategory(movies.inProgress),
    planned: countCategory(movies.planned),
    fails: countCategory(movies.fails),
  };

  const ratedPool = collectRatedItems(books, movies);
  const topRatedBooks = ratedPool.filter((i) => i.media === 'book').slice(0, TOP_RATED_PER_MEDIA);
  const topRatedMovies = buildTopRatedMoviesForTaste(movies, ratedPool);
  const topRated = [...topRatedBooks, ...topRatedMovies].sort((a, b) => b.rating - a.rating);
  const aggregates = buildAggregates(topRated, books, movies, bookStats, movieStats);

  const lovedHighlights = buildBalancedLovedHighlights(topRated, 6);

  const summaryHash = hashPayload(
    JSON.stringify({
      topRated: topRated.map((i) => [
        i.media,
        i.title,
        i.rating,
        i.format,
        i.lengthBucket,
        i.genres,
      ]),
      aggregates,
      bookStats,
      movieStats,
    })
  );

  return {
    summaryHash,
    topRated,
    topRatedBooks,
    topRatedMovies,
    aggregates,
    lovedHighlights,
    stats: {
      books: bookStats,
      movies: movieStats,
      topGenres: aggregates.topGenres,
    },
    recentLoved: lovedHighlights,
  };
}

/** True when refine cards may include format_suggestion from the model. */
export function shouldIncludeFormatSuggestion(snapshot: TasteProfileSnapshot): boolean {
  return snapshot.aggregates.formatDataCount >= 5;
}
