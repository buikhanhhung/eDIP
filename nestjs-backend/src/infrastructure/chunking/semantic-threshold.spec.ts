import { chooseThreshold, cutPoints, groupSizes } from './semantic-threshold';

/**
 * The measured reason this module exists: on real Vietnamese contract sentences
 * Gemini's adjacent similarities ran 0.568 to 0.836, so a fixed 0.75 cut twelve
 * of fifteen boundaries. Worse, the genuine topic change scored 0.587 while a
 * same-topic pair scored 0.568 — no constant separates them.
 *
 * The eighth value is that real payment-to-warranty boundary.
 */
const MEASURED = [
  0.686, 0.59, 0.738, 0.568, 0.756, 0.572, 0.618, 0.587, 0.68, 0.758, 0.655, 0.836, 0.693, 0.709,
  0.696,
];

const SHAPE = { targetChars: 1000, minChars: 200 };

/** Deterministic resampling, so a failure is reproducible. */
function resample(count: number, seed = 7): number[] {
  let state = seed;
  const next = () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
  return Array.from({ length: count }, () => MEASURED[Math.floor(next() * MEASURED.length)]);
}

const uniform = (count: number, size: number) => Array.from({ length: count }, () => size);

/** Chunk sizes in characters, for equal-sized sentences. */
function chunkChars(similarities: number[], size: number, threshold: number): number[] {
  const sizes = uniform(similarities.length + 1, size);
  return groupSizes(similarities, sizes, threshold, SHAPE).map((count) => count * size);
}

describe('cutPoints', () => {
  it('cuts exactly where similarity falls below the threshold', () => {
    expect(cutPoints([0.9, 0.4, 0.9], 0.75)).toEqual([1]);
    expect(cutPoints([0.9, 0.4, 0.3], 0.75)).toEqual([1, 2]);
    expect(cutPoints([0.9, 0.8], 0.75)).toEqual([]);
  });

  it('treats the threshold as exclusive, so an exact match does not cut', () => {
    expect(cutPoints([0.75], 0.75)).toEqual([]);
  });
});

describe('groupSizes', () => {
  it('joins a run under the floor to its neighbour', () => {
    // The middle sentence is far too short to stand alone, and the third would
    // push past the target — so the short one goes with the first, and the
    // third starts a chunk of its own.
    expect(groupSizes([0.2, 0.2], [900, 50, 900], 0.5, SHAPE)).toEqual([2, 1]);
  });

  it('grows a chunk while there is room before the target', () => {
    // Same three cuts, but the whole document fits one chunk, so it gets one.
    expect(groupSizes([0.2, 0.2], [300, 50, 300], 0.5, SHAPE)).toEqual([3]);
  });

  it('closes a chunk once it would pass the target, rather than growing forever', () => {
    // Every boundary is a candidate cut and every run is one short sentence, so
    // nothing but the ceiling can stop the accumulation. Without one, this
    // returned a single chunk of the whole document.
    const sizes = uniform(1000, 64);
    const groups = groupSizes(uniform(999, 0.5), sizes, 0.9, SHAPE);
    const chars = groups.map((count) => count * 64);

    expect(groups.length).toBeGreaterThan(50);
    expect(Math.max(...chars)).toBeLessThanOrEqual(SHAPE.targetChars);
  });

  it('never leaves a chunk under the floor when a neighbour could absorb it', () => {
    for (const count of [20, 80, 320]) {
      const chars = chunkChars(resample(count - 1), 64, 0.75);
      expect(Math.min(...chars)).toBeGreaterThanOrEqual(SHAPE.minChars);
    }
  });

  it('keeps every sentence exactly once', () => {
    for (const count of [5, 33, 120]) {
      const groups = groupSizes(resample(count - 1), uniform(count, 70), 0.7, SHAPE);
      expect(groups.reduce((sum, size) => sum + size, 0)).toBe(count);
      expect(groups.every((size) => size > 0)).toBe(true);
    }
  });

  it('leaves a document smaller than one chunk alone', () => {
    expect(groupSizes(uniform(9, 0.5), uniform(10, 64), 0.9, SHAPE)).toEqual([10]);
  });
});

/**
 * These are the tests that justify the search, so they carry bounds on both
 * sides: too few chunks means the document was swallowed whole, too many means
 * it was shattered. An earlier version of this block asserted only an upper
 * bound on the count and a lower bound on the size, and passed while a
 * thousand-sentence document came back as one chunk.
 *
 * The similarities are resampled from the measured set with no synthetic
 * separators mixed in — a low value planted between sections would be doing the
 * work that the real distribution has to do.
 */
describe('chooseThreshold on the measured distribution', () => {
  it('cuts a long document into chunks near the target, from both sides', () => {
    const similarities = resample(319);
    const sizes = uniform(320, 64);
    const documentChars = 320 * 64;

    const threshold = chooseThreshold(similarities, sizes, SHAPE);
    const chars = groupSizes(similarities, sizes, threshold, SHAPE).map((count) => count * 64);

    const ideal = documentChars / SHAPE.targetChars;
    // Neither swallowed whole nor shattered: within a factor of two of ideal.
    expect(chars.length).toBeGreaterThan(ideal / 2);
    expect(chars.length).toBeLessThan(ideal * 2);
    // And no chunk may exceed the target it was aiming at.
    expect(Math.max(...chars)).toBeLessThanOrEqual(SHAPE.targetChars);
    expect(Math.min(...chars)).toBeGreaterThanOrEqual(SHAPE.minChars);
  });

  it('produces more chunks as the document grows', () => {
    const counts = [40, 160, 640].map((sentences) => {
      const similarities = resample(sentences - 1);
      const sizes = uniform(sentences, 64);
      const threshold = chooseThreshold(similarities, sizes, SHAPE);
      return groupSizes(similarities, sizes, threshold, SHAPE).length;
    });

    expect(counts[0]).toBeLessThan(counts[1]);
    expect(counts[1]).toBeLessThan(counts[2]);
  });

  it('beats the document median it starts from', () => {
    // The whole point of searching rather than taking the median: on the
    // measured numbers the median leaves chunks far from the target.
    const similarities = resample(319);
    const sizes = uniform(320, 64);
    const sorted = [...similarities].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];

    const distance = (threshold: number) => {
      const groups = groupSizes(similarities, sizes, threshold, SHAPE);
      return groups.reduce((sum, count) => sum + Math.abs(count * 64 - SHAPE.targetChars), 0);
    };

    expect(distance(chooseThreshold(similarities, sizes, SHAPE))).toBeLessThan(distance(median));
  });

  it('cuts nothing when every sentence resembles its neighbour', () => {
    const similarities = uniform(5, 1);

    expect(cutPoints(similarities, chooseThreshold(similarities, uniform(6, 100), SHAPE))).toEqual(
      [],
    );
  });

  it('stays inside the distribution it was handed', () => {
    // Nothing here is near 0.75, so a threshold from that neighbourhood would
    // cut at every boundary.
    const similarities = [0.2, 0.25, 0.3, 0.22];

    expect(chooseThreshold(similarities, uniform(5, 400), SHAPE)).toBeLessThan(0.5);
  });

  it('is defined for a single boundary and for none', () => {
    expect(Number.isFinite(chooseThreshold([0.4], [100, 100], SHAPE))).toBe(true);
    expect(chooseThreshold([], [100], SHAPE)).toBe(0);
  });
});
