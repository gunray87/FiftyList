export type LengthBucket = 'short' | 'medium' | 'long';

/** Heuristic length bucket from title (books/movies without runtime/pages). */
export function estimateLengthFromTitle(title: string): LengthBucket {
  const t = title.toLowerCase();
  if (/\b(short stories|novella|graphic novel|essay|poems?)\b/.test(t)) return 'short';
  if (/\b(complete works|saga|trilogy|omnibus|encyclopedia|atlas)\b/.test(t)) return 'long';
  if (/\b(part one|book 1|volume 1)\b/.test(t) && t.length < 40) return 'medium';
  if (t.length > 55) return 'long';
  return 'medium';
}
