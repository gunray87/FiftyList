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
  scifi: 'science fiction',
  fantasy: 'fantasy',
  mystery: 'mystery',
  mysteries: 'mystery',
  thriller: 'thriller',
  thrillers: 'thriller',
  horror: 'horror',
  adventure: 'adventure',
  romance: 'romance',
  historical: 'historical fiction',
  literary: 'literary fiction',
  contemporary: 'contemporary fiction',
  'young adult': 'young adult',
  fiction: 'fiction',
  general: 'fiction',
  drama: 'drama',
  comedy: 'comedy',
  documentary: 'documentaries',
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

function refinePhraseSnippet(phrase: string, maxLen = 48): string {
  const t = phrase.trim();
  if (!t) return '';
  const clipped = t.length <= maxLen ? t : `${t.slice(0, maxLen - 1).trimEnd()}…`;
  return clipped.charAt(0).toUpperCase() + clipped.slice(1);
}

function seasonDisplayLabel(season: string): string {
  const s = season.trim();
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/** Ensures one sentence, ends with punctuation, no double spaces. */
function finalizeReasonCopy(text: string): string {
  let s = text.replace(/\s+/g, ' ').trim();
  if (!s) return s;
  if (!/[.!?]$/.test(s)) s += '.';
  return s;
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

/** Short label for card copy; stable per title. */
export function clipTitleForSuggestionReason(title: string, maxChars = 40): string {
  const t = (title || '').trim();
  if (!t) return 'This title';
  if (t.length <= maxChars) return t;
  return `${t.slice(0, maxChars - 1).trimEnd()}…`;
}

function clipAuthorForSuggestionReason(author: string, maxChars = 28): string {
  const a = (author || '').trim();
  if (!a) return '';
  if (a.length <= maxChars) return a;
  return `${a.slice(0, maxChars - 1).trimEnd()}…`;
}

function pickReasonTemplate(
  templates: string[],
  seed: string,
  bucket: string,
  templateSlot?: number
): string {
  if (templates.length === 0) return '';
  const idx =
    templateSlot != null
      ? Math.abs(templateSlot) % templates.length
      : stableTemplatePick(`${seed}|${bucket}`, templates.length);
  return finalizeReasonCopy(templates[idx]!);
}

/** Canned copy that should be replaced with per-card list-taste reasons. */
export function isGenericSuggestionReason(reason: string): boolean {
  const r = (reason || '').trim();
  if (!r) return true;
  return (
    /^Semantically similar to/i.test(r) ||
    /^Because you enjoy /i.test(r) ||
    /^Highly rated pick from/i.test(r) ||
    /^Popular in /i.test(r) ||
    /^Perfect \w+ reading/i.test(r) ||
    /^Award-winning literary/i.test(r) ||
    /^Predicted /i.test(r) ||
    /^Local recommendation/i.test(r) ||
    /^Recommended for you$/i.test(r) ||
    /^Suggested from the FiftyList/i.test(r) ||
    /^If ".+" clicked for you/i.test(r) ||
    /^Strong match for your recent preferences$/i.test(r) ||
    /^We pulled /i.test(r) ||
    /low-friction/i.test(r) ||
    /north star/i.test(r) ||
    /maps cleanly/i.test(r) ||
    /→/.test(r)
  );
}

/** Varied “similar to X” copy — one template per card via variationKey. */
export function buildSemanticSimilarReason(
  referenceTitle: string,
  row: { title?: string; author?: string; genres?: string[] },
  variationKey: string
): string {
  const refClip = clipTitleForSuggestionReason(referenceTitle || 'something you liked');
  const titleClip = clipTitleForSuggestionReason(row.title || 'This title');
  const templates = [
    `If you liked ${refClip}, ${titleClip} should feel like a natural next pick.`,
    `${titleClip} is close to ${refClip} in tone and story.`,
    `Fans of ${refClip} often enjoy ${titleClip} next.`,
    `${titleClip} has a similar vibe to ${refClip}, without repeating something you've already logged.`,
    `You responded well to ${refClip} — ${titleClip} is in the same neighborhood.`,
    `${titleClip} pairs well with ${refClip} if you want more of that feel.`,
  ];
  const picked = templates[stableTemplatePick(`${variationKey}|semantic|${refClip}`, templates.length)]!;
  return finalizeReasonCopy(picked);
}

/** Deterministic template index so siblings don't all share one phrase. */
export function stableTemplatePick(seed: string, length: number): number {
  if (length <= 0) return 0;
  let h = 2166136261;
  const s = seed.length > 0 ? seed : '∅';
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % length;
}

function reasonVariationSeed(
  row: { title?: string; author?: string; genres?: string[] },
  extra?: string,
  cardIndex?: number
): string {
  const tags = (row.genres || []).filter((g): g is string => typeof g === 'string' && g.length > 0);
  const indexPart = cardIndex != null ? `idx${cardIndex}` : '';
  return [row.title || '', row.author || '', tags.join('|'), extra || '', indexPart].join('§');
}

/** Normalizes copy so we can detect repeated templates that only swap the title. */
export function reasonSkeleton(reason: string, title?: string, author?: string): string {
  let sk = (reason || '').trim();
  if (!sk) return '';
  const t = (title || '').trim();
  if (t) {
    const clip = clipTitleForSuggestionReason(t);
    if (clip && sk.includes(clip)) sk = sk.split(clip).join('«T»');
    if (t.length <= 80 && sk.includes(t)) sk = sk.split(t).join('«T»');
  }
  const a = (author || '').trim();
  if (a) {
    const authorClip = clipAuthorForSuggestionReason(a);
    if (authorClip && sk.includes(authorClip)) sk = sk.split(authorClip).join('«A»');
    if (a.length <= 60 && sk.includes(a)) sk = sk.split(a).join('«A»');
  }
  sk = sk.replace(/"[^"]{1,120}"/g, '«Q»');
  sk = sk.replace(/\s+/g, ' ').trim();
  return sk;
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
 * Copy is plain-language and complete-sentence for Entry-tier (non-LLM) cards.
 */
export function buildListTasteReason(
  row: { title?: string; author?: string; genres?: string[] },
  signals: ListTasteSignals,
  options?: {
    refinePhrase?: string;
    refineGenreSlugs?: string[];
    variationKey?: string;
    cardIndex?: number;
    templateSlot?: number;
    seasonLabel?: string;
  }
): string {
  const phrase = options?.refinePhrase?.trim();
  const refineSlugs = options?.refineGenreSlugs ?? [];
  const hasRefine = Boolean(phrase && phrase.length >= 3);
  const seed = reasonVariationSeed(row, options?.variationKey, options?.cardIndex);

  const tags = (row.genres || []).filter((g): g is string => typeof g === 'string' && g.length > 0);
  const author = (row.author || '').trim();
  const matchedAuthor = signals.topAuthors.find((a) => genreMatches(a, author));
  const refineGenre = hasRefine ? refineGenreOnCard(refineSlugs, tags) : null;
  const listGenre = listGenreOnCard(signals, tags);
  const snippet = hasRefine ? refinePhraseSnippet(phrase!) : '';
  const titleClip = clipTitleForSuggestionReason(row.title || '');
  const authorClip = clipAuthorForSuggestionReason(author);
  const slot = options?.templateSlot;

  const season = options?.seasonLabel?.trim();
  if (season && !hasRefine) {
    const seasonName = seasonDisplayLabel(season);
    const gPhrase = listGenre
      ? genreDisplayPhrase(listGenre)
      : tags[0]
        ? genreDisplayPhrase(tags[0])
        : 'what you usually pick';
    const seasonalTemplates = [
      `${titleClip} is a strong ${seasonName} pick — you've been choosing a lot of ${gPhrase} around this time of year.`,
      `As ${seasonName} arrives, ${titleClip} matches the ${gPhrase} pattern on your lists.`,
      `${titleClip} fits how your ${gPhrase} choices shift in ${seasonName}.`,
      authorClip
        ? `${titleClip}, by ${authorClip}, is a ${seasonName} ${gPhrase} match from your history.`
        : `For ${seasonName}, ${titleClip} lines up with your usual ${gPhrase} taste.`,
    ];
    return pickReasonTemplate(seasonalTemplates, seed, 'season', slot);
  }

  if (hasRefine) {
    if (matchedAuthor && refineGenre) {
      const g = genreDisplayPhrase(refineGenre);
      const templates = [
        `You liked ${matchedAuthor} before, and ${titleClip} fits "${snippet}" in the ${g} space.`,
        `${titleClip} matches "${snippet}" and your history with ${matchedAuthor}.`,
        `Because ${matchedAuthor} worked for you, ${titleClip} is a ${g} pick for "${snippet}".`,
        `You asked for "${snippet}" — ${titleClip} is ${g} and close to ${matchedAuthor}'s style.`,
        `${titleClip} answers "${snippet}" in ${g}, building on ${matchedAuthor} from your lists.`,
      ];
      return pickReasonTemplate(templates, seed, 'ref-ma-rg', slot);
    }
    if (matchedAuthor) {
      const templates = [
        `You liked ${matchedAuthor} before, and ${titleClip} fits what you wanted: "${snippet}".`,
        `${titleClip} lines up with "${snippet}" and your taste for ${matchedAuthor}.`,
        `Based on "${snippet}" and ${matchedAuthor} on your lists, ${titleClip} is a solid match.`,
        `${titleClip} should click if "${snippet}" and ${matchedAuthor} are both on your mind.`,
        `You asked for "${snippet}" — ${titleClip} continues your ${matchedAuthor} streak.`,
      ];
      return pickReasonTemplate(templates, seed, 'ref-ma', slot);
    }
    if (refineGenre) {
      const g = genreDisplayPhrase(refineGenre);
      const templates = [
        `You wanted "${snippet}" — ${titleClip} is a ${g} title that fits.`,
        `${titleClip} matches "${snippet}" in the ${g} genre you've been exploring.`,
        `For "${snippet}", ${titleClip} is a ${g} pick worth trying.`,
        `${titleClip} fits "${snippet}" without repeating something you've already finished.`,
        authorClip
          ? `${titleClip}, by ${authorClip}, targets "${snippet}" in ${g}.`
          : `"${snippet}" pointed us to ${titleClip} in ${g}.`,
      ];
      return pickReasonTemplate(templates, seed, 'ref-rg', slot);
    }
    const bareRefine = [
      `Picked because you mentioned "${snippet}".`,
      `${titleClip} matches what you're in the mood for: "${snippet}".`,
      `You asked for "${snippet}" — ${titleClip} is a good fit.`,
      `${titleClip} lines up with your note: "${snippet}".`,
      authorClip
        ? `For "${snippet}", try ${titleClip} by ${authorClip}.`
        : `"${snippet}" is why ${titleClip} is here.`,
    ];
    return pickReasonTemplate(bareRefine, seed, 'ref-bare', slot);
  }

  if (matchedAuthor) {
    const templates = [
      `You've enjoyed ${matchedAuthor} — ${titleClip} is in the same ballpark.`,
      `${titleClip} should click if ${matchedAuthor} worked for you.`,
      `Your lists show a pattern with ${matchedAuthor}; ${titleClip} continues it.`,
      `Because ${matchedAuthor} landed for you, ${titleClip} is an easy next try.`,
      `${titleClip} shares what you liked about ${matchedAuthor}, without repeating a past pick.`,
      authorClip && authorClip !== matchedAuthor
        ? `${titleClip}, by ${authorClip}, is a fresh voice near ${matchedAuthor}.`
        : `${titleClip} feels familiar if you liked ${matchedAuthor}.`,
    ];
    return pickReasonTemplate(templates, seed, 'author', slot);
  }

  if (listGenre) {
    const g = genreDisplayPhrase(listGenre);
    const templates = [
      `You've been into ${g} lately — ${titleClip} continues that streak.`,
      `${titleClip} fits the ${g} taste showing up on your lists.`,
      `Your recent picks lean ${g}; ${titleClip} belongs in that mix.`,
      `${titleClip} matches the ${g} pattern from what you've been finishing.`,
      `Another ${g} option worth trying: ${titleClip}.`,
      `Based on your ${g} habit, ${titleClip} is worth a look.`,
      authorClip
        ? `${titleClip}, by ${authorClip}, adds variety in ${g}.`
        : `${titleClip} is a ${g} pick you haven't logged yet.`,
      `You keep returning to ${g} — ${titleClip} fits that groove.`,
    ];
    return pickReasonTemplate(templates, seed, 'genre', slot);
  }

  const anchors = signals.topRated;
  if (anchors.length > 0) {
    const anchorIdx =
      slot != null ? Math.abs(slot) % anchors.length : stableTemplatePick(seed, anchors.length);
    const anchor = anchors[anchorIdx]!;
    const anchorClip = clipTitleForSuggestionReason(anchor.title);
    const starNote =
      anchor.rating >= 5 ? ' (a favorite)' : anchor.rating >= 4 ? ' (highly rated)' : '';
    const templates = [
      `You rated ${anchorClip} highly${starNote} — ${titleClip} has a similar feel.`,
      `Loved ${anchorClip}? ${titleClip} is a natural next pick.`,
      `${titleClip} is in the same neighborhood as ${anchorClip}, which you enjoyed.`,
      `Because ${anchorClip} worked for you, ${titleClip} is worth trying next.`,
      `${titleClip} should scratch the same itch as ${anchorClip}.`,
      authorClip
        ? `${titleClip}, by ${authorClip}, follows the energy of ${anchorClip}.`
        : `After ${anchorClip}, ${titleClip} is a sensible next choice.`,
    ];
    return pickReasonTemplate(templates, seed, `anchor|${anchor.title}`, slot);
  }

  const fallbacks = [
    `${titleClip} stood out based on what you've been logging on your lists.`,
    `Picked from patterns in your books and movies — ${titleClip} is a fresh option.`,
    `${titleClip} fits the mix you've been building lately.`,
    `Your history suggests ${titleClip} is worth trying next.`,
    authorClip
      ? `${titleClip}, by ${authorClip}, is new to your lists but fits your taste.`
      : `${titleClip} is a new name that still fits your overall pattern.`,
    `${titleClip} complements what you've been tracking recently.`,
  ];
  return pickReasonTemplate(fallbacks, seed, 'fallback', slot);
}

type SuggestionReasonRow = {
  id: string;
  title?: string;
  author?: string;
  genres?: string[];
  reason: string;
  /** When `seasonal`, list-taste copy may reference the current season. */
  category?: string;
};

/**
 * Ensures each card has unique, non-generic rationale before the LLM refine pass.
 */
export function ensureDistinctSuggestionReasons<T extends SuggestionReasonRow>(
  suggestions: T[],
  signals: ListTasteSignals,
  options?: {
    refinePhrase?: string;
    refineGenreSlugs?: string[];
    /** Calendar season (e.g. Spring) — only used for rows with `category: 'seasonal'`. */
    seasonLabel?: string;
    preserveExistingReasons?: boolean;
  }
): T[] {
  const usedReasons = new Set<string>();
  const usedSkeletons = new Set<string>();

  const register = (reason: string, title?: string, author?: string) => {
    const r = finalizeReasonCopy(reason);
    usedReasons.add(r);
    const sk = reasonSkeleton(r, title, author);
    if (sk) usedSkeletons.add(sk);
    return r;
  };

  const isDuplicate = (reason: string, title?: string, author?: string) => {
    const r = (reason || '').trim();
    if (!r) return true;
    if (usedReasons.has(r)) return true;
    const sk = reasonSkeleton(r, title, author);
    return Boolean(sk && usedSkeletons.has(sk));
  };

  const seasonLabelForRow = (s: T): string | undefined => {
    if (s.category !== 'seasonal') return undefined;
    return options?.seasonLabel?.trim() || undefined;
  };

  const assignDistinctReason = (s: T, index: number, startAttempt = 0): string => {
    let attempt = startAttempt;
    let reason = '';
    do {
      reason = buildListTasteReason(
        { title: s.title, author: s.author, genres: s.genres },
        signals,
        {
          refinePhrase: options?.refinePhrase,
          refineGenreSlugs: options?.refineGenreSlugs,
          seasonLabel: seasonLabelForRow(s),
          variationKey: `${s.id}|${index}|${attempt}`,
          cardIndex: index + attempt,
          templateSlot: index + attempt,
        }
      );
      attempt += 1;
    } while (isDuplicate(reason, s.title, s.author) && attempt < startAttempt + 28);
    return reason;
  };

  return suggestions.map((s, index) => {
    let reason = (s.reason || '').trim();
    const semantic = reason.match(/^Semantically similar to "(.+)"$/);

    if (semantic) {
      reason = buildSemanticSimilarReason(
        semantic[1],
        { title: s.title, author: s.author, genres: s.genres },
        `${s.id}|${index}`
      );
    } else if (!options?.preserveExistingReasons) {
      reason = assignDistinctReason(s, index);
    } else if (!reason || isGenericSuggestionReason(reason) || isDuplicate(reason, s.title, s.author)) {
      reason = assignDistinctReason(s, index);
    }

    if (isDuplicate(reason, s.title, s.author)) {
      reason = assignDistinctReason(s, index, 1);
    }

    reason = register(reason, s.title, s.author);
    return { ...s, reason };
  });
}
