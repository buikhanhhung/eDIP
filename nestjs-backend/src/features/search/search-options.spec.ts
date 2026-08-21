import { resolveSearchOptions, SEARCH_DEFAULTS, SEARCH_LIMITS } from './search-options';

describe('resolveSearchOptions', () => {
  it('reproduces the previous behaviour when nothing is supplied', () => {
    // The guarantee that matters: a request from before options existed must
    // still get exactly what it got then.
    expect(resolveSearchOptions()).toEqual(SEARCH_DEFAULTS);
    expect(resolveSearchOptions({})).toEqual(SEARCH_DEFAULTS);
  });

  it('keeps a value that is inside its bounds', () => {
    const resolved = resolveSearchOptions({ resultLimit: 25, laneLimit: 30, snippetRadius: 200 });

    expect(resolved.resultLimit).toBe(25);
    expect(resolved.laneLimit).toBe(30);
    expect(resolved.snippetRadius).toBe(200);
  });

  it('clamps rather than rejects, at both ends', () => {
    const high = resolveSearchOptions({ resultLimit: 5000, laneLimit: 5000, snippetRadius: 9999 });
    expect(high.resultLimit).toBe(SEARCH_LIMITS.resultLimit.max);
    expect(high.laneLimit).toBe(SEARCH_LIMITS.laneLimit.max);
    expect(high.snippetRadius).toBe(SEARCH_LIMITS.snippetRadius.max);

    const low = resolveSearchOptions({ resultLimit: 0, laneLimit: -4, snippetRadius: 1 });
    expect(low.resultLimit).toBe(SEARCH_LIMITS.resultLimit.min);
    expect(low.laneLimit).toBe(SEARCH_LIMITS.laneLimit.min);
    expect(low.snippetRadius).toBe(SEARCH_LIMITS.snippetRadius.min);
  });

  it('rounds a fractional number instead of passing it to a query', () => {
    // `LIMIT 10.5` is a Postgres error, and the raw value reaches a LIMIT.
    expect(resolveSearchOptions({ resultLimit: 10.5 }).resultLimit).toBe(11);
  });

  it('falls back to the default for anything that is not a usable number', () => {
    const junk = resolveSearchOptions({
      resultLimit: Number.NaN,
      laneLimit: 'many' as unknown as number,
      snippetRadius: null as unknown as number,
    });

    expect(junk).toEqual(SEARCH_DEFAULTS);
  });

  it('accepts a single lane and ignores an unknown one', () => {
    expect(resolveSearchOptions({ lanes: 'vector' }).lanes).toBe('vector');
    expect(resolveSearchOptions({ lanes: 'lexical' }).lanes).toBe('lexical');
    expect(resolveSearchOptions({ lanes: 'psychic' as unknown as 'both' }).lanes).toBe('both');
  });
});
