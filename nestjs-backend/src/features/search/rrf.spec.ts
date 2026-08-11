import { fuseRanks, RRF_K } from './rrf';

describe('fuseRanks', () => {
  it('is pinned at k=5, the value chosen for this corpus size', () => {
    expect(RRF_K).toBe(5);
  });

  it('ranks a single lane by position', () => {
    const fused = fuseRanks([['a', 'b', 'c']]);
    expect(fused.map((entry) => entry.id)).toEqual(['a', 'b', 'c']);
  });

  it('rewards agreement between lanes', () => {
    const fused = fuseRanks([
      ['a', 'b'],
      ['b', 'z'],
    ]);
    const scores = new Map(fused.map((entry) => [entry.id, entry.score]));
    expect(scores.get('b')!).toBeGreaterThan(scores.get('z')!);
  });

  it('keeps a steep gradient within one lane, which is why k is 5 and not 60', () => {
    // The k=60 failure mode: rank 1 scores only ~13% above rank 9
    // (1/61 vs 1/69), so two weak lane placements outweigh one strong one and
    // fusion measures lane count instead of match quality. At k=5 rank 1 is
    // worth more than twice rank 9, so a strong match keeps its lead.
    const lane = Array.from({ length: 9 }, (_, i) => `doc-${i}`);
    const scores = new Map(fuseRanks([lane]).map((entry) => [entry.id, entry.score]));

    const ratioAtK5 = scores.get('doc-0')! / scores.get('doc-8')!;
    const ratioAtK60 = 1 / 61 / (1 / 69);

    expect(ratioAtK5).toBeGreaterThan(2);
    expect(ratioAtK5).toBeGreaterThan(ratioAtK60 * 2);
  });

  it('ignores empty lanes', () => {
    expect(fuseRanks([[], ['a']]).map((entry) => entry.id)).toEqual(['a']);
    expect(fuseRanks([[], []])).toEqual([]);
  });

  it('orders deterministically when scores tie', () => {
    const first = fuseRanks([['b', 'a']]);
    const second = fuseRanks([['b', 'a']]);
    expect(first).toEqual(second);
  });

  it('breaks an exact tie on the leading lane, not on the id', () => {
    // The real case: the semantic lane leads with the MSA, the keyword lane
    // leads with a different contract, the scores land identical. Comparing
    // ids would hand the demo query's top result to whichever UUID sorts
    // lower.
    const msa = 'zzz-msa-saigon-retail';
    const other = 'aaa-hop-dong-hanoi';

    const fused = fuseRanks([
      [msa, other],
      [other, msa],
    ]);

    expect(fused[0].score).toBeCloseTo(fused[1].score, 10);
    expect(fused[0].id).toBe(msa);
  });

  it('puts a document missing from the leading lane last among equals', () => {
    const fused = fuseRanks([
      ['a'],
      ['b', 'a'],
    ]);
    const onlyKeyword = fused.find((entry) => entry.id === 'b')!;
    const both = fused.find((entry) => entry.id === 'a')!;
    expect(both.score).toBeGreaterThan(onlyKeyword.score);
  });
});
