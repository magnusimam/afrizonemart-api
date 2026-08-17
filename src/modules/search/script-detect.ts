/**
 * Search Phase 1 — coarse Unicode-script classification, logged on
 * `SearchQueryLog.script`.
 *
 * Deliberate substitution for the spec's "language detection" line
 * (see schema.prisma doc comment on `SearchQueryLog.script` for the
 * full rationale): word-level language ID is unreliable on the 1-3
 * word queries search actually sees, and Phase 0's 'simple' tsvector
 * config doesn't switch per-language analyzers regardless — so script
 * (which script the characters belong to) is the signal we can
 * classify accurately and could plausibly act on later (e.g. routing
 * Arabic-script queries to a right-to-left UI hint).
 *
 * Ranges cover the scripts most likely across Afrizonemart's 54-country
 * footprint: Latin (default/majority), Arabic, Ethiopic (Amharic/
 * Tigrinya), Cyrillic. Falls back to "mixed" when a query has more
 * than one script's characters, "unknown" when it has none (pure
 * digits/punctuation).
 */

const SCRIPT_RANGES: Array<{ name: string; pattern: RegExp }> = [
  { name: 'arabic', pattern: /[؀-ۿݐ-ݿ]/ },
  { name: 'ethiopic', pattern: /[ሀ-፿]/ },
  { name: 'cyrillic', pattern: /[Ѐ-ӿ]/ },
  { name: 'cjk', pattern: /[一-鿿぀-ヿ]/ },
  { name: 'latin', pattern: /[a-zA-ZÀ-ɏ]/ },
];

export function detectScript(rawQuery: string): string {
  const found = new Set<string>();
  for (const { name, pattern } of SCRIPT_RANGES) {
    if (pattern.test(rawQuery)) found.add(name);
  }
  if (found.size === 0) return 'unknown';
  if (found.size > 1) return 'mixed';
  return [...found][0];
}
