import { describe, expect, it } from 'vitest';
import {
  buildListTasteReason,
  ensureDistinctSuggestionReasons,
  reasonSkeleton,
  type ListTasteSignals,
} from './listTasteSignals';

const signals: ListTasteSignals = {
  topGenres: ['fantasy', 'mystery'],
  topAuthors: ['Brandon Sanderson'],
  topRated: [
    { title: 'The Way of Kings', author: 'Brandon Sanderson', rating: 5, media: 'book' },
    { title: 'Dune', author: 'Frank Herbert', rating: 5, media: 'book' },
  ],
};

describe('ensureDistinctSuggestionReasons', () => {
  it('assigns unique rationales before LLM (no preserve)', () => {
    const rows = [
      { id: 'a', title: 'Mistborn', author: 'Brandon Sanderson', genres: ['fantasy'], reason: 'Recommended for you' },
      { id: 'b', title: 'Elantris', author: 'Brandon Sanderson', genres: ['fantasy'], reason: 'Recommended for you' },
      { id: 'c', title: 'Warbreaker', author: 'Brandon Sanderson', genres: ['fantasy'], reason: 'Recommended for you' },
      { id: 'd', title: 'The Final Empire', author: 'Brandon Sanderson', genres: ['fantasy'], reason: 'Recommended for you' },
      { id: 'e', title: 'Skyward', author: 'Brandon Sanderson', genres: ['sci-fi'], reason: 'Recommended for you' },
    ];

    const out = ensureDistinctSuggestionReasons(rows, signals, { preserveExistingReasons: false });
    const reasons = out.map((r) => r.reason);
    expect(new Set(reasons).size).toBe(reasons.length);

    const skeletons = reasons.map((r, i) => reasonSkeleton(r, rows[i]!.title, rows[i]!.author));
    expect(new Set(skeletons).size).toBe(skeletons.length);
  });

  it('uses different template slots for sibling fantasy picks', () => {
    const reasons = [0, 1, 2, 3].map((i) =>
      buildListTasteReason(
        { title: `Fantasy Book ${i}`, author: `Author ${i}`, genres: ['fantasy'] },
        signals,
        { templateSlot: i, cardIndex: i }
      )
    );
    expect(new Set(reasons).size).toBe(reasons.length);
  });

  it('does not apply seasonal copy to non-seasonal cards', () => {
    const rows = [
      {
        id: 'genre-1',
        title: 'Dune',
        author: 'Frank Herbert',
        genres: ['sci-fi'],
        reason: 'Recommended for you',
        category: 'genre',
      },
      {
        id: 'award-1',
        title: 'The Hobbit',
        author: 'J.R.R. Tolkien',
        genres: ['fantasy'],
        reason: 'Recommended for you',
        category: 'award',
      },
    ];

    const out = ensureDistinctSuggestionReasons(rows, signals, {
      seasonLabel: 'Spring',
      preserveExistingReasons: false,
    });

    for (const row of out) {
      expect(row.reason).not.toMatch(/\bSpring\b/i);
      expect(row.reason).not.toMatch(/time of year/i);
    }
  });

  it('allows seasonal copy only for seasonal category rows', () => {
    const rows = [
      {
        id: 'seasonal-1',
        title: 'The Nightingale',
        author: 'Kristin Hannah',
        genres: ['historical'],
        reason: 'Recommended for you',
        category: 'seasonal',
      },
    ];

    const out = ensureDistinctSuggestionReasons(rows, signals, {
      seasonLabel: 'Spring',
      preserveExistingReasons: false,
    });

    expect(out[0]!.reason).toMatch(/\bSpring\b/i);
  });

  it('writes plain-language reasons without jargon or broken articles', () => {
    const reason = buildListTasteReason(
      { title: 'The Hobbit', author: 'J.R.R. Tolkien', genres: ['fantasy'] },
      signals,
      { refinePhrase: 'cozy adventure', refineGenreSlugs: ['fantasy'] }
    );
    expect(reason).toMatch(/\.$/);
    expect(reason).not.toMatch(/→|low-friction|north star|maps cleanly|an mysteries|a mysteries/i);
    expect(reason.toLowerCase()).toContain('cozy adventure');
  });
});
