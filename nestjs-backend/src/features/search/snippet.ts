/**
 * Picks the passage of a document that actually matched the query.
 *
 * Deliberately not `ts_headline`. The `search_tsv` column is built from
 * accent-folded text and the query is folded to match it, but `ts_headline`
 * would run against the raw `textContent` and re-tokenise it itself — so the
 * folded token `hop` never matches `hợp` and it silently falls back to the
 * first `MinWords` of the document. Every result then shows the same opening
 * sentence, and the search looks like it is ignoring the query.
 *
 * Returns offsets into the original, accented string rather than HTML: the
 * client wraps the range in `<mark>` by slicing. Document text is
 * attacker-controlled content and the token lives where scripts can read it,
 * so no path here produces markup for `dangerouslySetInnerHTML`.
 */

import { foldForMatching } from '@common/text/fold-accents';

const RADIUS = 120;

export interface Snippet {
  text: string;
  /** Match range relative to `text`, or null when nothing matched. */
  matchStart: number | null;
  matchEnd: number | null;
}

export function buildSnippet(text: string, query: string): Snippet {
  if (!text) return { text: '', matchStart: null, matchEnd: null };

  const terms = foldForMatching(query)
    .split(/\s+/)
    .map((term) => term.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter((term) => term.length > 1);

  // Folding is 1:1 per character (diacritics are removed from the decomposed
  // form, never characters), so an index into the folded string addresses the
  // same position in the original.
  const folded = foldForMatching(text);
  const found = terms
    .map((term) => folded.indexOf(term))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b);

  if (found.length === 0) {
    const head = text.slice(0, RADIUS * 2).trim();
    return { text: head + (text.length > head.length ? '…' : ''), matchStart: null, matchEnd: null };
  }

  const hit = found[0];
  const termLength = terms.find((term) => folded.indexOf(term) === hit)?.length ?? 0;

  const start = Math.max(0, hit - RADIUS);
  const end = Math.min(text.length, hit + termLength + RADIUS);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';

  return {
    text: prefix + text.slice(start, end) + suffix,
    matchStart: hit - start + prefix.length,
    matchEnd: hit - start + prefix.length + termLength,
  };
}
