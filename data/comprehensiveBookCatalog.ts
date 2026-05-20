import type {
  ComprehensiveCatalogBook,
  EnrichedBooksJsonRow,
} from '@/types/comprehensiveBookCatalog';
import rawCatalog from './enriched_books_catalog.json';

function addTag(tags: Set<string>, value: string | undefined | null) {
  if (value == null) return;
  const t = String(value).toLowerCase().trim();
  if (t) tags.add(t);
}

/**
 * Derives searchable genre tags: display labels (lowercased) + bucket tags
 * so existing filters like `includes("adventure")` still match enriched labels.
 */
export function deriveGenreTags(row: EnrichedBooksJsonRow): string[] {
  const tags = new Set<string>();

  for (const g of row.genres || []) {
    addTag(tags, g);
    addTag(tags, g.replace(/\s*&\s*/g, ' and '));
  }

  const cat = row.category?.trim();
  if (cat) {
    addTag(tags, cat);
    if (/fiction/i.test(cat) && !/non/i.test(cat)) addTag(tags, 'fiction');
    if (/non-fiction|nonfiction/i.test(cat)) addTag(tags, 'non-fiction');
  }

  const blob = [row.title, row.author, row.description, ...(row.genres || []), row.category || '']
    .join(' ')
    .toLowerCase();

  // Broad buckets used by LOCAL_BOOK_DATA / filters in Suggestions
  if (
    /\badventure\b|mountaineering|\bexpedition\b|backpacking|\bsafari\b|canyon|rafting|trail | trails|wilderness survival|through-hike|alpini|gran canyon|antarctic|\bclimb(ing)?\b/i.test(
      blob
    )
  ) {
    addTag(tags, 'adventure');
  }
  if (
    /\bfantasy\b|\bmagic\b|\bdragon\b|\bsorcery\b|fae|grimdark|wizard|witch|realm|fairy tale|folklore|\bepic fantasy\b/i.test(
      blob
    )
  ) {
    addTag(tags, 'fantasy');
  }
  if (
    /\bmystery\b|detective|crime fiction|thriller|noir|whodunit|whodunnit|cold case|murder investigation|psychological thriller|\bspy\b novel/i.test(
      blob
    )
  ) {
    addTag(tags, 'mystery');
  }
  if (/\bsci[- ]?fi\b|science fiction/i.test(blob)) addTag(tags, 'science fiction');
  if (/\bromance\b|love story/i.test(blob)) addTag(tags, 'romance');
  if (/\bmemoir\b|autobiography/i.test(blob)) addTag(tags, 'memoir');
  if (/\bhorror\b/i.test(blob)) addTag(tags, 'horror');

  return [...tags].sort();
}

function normalizeRow(row: EnrichedBooksJsonRow): ComprehensiveCatalogBook {
  const genres = deriveGenreTags(row);
  const rating = typeof row.rating === 'number' && Number.isFinite(row.rating) ? row.rating : 4;
  return {
    catalogId: row.id,
    title: String(row.title ?? '').trim(),
    author: String(row.author ?? '').trim(),
    year: typeof row.year === 'number' ? row.year : 0,
    description: String(row.description ?? '').trim(),
    genres,
    rating,
    fictionCategory: row.category?.trim(),
    estimatedLength: row.estimated_length?.trim(),
    dataConfidence: typeof row.confidence === 'string' ? row.confidence : undefined,
    dataReason: typeof row.reason === 'string' ? row.reason : undefined,
  };
}

function isValidRow(row: EnrichedBooksJsonRow): boolean {
  return Boolean(String(row.title ?? '').trim() && String(row.author ?? '').trim());
}

const catalog = (Array.isArray(rawCatalog) ? rawCatalog : []) as EnrichedBooksJsonRow[];

/**
 * Full offline book list (enriched JSON). Used by Suggestions, local book search,
 * and any filter that previously read `COMPREHENSIVE_BOOK_DATA` from suggestions.tsx.
 */
export const COMPREHENSIVE_BOOK_DATA: ComprehensiveCatalogBook[] = catalog
  .filter(isValidRow)
  .map(normalizeRow);
