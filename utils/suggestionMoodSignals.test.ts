import { describe, expect, it } from 'vitest';
import {
  extractMoodSignals,
  scoreAuthorAnchors,
  scoreRowAgainstMood,
  scoreTitleAnchors,
} from './suggestionMoodSignals';

describe('extractMoodSignals refine priority', () => {
  it('parses primary title anchor before secondary author', () => {
    const mood = extractMoodSignals('Preference for adventure like into thin air. Love sarah maas');
    expect(mood?.titleAnchors).toContain('into thin air');
    expect(mood?.authorAnchors).toContain('sarah maas');
    expect(mood?.genreSlugs).toContain('adventure');
  });

  it('scores title anchor above author-only match', () => {
    const mood = extractMoodSignals('adventure like into thin air. love sarah maas')!;
    const survival = scoreRowAgainstMood(
      {
        title: 'Into Thin Air',
        author: 'Jon Krakauer',
        description: 'Mount Everest disaster survival nonfiction',
        genres: ['adventure', 'nonfiction'],
      },
      mood
    );
    const fantasy = scoreRowAgainstMood(
      {
        title: 'A Court of Thorns and Roses',
        author: 'Sarah J. Maas',
        description: 'Romantic fantasy fae courts',
        genres: ['fantasy', 'romance'],
      },
      mood
    );
    expect(survival).toBeGreaterThan(fantasy);
  });

  it('title anchor scores higher than author anchor alone', () => {
    expect(scoreTitleAnchors({ title: 'Into Thin Air', description: 'everest' }, ['into thin air'])).toBeGreaterThan(
      scoreAuthorAnchors({ author: 'Sarah J. Maas' }, ['sarah maas'])
    );
  });
});
