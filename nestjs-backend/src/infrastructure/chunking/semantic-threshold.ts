export interface ChunkShape {
  /** Chunk size to aim for, in characters. */
  targetChars: number;
  /** A chunk is never closed below this, except the document's last. */
  minChars: number;
}

export interface ThresholdTarget extends ChunkShape {
  maxIterations?: number;
  /** Search stops once the bracket is narrower than this. */
  step?: number;
}

/**
 * Indices after which a chunk may end: the boundaries whose neighbouring
 * sentences are less alike than the threshold. Exclusive, so a similarity
 * exactly equal to the threshold does not cut.
 */
export function cutPoints(similarities: number[], threshold: number): number[] {
  const cuts: number[] = [];
  for (let i = 0; i < similarities.length; i++) {
    if (similarities[i] < threshold) cuts.push(i);
  }
  return cuts;
}

/**
 * How many sentences each chunk holds, for one threshold.
 *
 * The single place the grouping rule lives, used both to score candidate
 * thresholds and to cut for real. If the two ever differed, the threshold
 * chosen would describe chunks nobody produced.
 *
 * The threshold only proposes *where a chunk may end*; this decides which of
 * those places it does end. Both bounds are needed and each was learned the
 * hard way:
 *
 *  - Without a floor, real similarity runs produce chunks of one or two
 *    sentences — a fixed threshold on measured data cut twelve of fifteen
 *    boundaries.
 *  - Without a ceiling, absorbing every under-floor group into its predecessor
 *    never closes it, and a thousand-sentence document comes back as a single
 *    sixty-four-thousand-character chunk. That is not a hypothetical: it was
 *    measured on the first version of this function.
 */
export function groupSizes(
  similarities: number[],
  sentenceSizes: number[],
  threshold: number,
  shape: ChunkShape,
): number[] {
  const cuts = new Set(cutPoints(similarities, threshold));

  // The runs the threshold proposes, before any are joined.
  const runs: number[] = [];
  let run = 1;
  for (let i = 0; i < similarities.length; i++) {
    if (cuts.has(i)) {
      runs.push(run);
      run = 1;
    } else {
      run += 1;
    }
  }
  runs.push(run);

  const groups: number[] = [];
  let offset = 0;
  let count = 0;
  let chars = 0;

  const charsOf = (from: number, length: number) =>
    sentenceSizes.slice(from, from + length).reduce((sum, size) => sum + size, 0);

  for (const length of runs) {
    const runChars = charsOf(offset, length);

    if (count === 0) {
      count = length;
      chars = runChars;
      offset += length;
      continue;
    }

    // Below the floor it has to keep taking, whatever that does to the size.
    // Above it, take only while there is room before the target.
    if (chars < shape.minChars || chars + runChars <= shape.targetChars) {
      count += length;
      chars += runChars;
    } else {
      groups.push(count);
      count = length;
      chars = runChars;
    }
    offset += length;
  }

  if (count > 0) groups.push(count);

  // The last chunk is the one that cannot grow, so it is the one allowed to be
  // short — unless there is a chunk before it to join.
  if (groups.length > 1) {
    const lastStart = sentenceSizes.length - groups[groups.length - 1];
    if (charsOf(lastStart, groups[groups.length - 1]) < shape.minChars) {
      groups[groups.length - 2] += groups.pop() as number;
    }
  }

  return groups;
}

/**
 * Picks the similarity threshold for one document, from that document's own
 * distribution.
 *
 * A fixed threshold cannot work here, and this is measured rather than assumed:
 * on real Vietnamese contract text the adjacent-sentence similarities ran 0.568
 * to 0.836, so a constant 0.75 cut twelve of fifteen boundaries and the result
 * was indistinguishable from cutting every two sentences. The genuine topic
 * change scored 0.587 while a same-topic pair scored 0.568, so no constant
 * separates them — only the shape of this document's numbers does.
 *
 * The bracket spans the similarities themselves rather than `median ± std`,
 * which excluded the best threshold on every distribution measured.
 */
export function chooseThreshold(
  similarities: number[],
  sentenceSizes: number[],
  target: ThresholdTarget,
): number {
  if (similarities.length === 0) return 0;

  const sorted = [...similarities].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];

  const step = target.step ?? 0.01;
  const maxIterations = target.maxIterations ?? 50;

  const totalChars = sentenceSizes.reduce((sum, size) => sum + size, 0);
  const idealChars = Math.min(target.targetChars, totalChars);

  const penalty = (threshold: number): number => {
    const groups = groupSizes(similarities, sentenceSizes, threshold, target);

    let offset = 0;
    let total = 0;
    for (const count of groups) {
      const chars = sentenceSizes.slice(offset, offset + count).reduce((sum, s) => sum + s, 0);
      total += Math.abs(chars - idealChars);
      offset += count;
    }
    return total;
  };

  // Candidates drawn from the distribution: a threshold between two observed
  // similarities cuts exactly the same boundaries as the lower of them, so
  // there is nothing between them worth evaluating.
  let best = median;
  let bestPenalty = penalty(best);

  const candidates = [...new Set(sorted)];
  const stride = Math.max(1, Math.ceil(candidates.length / maxIterations));

  for (let i = 0; i < candidates.length; i += stride) {
    // Just above an observed value, so that value itself becomes a cut.
    const candidate = candidates[i] + step / 2;
    const score = penalty(candidate);
    if (score < bestPenalty) {
      bestPenalty = score;
      best = candidate;
    }
  }

  return best;
}
