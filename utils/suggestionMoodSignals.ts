import type { LlmMoodIntent } from '@/utils/llmMoodIntent';

/**
 * Parses "Refine picks" free text into genre hints and tokens so the suggestion
 * pipeline can fetch and rank catalog rows before any LLM rerank.
 */

const STOP = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'for',
  'to',
  'of',
  'in',
  'on',
  'with',
  'at',
  'by',
  'from',
  'as',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'will',
  'would',
  'could',
  'should',
  'may',
  'might',
  'must',
  'can',
  'this',
  'that',
  'these',
  'those',
  'i',
  'me',
  'my',
  'we',
  'our',
  'you',
  'your',
  'it',
  'its',
  'something',
  'anything',
  'nothing',
  'like',
  'just',
  'really',
  'very',
  'some',
  'any',
  'get',
  'want',
  'need',
  'books',
  'book',
  'movies',
  'movie',
  'films',
  'film',
  'watch',
  'read',
  'reading',
  'watching',
]);

/** Genre slugs accepted by `fetchBooksFromHardCodedData` / `getEnhancedGenreSuggestions`. */
const PHRASE_TO_SLUGS: Array<{ re: RegExp; slugs: string[] }> = [
  { re: /\b(sci[\s-]?fi|science fiction|space opera|dystopi|cyberpunk)\b/i, slugs: ['science fiction'] },
  { re: /\b(fantasy|magical|wizard|dragon|epic fantasy)\b/i, slugs: ['fantasy'] },
  { re: /\b(mystery|detective|crime noir|whodunnit|murder mystery)\b/i, slugs: ['mystery'] },
  { re: /\b(thriller|suspense|psychological thriller)\b/i, slugs: ['mystery', 'thriller'] },
  { re: /\b(horror|scary|ghost|haunted|supernatural)\b/i, slugs: ['horror'] },
  {
    re: /\b(adventure|expedition|survival|mountaineering|everest|climbing|hiking|trek|wilderness|outdoor|exploration|travelogue)\b/i,
    slugs: ['adventure'],
  },
  { re: /\b(romance|love story|romantic)\b/i, slugs: ['romance'] },
  { re: /\b(historical|medieval|ancient|world war)\b/i, slugs: ['historical'] },
  { re: /\b(literary|booker|pulitzer|prize[\s-]winning)\b/i, slugs: ['literary'] },
  { re: /\b(contemporary|upmarket|book club)\b/i, slugs: ['contemporary'] },
  { re: /\b(comedy|funny|humou?r|lighthearted|upbeat)\b/i, slugs: ['contemporary'] },
  { re: /\b(biograph|memoir|non[\s-]?fiction|true story)\b/i, slugs: ['literary'] },
  { re: /\b(young adult|\bya\b|teen)\b/i, slugs: ['young adult'] },
];

export type MoodSignals = {
  /** Lowercase genre slugs for catalog filters (e.g. adventure, science fiction). */
  genreSlugs: string[];
  /** Meaningful tokens (length ≥ 3, not stopwords) for description/title match. */
  tokens: string[];
  /** Original trimmed user text (lowercase). */
  rawLower: string;
  /** Primary anchors from "like …" (e.g. "into thin air") — highest priority. */
  titleAnchors: string[];
  /** Secondary author signals (e.g. trailing "love sarah maas") — lower priority. */
  authorAnchors: string[];
};

