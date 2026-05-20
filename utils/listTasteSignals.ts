import type { BookData, MovieData } from '@/types';
import { buildTasteProfileSnapshot } from '@/utils/tasteProfileSummary';

export type ListTasteSignals = {
  topGenres: string[];
  topAuthors: string[];
  topRated: Array<{ title: string; author: string; rating: number; media: 'book' | 'movie' }>;
};

/** Slug/tag → natural phrase for card copy. */
const GENRE_PHRASES: Record<string, string> = {
  'science fiction': 'science fiction',
  fantasy: 'fantasy',
  mystery: 'mysteries',
  thriller: 'thrillers',
  horror: 'horror',
  adventure: 'adventure',
  romance: 'romance',
  historical: 'historical fiction',
  literary: 'literary fiction',
  contemporary: 'contemporary fiction',
  'young adult': 'young adult',
  fiction: 'fiction',
  general: 'fiction',
};

export function buildListTasteSignals(books: BookData, movies: MovieData): ListTasteSignals {
  const snap = buildTasteProfileSnapshot(books, movies);
  return {
    topGenres: snap.aggregates.topGenres ?? [],
    topAuthors: [
      ...new Set(
        snap.topRated
          .map((t) => t.author.trim())
          .filter((a) => a.length > 0)
      ),
    ].slice(0, 8),
    topRated: snap.topRated.slice(0, 6).map((t) => ({
      title: t.title,
      author: t.author,
      rating: t.rating,
      media: t.media,
    })),
  };
}

function genreMatches(a: string, b: string): boolean {
  const x = a.toLowerCase().trim();
  const y = b.toLowerCase().trim();
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}

function genreDisplayPhrase(slugOrTag: string): string {
  const key = slugOrTag.toLowerCase().trim();
  return GENRE_PHRASES[key] ?? key;
}

function refinePhraseSnippet(phrase: string, maxLen = 52): string {
  const t = phrase.trim();
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen - 1).trimEnd()}…`;
}

function refineGenreOnCard(refineSlugs: string[], tags: string[]): string | null {
  for (const slug of refineSlugs) {
    if (tags.some((tag) => genreMatches(slug, tag))) return slug;
  }
  return null;
}

function listGenreOnCard(signals: ListTasteSignals, tags: string[]): string | null {
  return tags.find((tag) => signals.topGenres.some((g) => genreMatches(g, tag))) ?? null;
}

function indefinite(nounPhrase: string): string {
  const n = nounPhrase.trim().toLowerCase();
  if (/^[aeiou]/.test(n)) return `an ${nounPhrase}`;
  return `a ${nounPhrase}`;
}

/** Score how well a suggestion matches the user's lists (authors, genres, loved titles). */
export function listTasteMatchScore(
  row: { author?: string; genres?: string[]; title?: string },
  signals: ListTasteSignals
): number {
  let score = 0;
  const author = (row.author || '').trim();
  if (author && signals.topAuthors.some((a) => genreMatches(a, author))) {
    score += 12;
  }

  const tags = (row.genres || []).filter((g): g is string => typeof g === 'string' && g.length > 0);
  for (const tag of tags) {
    if (signals.topGenres.some((g) => genreMatches(g, tag))) {
      score += 8;
      break;
    }
  }

  const title = (row.title || '').toLowerCase();
  if (title) {
    for (const loved of signals.topRated) {
      if (loved.title.toLowerCase() === title) score += 20;
    }
  }

  return score;
}

/**
 * User-facing reason tied to list history and optional Refine picks text.
 */
export function buildListTasteReason(
  row: { title?: string; author?: string; genres?: string[] },
  signals: ListTasteSignals,
  options?: { refinePhrase?: string; refineGenreSlugs?: string[] }
): string {
  const phrase = options?.refinePhrase?.trim();
  const refineSlugs = options?.refineGenreSlugs ?? [];
  const hasRefine = Boolean(phrase && phrase.length >= 3);

  const tags = (row.genres || []).filter((g): g is string => typeof g === 'string' && g.length > 0);
  const author = (row.author || '').trim();
  const matchedAuthor = signals.topAuthors.find((a) => genreMatches(a, author));
  const refineGenre = hasRefine ? refineGenreOnCard(refineSlugs, tags) : null;
  const listGenre = listGenreOnCard(signals, tags);
  const snippet = hasRefine ? refinePhraseSnippet(phrase!) : '';

  if (hasRefine) {
    if (matchedAuthor && refineGenre) {
      const g = genreDisplayPhrase(refineGenre);
      return `You've enjoyed ${matchedAuthor} — ${indefinite(`${g} pick`)} for “${snippet}”`;
    }
    if (matchedAuthor) {
      return `You've enjoyed ${matchedAuthor} — picked for “${snippet}”`;
    }
    if (refineGenre) {
      const g = genreDisplayPhrase(refineGenre);
      return `${indefinite(g.charAt(0).toUpperCase() + g.slice(1) + ' story')} that fits “${snippet}”`;
    }
    return `Picked to match “${snippet}”`;
  }

  if (matchedAuthor) {
    return `Because you've enjoyed ${matchedAuthor} on your lists`;
  }

  if (listGenre) {
    const g = genreDisplayPhrase(listGenre);
    return `Because you often enjoy ${g} on your lists`;
  }

  const anchor = signals.topRated[0];
  if (anchor) {
    return `In the spirit of ${anchor.title}, which you rated ${anchor.rating}★`;
  }

  return 'Suggested from your book and movie lists';
}
