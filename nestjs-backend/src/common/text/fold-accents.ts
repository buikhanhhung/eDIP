/**
 * Accent folding that matches the `immutable_unaccent` wrapper in Postgres.
 *
 * NFD decomposition plus diacritic removal is not enough for Vietnamese. `đ`
 * and `Đ` are distinct letters rather than a base plus a combining mark, so NFD
 * leaves them untouched — while Postgres' `unaccent` dictionary maps them to
 * `d` and `D`. Verified against the running database:
 *
 *   SELECT immutable_unaccent('Hợp Đồng');   -- "Hop Dong"
 *   SELECT immutable_unaccent('Đông Nam Á'); -- "Dong Nam A"
 *
 * The divergence is the kind that hides: the lexical lane would match `hop
 * dong` in SQL, then the snippet builder would fail to locate it in TypeScript
 * and quietly fall back to the opening of the document — the same symptom as
 * the `ts_headline` bug this codebase already avoids. Entity dedup had the same
 * gap, keeping `Đông` and `dong` as separate graph nodes.
 *
 * Folding stays 1:1 per character so an index into the folded string addresses
 * the same position in the original. Callers rely on that for offsets.
 */
const D_STROKE = /[đĐ]/g;

export function foldAccents(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(D_STROKE, (char) => (char === 'đ' ? 'd' : 'D'));
}

/** Folded and lowercased, for comparisons that ignore case. */
export function foldForMatching(value: string): string {
  return foldAccents(value).toLowerCase();
}
