export type ListMediaType = 'book' | 'movie';
export type ListCategory = 'completed' | 'inProgress' | 'planned' | 'fails' | 'allTime';
export type ListSortBy = 'newest' | 'oldest' | 'rating_desc' | 'rating_asc' | 'title_asc' | 'title_desc';

export interface ListSearchIntent {
  category?: ListCategory;
  textQuery?: string;
  titleIncludes?: string;
  authorIncludes?: string;
  notesIncludes?: string;
  sourceIncludes?: string;
  year?: number;
  sortBy?: ListSortBy;
  explanationShort?: string;
}

/**
 * Lightweight local fallback parser for natural-language list queries.
 * Helps when proxy is unavailable so phrases like "books by Maas" still work.
 */
export function parseQuickListIntent(query: string): ListSearchIntent | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;

  const intent: ListSearchIntent = {};

  if (/\b(read|watched|finished|done|completed)\b/.test(q)) intent.category = 'completed';
  else if (/\b(reading|watching|in progress|currently)\b/.test(q)) intent.category = 'inProgress';
  else if (/\b(plan|planned|want to|to read|to watch|watchlist)\b/.test(q)) intent.category = 'planned';
  else if (/\b(stopped|dnf|abandoned|quit)\b/.test(q)) intent.category = 'fails';

  const byMatch = q.match(/\bby\s+([a-z0-9 .'\-]{2,60})$/i) || q.match(/\bby\s+([a-z0-9 .'\-]{2,60})\b/i);
  if (byMatch?.[1]) {
    intent.authorIncludes = byMatch[1].trim();
  }

  const yearMatch = q.match(/\b(19|20)\d{2}\b/);
  if (yearMatch) {
    intent.year = Number(yearMatch[0]);
  }

  if (/\b(newest|latest|recent)\b/.test(q)) intent.sortBy = 'newest';
  else if (/\b(oldest|earliest)\b/.test(q)) intent.sortBy = 'oldest';
  else if (/\b(top rated|best rated|highest rated)\b/.test(q)) intent.sortBy = 'rating_desc';
  else if (/\b(lowest rated)\b/.test(q)) intent.sortBy = 'rating_asc';
  else if (/\b(a to z|alphabetical)\b/.test(q)) intent.sortBy = 'title_asc';
  else if (/\b(z to a)\b/.test(q)) intent.sortBy = 'title_desc';

  const asksForLength = /\b(long|short|length|runtime|pages?|page count)\b/.test(q);
  if (asksForLength) {
    // Current list item schema doesn't persist length fields (book pages / movie runtime).
    intent.explanationShort = 'Length filter needs page/runtime data in saved items';
  }

  const cleaned = q
    .replace(/\b(books?|movies?|films?)\b/g, ' ')
    .replace(/\b(show|find|search|me|my|i've|ive|i|that|with|called)\b/g, ' ')
    .replace(/\b(read|watched|finished|done|completed|reading|watching|planned|plan|want to|to read|to watch|watchlist|stopped|dnf|abandoned|quit)\b/g, ' ')
    .replace(/\bby\s+[a-z0-9 .'\-]{2,60}\b/g, ' ')
    .replace(/\b(19|20)\d{2}\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (cleaned.length >= 2 && !asksForLength) {
    intent.textQuery = cleaned.slice(0, 80);
  }

  const hasSignal =
    Boolean(intent.category) ||
    Boolean(intent.authorIncludes) ||
    Boolean(intent.year) ||
    Boolean(intent.sortBy) ||
    Boolean(intent.textQuery) ||
    Boolean(intent.explanationShort);
  return hasSignal ? intent : null;
}

