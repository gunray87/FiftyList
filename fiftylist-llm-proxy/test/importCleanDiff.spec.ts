import { describe, it, expect } from 'vitest';
import { applyImportCleanDiff } from '../src/importCleanDiff';

describe('applyImportCleanDiff', () => {
	it('applies replace then removes by original 1-based indices', () => {
		const raw = ['a', 'b', 'c', 'd', 'e'].join('\n');
		const out = applyImportCleanDiff(raw, {
			replace_lines: { '3': 'C-fixed' },
			remove_lines: [5, 1],
		});
		expect(out.split('\n')).toEqual(['b', 'C-fixed', 'd']);
	});

	it('handles CRLF input and outputs LF', () => {
		const raw = 'x\r\ny\r\nz';
		const out = applyImportCleanDiff(raw, { remove_lines: [2] });
		expect(out).toBe('x\nz');
	});

	it('ignores out-of-range remove and replace keys', () => {
		const raw = 'only';
		const out = applyImportCleanDiff(raw, {
			remove_lines: [99, 0, -1, 2],
			replace_lines: { '2': 'nope', '1': 'ONLY' },
		});
		expect(out).toBe('ONLY');
	});
});
