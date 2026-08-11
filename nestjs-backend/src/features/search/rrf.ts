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

/**
 * Fuses ranked lists, most relevant first. Pass the lanes in priority order:
 * the first one settles ties.
 *
 * Exact ties are common here and not a corner case. `hợp đồng với Saigon
 * Retail` puts the MSA first by meaning and the Hanoi contract first by
 * keyword, which is a symmetric split and therefore an identical score — at
 * which point the previous tie-break, comparing document ids, decided the top
 * result of the demo query by an accident of UUID ordering. Ranking by the
 * leading lane instead is at least about the query: for natural language it is
 * the semantic lane that reads "với Saigon Retail" as a relation rather than
 * as three more tokens to count.
 *
 * Still fully deterministic — the id comparison remains as the last resort.
 */
export function fuseRanks(lists: string[][]): { id: string; score: number }[] {
  const scores = new Map<string, number>();
  const leadingRank = new Map<string, number>();

  lists.forEach((list, laneIndex) => {
    list.forEach((id, index) => {
      scores.set(id, (scores.get(id) ?? 0) + 1 / (RRF_K + index + 1));
      if (laneIndex === 0 && !leadingRank.has(id)) leadingRank.set(id, index);
    });
  });

  const rankIn = (id: string) => leadingRank.get(id) ?? Number.POSITIVE_INFINITY;

  return Array.from(scores, ([id, score]) => ({ id, score })).sort(
    (a, b) => b.score - a.score || rankIn(a.id) - rankIn(b.id) || a.id.localeCompare(b.id),
  );
}
