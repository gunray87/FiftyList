/**
 * Shared shape for offline book catalog rows (Suggestions + Add Book search).
 * Maps from `data/enriched_books_catalog.json` via `comprehensiveBookCatalog.ts`.
 */

export interface EnrichedBooksJsonRow {
  id: number;
  title: string;
  author: string;
  year: number;
  description: string;
  genres: string[];
  category?: string;
  rating?: number;
  estimated_length?: string;
  confidence?: string;
  reason?: string;
}

/** Normalized catalog item used everywhere `COMPREHENSIVE_BOOK_DATA` appeared. */
export interface ComprehensiveCatalogBook {
  catalogId?: number;
  title: string;
  author: string;
  year: number;
  description: string;
  genres: string[];
  rating: number;
  /** Fiction / Non-Fiction from source when present */
  fictionCategory?: string;
  estimatedLength?: string;
  /** high | medium | low from enrichment */
  dataConfidence?: string;
  /** Provenance note from enrichment pipeline */
  dataReason?: string;
  /** Optional—for legacy rows only */
  awards?: string[];
}
