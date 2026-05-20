import { describe, expect, it } from 'vitest';
import {
	mergeFilmIntoTasteNarrative,
	finalizeTasteNarrative,
	lastCompleteSentenceEnd,
} from '../src/tasteNarrative';

describe('finalizeTasteNarrative', () => {
	it('keeps text that already ends on a sentence', () => {
		const s = 'You love fantasy. You read often.';
		expect(finalizeTasteNarrative(s)).toBe(s);
	});

	it('drops a trailing incomplete sentence (mid-word cut)', () => {
		const s =
			'You balance literary nonfiction with immersive fantasy, indicating you appreciate both meticu';
		const prev =
			'Your taste gravitates toward medium-length books with consistently high ratings (4.5 average), suggesting you are selective. ';
		const full = prev + s;
		const end = lastCompleteSentenceEnd(full);
		expect(end).toBeGreaterThan(0);
		expect(finalizeTasteNarrative(full).endsWith('selective.')).toBe(true);
		expect(finalizeTasteNarrative(full)).not.toContain('meticu');
	});

	it('trims over max at last complete sentence within limit', () => {
		const long =
			'One. Two. Three. Four. Five. Six. Seven. Eight. Nine. Ten. Eleven. Twelve.';
		const out = finalizeTasteNarrative(long, 40);
		expect(out.length).toBeLessThanOrEqual(40);
		expect(out).toMatch(/[.!?]$/);
	});
});

describe('mergeFilmIntoTasteNarrative', () => {
	it('appends a film sentence when narrative is book-only but movies exist', () => {
		const out = mergeFilmIntoTasteNarrative(
			'You favor literary nonfiction and epic fantasy on the page.',
			3,
			[{ title: 'Dune', author: 'Denis Villeneuve' }],
			['sci-fi']
		);
		expect(out).toMatch(/film|movie/i);
		expect(out).toContain('Dune');
	});

	it('does not duplicate when narrative already names a listed film', () => {
		const s = 'You read widely and loved watching Dune in theaters.';
		expect(
			mergeFilmIntoTasteNarrative(s, 2, [{ title: 'Dune', author: 'Villeneuve' }], [])
		).toBe(finalizeTasteNarrative(s));
	});
});
