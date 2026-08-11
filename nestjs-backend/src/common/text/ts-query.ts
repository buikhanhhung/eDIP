import { foldForMatching } from './fold-accents';

/**
 * Builds an OR-joined tsquery string from a natural-language query.
 *
 * `plainto_tsquery` ANDs every term, which is wrong for a search box: the demo
 * query `hợp đồng với Saigon Retail` returned nothing, because no document
 * contains all of `hop`, `dong`, `voi`, `saigon` and `retail` — the filler word
 * alone was enough to empty the result set. Joining with `|` lets partial
 * matches through and leaves the ordering to `ts_rank`, which is what
 * distinguishes a document mentioning Saigon Retail from one that merely says
 * "hợp đồng".
 *
 * Terms are stripped to letters and digits before they reach `to_tsquery`,
 * which parses its input as an expression — an unescaped `!` or `&` would
 * otherwise be a syntax error rather than a search for that character.
 */
export function splitSearchTerms(query: string): string[] {
  const terms = foldForMatching(query)
    .split(/\s+/)
    .map((term) => term.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter((term) => term.length > 0);

  return [...new Set(terms)];
}

export function buildOrTsQuery(query: string): string {
  return splitSearchTerms(query).join(' | ');
}