const AUTHOR_SIGNAL_RE =
  /\b(?:love|loved|enjoy|enjoyed|fan of|fans of|more)\s+([a-z][a-z.'\s-]{2,48}?)(?=\s*(?:\.|,|;|$|\band\b|\bbut\b|\balso\b))/gi;

const LIKE_TITLE_RE =
  /\blike\s+([^.,;]+?)(?=\s*(?:\.|,|;|$|\band\b|\bbut\b|\balso\b|\blove\b|\bloved\b|\bmore\b|\bfan\b))/gi;

function tokenize(raw: string): string[] {
  const lower = raw.toLowerCase().trim();
  return lower
    .split(/[^a-z0-9'/]+/i)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !STOP.has(t));
}

function extractTitleAnchors(raw: string): string[] {
  const anchors: string[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;
  const re = new RegExp(LIKE_TITLE_RE.source, 'gi');
  while ((match = re.exec(raw)) !== null) {
    const phrase = match[1].replace(/\s+/g, ' ').trim().toLowerCase();
    if (phrase.length < 3 || seen.has(phrase)) continue;
    seen.add(phrase);
    anchors.push(phrase);
  }
  return anchors;
}

function extractAuthorAnchors(raw: string, titleAnchors: string[]): string[] {
  const authors: string[] = [];
  const seen = new Set<string>();
  const titleBlob = titleAnchors.join(' ');

  let match: RegExpExecArray | null;
  const re = new RegExp(AUTHOR_SIGNAL_RE.source, 'gi');
  while ((match = re.exec(raw)) !== null) {
    let name = match[1].replace(/\s+/g, ' ').trim().toLowerCase();
    name = name.replace(/\b(books?|novels?|stories|films?|movies?)\b$/i, '').trim();
    if (name.length < 4 || seen.has(name)) continue;
    if (titleBlob.includes(name)) continue;
    seen.add(name);
    authors.push(name);
  }

  return authors;
}

export function extractMoodSignals(raw: string): MoodSignals | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const rawLower = trimmed.toLowerCase();
  const slugSet = new Set<string>();

  for (const { re, slugs } of PHRASE_TO_SLUGS) {
    if (re.test(rawLower)) {
      for (const s of slugs) slugSet.add(s.toLowerCase());
    }
  }

  const titleAnchors = extractTitleAnchors(trimmed);
  const authorAnchors = extractAuthorAnchors(trimmed, titleAnchors);

  const tokens = tokenize(trimmed).filter((tok) => {
    if (authorAnchors.some((a) => a.includes(tok) || tok.length >= 4 && a.split(/\s+/).includes(tok))) {
      return false;
    }
    return true;
  });

  return {
    genreSlugs: [...slugSet],
    tokens,
    rawLower,
    titleAnchors,
    authorAnchors,
  };
}

/** Score how well a row matches primary title anchors (0–15). */
export function scoreTitleAnchors(
  row: { title?: string; author?: string; description?: string },
  titleAnchors: string[]
): number {
  if (!titleAnchors.length) return 0;
  const title = (row.title || '').toLowerCase();
  const desc = (typeof row.description === 'string' ? row.description : '').toLowerCase();
  const blob = `${title} ${desc}`;
  let best = 0;

  for (const anchor of titleAnchors) {
    const words = anchor.split(/\s+/).filter((w) => w.length >= 3);
    if (words.length === 0) continue;

    if (title.includes(anchor) || anchor.includes(title)) {
      best = Math.max(best, 15);
      continue;
    }

    const matched = words.filter((w) => blob.includes(w)).length;
    const ratio = matched / words.length;
    if (ratio >= 0.66) best = Math.max(best, 10 + ratio * 4);
    else if (ratio >= 0.34) best = Math.max(best, 5 + ratio * 3);
  }

  return best;
}

/** Score secondary author mentions (0–5). */
export function scoreAuthorAnchors(
  row: { title?: string; author?: string },
  authorAnchors: string[]
): number {
  if (!authorAnchors.length) return 0;
  const author = (row.author || '').toLowerCase();
  const title = (row.title || '').toLowerCase();
  let best = 0;
  for (const anchor of authorAnchors) {
    if (author.includes(anchor) || anchor.includes(author)) best = Math.max(best, 5);
    else if (anchor.split(/\s+/).every((w) => w.length >= 3 && (author.includes(w) || title.includes(w)))) {
      best = Math.max(best, 3);
    }
  }
  return best;
}

/** True when mood text should drive catalog selection / filtering (not empty fluff). */
export function moodSignalsAreActionable(mood: MoodSignals | null): boolean {
  if (!mood) return false;
  if (mood.genreSlugs.length > 0) return true;
  return mood.tokens.some((t) => t.length >= 5);
}

export function scoreRowAgainstMood(
  row: {
    title?: string;
    author?: string;
    description?: string;
    genres?: string[];
  },
  mood: MoodSignals
): number {
  let score = 0;
  const title = (row.title || '').toLowerCase();
  const author = (row.author || '').toLowerCase();
  const desc = (typeof row.description === 'string' ? row.description : '').toLowerCase();
  const blob = `${title} ${author} ${desc}`;

  const genreTags = (row.genres || [])
    .filter((g): g is string => typeof g === 'string' && g.length > 0)
    .map((g) => g.toLowerCase());

  score += scoreTitleAnchors(row, mood.titleAnchors);
  const authorWeight = mood.titleAnchors.length > 0 ? 0.35 : 1;
  score += scoreAuthorAnchors(row, mood.authorAnchors) * authorWeight;

  for (const slug of mood.genreSlugs) {
    const s = (typeof slug === 'string' ? slug : String(slug ?? '')).toLowerCase();
    if (!s) continue;
    if (genreTags.some((g) => g.includes(s) || s.includes(g))) score += 6;
    else if (blob.includes(s)) score += 3;
  }

  for (const tok of mood.tokens) {
    if (typeof tok !== 'string' || tok.length < 4) continue;
    if (desc.includes(tok)) score += 2.5;
    else if (title.includes(tok)) score += 1.5;
    else if (author.includes(tok)) score += 0.75;
  }

  if (mood.rawLower.length >= 6 && blob.includes(mood.rawLower)) score += 4;

  if (
    mood.titleAnchors.length > 0 &&
    mood.genreSlugs.includes('adventure') &&
    !mood.genreSlugs.includes('fantasy') &&
    genreTags.some((g) => g.includes('fantasy'))
  ) {
    score -= 3;
  }

  return score;
}

/** Re-order loved highlights so refine title/genre anchors come before author-only matches. */
export function orderLovedHighlightsForRefine(
  highlights: Array<{ title: string; author: string; media: 'book' | 'movie' }>,
  mood: MoodSignals | null
): Array<{ title: string; author: string; media: 'book' | 'movie' }> {
  if (!mood || (!mood.titleAnchors.length && !mood.genreSlugs.length)) {
    return highlights;
  }
  const scored = highlights.map((h) => ({
    h,
    score:
      scoreTitleAnchors(h, mood.titleAnchors) +
      scoreAuthorAnchors(h, mood.authorAnchors) * 0.4,
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.map((x) => x.h);
}

/** Extra mood weighting from `/llm/mood-intent` (merged with local phrase signals). */
export function boostScoreWithLlmMoodIntent(
  row: {
    title?: string;
    author?: string;
    description?: string;
    genres?: string[];
    estimatedLength?: string;
  },
  intent: LlmMoodIntent | null,
  mood?: MoodSignals | null
): number {
  if (!intent) return 0;
  let add = 0;
  const genreTags = (row.genres || [])
    .filter((g): g is string => typeof g === 'string' && g.length > 0)
    .map((g) => g.toLowerCase());
  const blob = `${row.title || ''} ${row.author || ''} ${typeof row.description === 'string' ? row.description : ''}`.toLowerCase();

  let boostGenres = intent.boostGenres;
  if (
    mood?.titleAnchors.length &&
    mood.genreSlugs.includes('adventure') &&
    !mood.genreSlugs.includes('fantasy')
  ) {
    boostGenres = boostGenres.filter((g) => g !== 'fantasy' && !g.includes('fantasy'));
  }

  for (const g of boostGenres) {
    const s = (typeof g === 'string' ? g : String(g ?? '')).toLowerCase();
    if (!s) continue;
    if (genreTags.some((t) => t.includes(s) || s.includes(t))) add += 4;
    else if (blob.includes(s.slice(0, Math.min(8, s.length)))) add += 1.5;
  }
  for (const g of intent.avoidGenres) {
    const s = (typeof g === 'string' ? g : String(g ?? '')).toLowerCase();
    if (!s) continue;
    if (genreTags.some((t) => t.includes(s) || s.includes(t))) add -= 5;
  }

  const len = (row.estimatedLength || '').toLowerCase();
  if (intent.maxLength === 'short' && (/\blong\b/i.test(len) || len === 'long')) add -= 2;
  if (intent.maxLength === 'long' && (/\bshort\b/i.test(len) || len === 'short')) add -= 1.5;

  return add;
}
