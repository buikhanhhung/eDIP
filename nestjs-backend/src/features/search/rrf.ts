/**
 * Reciprocal Rank Fusion over ranked id lists.
 *
 * `K = 5`, not the canonical 60 that ECVBot uses. 60 is a calibration constant
 * for TREC-scale collections; this corpus is nine documents and roughly a dozen
 * chunks, so a `top 10` lane returns almost the whole corpus for any query. At
 * k=60 the gap between rank 1 and rank 9 is about 13% (0.01639 vs 0.01449)
 * while appearing in both lanes doubles a score — fusion stops measuring "how
 * well does this match" and starts measuring "how many lanes did it appear in",
 * which puts a document ranked last everywhere above one ranked first somewhere.
 * eDIP v1 hit this exact failure on the demo query `hợp đồng với Saigon Retail`
 * and had to add an entity weight to compensate. k=5 restores the gradient.
 */
export const RRF_K = 5;

/** Ties break on id so repeated runs order identically. */
export function fuseRanks(lists: string[][]): { id: string; score: number }[] {
  const scores = new Map<string, number>();

  for (const list of lists) {
    list.forEach((id, index) => {
      scores.set(id, (scores.get(id) ?? 0) + 1 / (RRF_K + index + 1));
    });
  }

  return Array.from(scores, ([id, score]) => ({ id, score })).sort(
    (a, b) => b.score - a.score || a.id.localeCompare(b.id),
  );
}
