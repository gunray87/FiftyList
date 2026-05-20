/**
 * Safe substring match for list search — avoids .toLowerCase() on non-strings
 * (imported/legacy data can leave notes/source as numbers or other types).
 */
export function fieldMatchesQuery(value: unknown, queryLower: string): boolean {
  if (value == null || value === '') return false;
  return String(value).toLowerCase().includes(queryLower);
}
