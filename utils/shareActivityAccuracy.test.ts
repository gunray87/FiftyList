import { describe, expect, it } from 'vitest';
import type { ActivityLog, BookData, MovieData } from '@/types';
import {
  buildListItemIndex,
  dedupeActivitiesByItemAndType,
  resolveActivityForShare,
  sanitizeActivitiesForShare,
} from './shareActivityAccuracy';

const books: BookData = {
  completed: [
    {
      id: 1,
      title: 'Dune',
      author: 'Frank Herbert',
      publicationYear: 1965,
      category: 'completed',
      rating: 5,
      completedDate: '2026-01-15',
    },
  ],
  inProgress: [],
  planned: [],
  fails: [],
  allTime: [],
};

const movies: MovieData = {
  completed: [],
  inProgress: [],
  planned: [],
  fails: [],
  allTime: [],
};

describe('shareActivityAccuracy', () => {
  it('refreshes title/author from the live list', () => {
    const index = buildListItemIndex(books, movies);
    const stale: ActivityLog = {
      id: '1',
      timestamp: '2026-01-16T12:00:00.000Z',
      type: 'completed',
      itemType: 'book',
      itemId: 1,
      itemTitle: 'Old Wrong Title',
      itemAuthor: 'Wrong Author',
    };

    const resolved = resolveActivityForShare(stale, index);
    expect(resolved?.itemTitle).toBe('Dune');
    expect(resolved?.itemAuthor).toBe('Frank Herbert');
    expect(resolved?.metadata?.rating).toBe(5);
  });

  it('omits activities for deleted items', () => {
    const index = buildListItemIndex(books, movies);
    const ghost: ActivityLog = {
      id: '2',
      timestamp: '2026-01-16T12:00:00.000Z',
      type: 'completed',
      itemType: 'book',
      itemId: 999,
      itemTitle: 'Ghost Book',
      itemAuthor: 'Nobody',
    };

    const { activities, omittedCount } = sanitizeActivitiesForShare([ghost], index);
    expect(activities).toHaveLength(0);
    expect(omittedCount).toBe(1);
  });

  it('dedupes repeated events for the same item and type', () => {
    const a: ActivityLog = {
      id: 'a',
      timestamp: '2026-01-10T12:00:00.000Z',
      type: 'rated',
      itemType: 'book',
      itemId: 1,
      itemTitle: 'Dune',
      itemAuthor: 'Frank Herbert',
      metadata: { rating: 4 },
    };
    const b: ActivityLog = {
      ...a,
      id: 'b',
      timestamp: '2026-01-12T12:00:00.000Z',
      metadata: { rating: 5 },
    };

    const out = dedupeActivitiesByItemAndType([a, b]);
    expect(out).toHaveLength(1);
    expect(out[0]?.metadata?.rating).toBe(5);
  });
});
