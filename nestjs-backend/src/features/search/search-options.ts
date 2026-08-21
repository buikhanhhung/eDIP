/**
 * Per-query search options.
 *
 * Sent with a request rather than stored: these are knobs someone turns while
 * looking at results, and a value that only makes sense for one question has no
 * business outliving it.
 *
 * Every field is optional and every default reproduces the behaviour the
 * endpoint had before options existed — a request that sends none must be
 * byte-identical to one from before.
 *
 * Two knobs are deliberately absent. `RRF_K` carries a measured reason in
 * `rrf.ts` (at k=60 the gap between rank 1 and rank 9 collapses to about 13%,
 * which is what forced an entity weight before), and there is no retrieval
 * quality measure in this project to tell whether changing it helped. Exposing
 * it would invite silently worse ranking. `CONTEXT_CHUNKS` belongs to /ask and
 * governs prompt size, which the hierarchical chunking strategies already
 * inflate.
 */
export interface SearchOptions {
  /** Results returned after the two lanes are fused. */
  resultLimit: number;
  /** How many hits each lane contributes before fusion. */
  laneLimit: number;
  /** Characters either side of the matched term in a snippet. */
  snippetRadius: number;
  /** Which lanes run. Both is the default and the only fused case. */
  lanes: 'both' | 'vector' | 'lexical';
}

export const SEARCH_DEFAULTS: SearchOptions = {
  resultLimit: 10,
  laneLimit: 10,
  snippetRadius: 120,
  lanes: 'both',
};

/**
 * Bounds, not preferences.
 *
 * The upper ends exist because each one costs something real: a wider lane is a
 * larger pgvector scan, more results is a larger `IN` list and more snippets to
 * build, and a wider snippet is more text on the wire per hit. The lower ends
 * exist because zero of anything makes an endpoint that answers nothing look
 * broken rather than configured.
 */
export const SEARCH_LIMITS = {
  resultLimit: { min: 1, max: 50 },
  laneLimit: { min: 1, max: 50 },
  snippetRadius: { min: 40, max: 400 },
} as const;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.round(value)));

/**
 * Fills in the defaults and clamps what was supplied.
 *
 * Clamped rather than rejected: an out-of-range number is a caller asking for
 * more than the server will give, and answering with the most it will give is
 * more useful than a 400 for a knob. A value that is not a number at all falls
 * back to the default, since there is nothing to clamp.
 */
export function resolveSearchOptions(input: Partial<SearchOptions> = {}): SearchOptions {
  const number = (value: unknown, fallback: number, bounds: { min: number; max: number }) =>
    typeof value === 'number' && Number.isFinite(value)
      ? clamp(value, bounds.min, bounds.max)
      : fallback;

  return {
    resultLimit: number(input.resultLimit, SEARCH_DEFAULTS.resultLimit, SEARCH_LIMITS.resultLimit),
    laneLimit: number(input.laneLimit, SEARCH_DEFAULTS.laneLimit, SEARCH_LIMITS.laneLimit),
    snippetRadius: number(
      input.snippetRadius,
      SEARCH_DEFAULTS.snippetRadius,
      SEARCH_LIMITS.snippetRadius,
    ),
    lanes:
      input.lanes === 'vector' || input.lanes === 'lexical' ? input.lanes : SEARCH_DEFAULTS.lanes,
  };
}
