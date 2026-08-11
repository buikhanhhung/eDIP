import { normalizeEntityName } from './entity-normalizer';

/**
 * Decides what to do with a freshly extracted entity, given the two lookups the
 * caller has already performed. Pure and I/O-free, ported from ECVBot's
 * `dedupe-entities.ts` so the matrix can be tested without Postgres or Bedrock.
 *
 * Order matters:
 *
 *   1. Exact match on (normalised name, type) → reuse the node, add a mention.
 *   2. Name shorter than the gate → CREATE without consulting the vector index.
 *      Short names over-merge: "ECV" sits close to any three-letter acronym in
 *      embedding space, and a wrong merge silently fuses two real companies.
 *   3. Nearest neighbour of the same type above the similarity threshold →
 *      keep the existing node and fold the new spelling into its aliases.
 *   4. Otherwise → CREATE.
 *
 * Type equality is required before merging. Two entities can share a name and
 * be different things — `Atlas` the project and `Atlas` the company — and
 * merging them corrupts every edge attached to either.
 */

/** Below this many characters the vector index is not consulted. */
export const MIN_VECTOR_DEDUP_LENGTH = 4;

/** Cosine similarity, not distance. Tuned conservatively: a missed merge shows
 *  up as two nodes a human can join, a wrong merge is silent data loss. */
export const DEFAULT_DEDUP_THRESHOLD = 0.92;

export type DedupeAction = 'REUSE' | 'MERGE_AS_ALIAS' | 'CREATE';

export interface DedupePlan {
  action: DedupeAction;
  /** Set on REUSE and MERGE_AS_ALIAS. */
  matchedEntityId?: string;
  /** Recorded in logs so a surprising merge can be explained after the fact. */
  reason: string;
}

export interface DedupeCandidate {
  name: string;
  type: string;
}

export interface ExactMatch {
  entityId: string;
}

export interface VectorMatch {
  entityId: string;
  /** Cosine similarity in [0,1]; 1 is identical. */
  similarity: number;
  type: string;
}

export function decideDedupe(
  candidate: DedupeCandidate,
  exact: ExactMatch | null,
  vectorBest: VectorMatch | null,
  threshold: number = DEFAULT_DEDUP_THRESHOLD,
): DedupePlan {
  if (exact) {
    return { action: 'REUSE', matchedEntityId: exact.entityId, reason: 'exact-match' };
  }

  const normalized = normalizeEntityName(candidate.name);
  if (normalized.length < MIN_VECTOR_DEDUP_LENGTH) {
    return {
      action: 'CREATE',
      reason: `name-too-short (len=${normalized.length} < ${MIN_VECTOR_DEDUP_LENGTH})`,
    };
  }

  if (vectorBest && vectorBest.type === candidate.type) {
    if (vectorBest.similarity >= threshold) {
      return {
        action: 'MERGE_AS_ALIAS',
        matchedEntityId: vectorBest.entityId,
        reason: `vector-match (similarity=${vectorBest.similarity.toFixed(4)} >= ${threshold})`,
      };
    }
    return { action: 'CREATE', reason: 'vector-below-threshold' };
  }

  return { action: 'CREATE', reason: vectorBest ? 'vector-type-mismatch' : 'vector-no-match' };
}
