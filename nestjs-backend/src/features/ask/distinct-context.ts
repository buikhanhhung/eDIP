import type { ChunkHit } from '@infrastructure/vector-store/vector-store.service';

/**
 * Takes the highest-ranked hits whose text has not already been taken.
 *
 * The hierarchical strategies make this necessary. Every child of a section
 * shares one parent, and retrieval returns the parent in place of the child, so
 * a run of sibling children — which rank next to each other by construction,
 * being near-identical in vector space — arrives as the same passage several
 * times over. Handing the model one passage eight times costs eight times the
 * tokens to say the same thing, and crowds out the documents ranked below it.
 *
 * The first occurrence keeps its rank; later copies give up their slot to the
 * next distinct passage rather than shrinking the context.
 */
export function distinctByContent(hits: ChunkHit[], limit: number): ChunkHit[] {
  const seen = new Set<string>();
  const distinct: ChunkHit[] = [];

  for (const hit of hits) {
    if (seen.has(hit.content)) continue;
    seen.add(hit.content);
    distinct.push(hit);
    if (distinct.length === limit) break;
  }

  return distinct;
}
