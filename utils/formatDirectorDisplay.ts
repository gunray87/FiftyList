/** Strips verbose TMDB/import prefixes so director lines read as names only under a “Director” label. */
export function stripDirectedByPrefix(raw: string): string {
  return raw.trim().replace(/^directed\s+by\s+/i, '').trim();
}
