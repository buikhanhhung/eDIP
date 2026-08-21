import { distinctByContent } from './distinct-context';

const hit = (id: string, content: string) => ({ id, documentId: 'doc-1', content });

describe('distinctByContent', () => {
  it('collapses repeated passages to the first one seen', () => {
    const kept = distinctByContent(
      [hit('1', 'đoạn cha'), hit('2', 'đoạn cha'), hit('3', 'đoạn khác')],
      8,
    );

    expect(kept.map((h) => h.id)).toEqual(['1', '3']);
  });

  it('gives a duplicate slot away instead of shrinking the context', () => {
    // Four hits, two of them the same passage, room for three: the point is
    // that the third distinct passage gets in rather than the context ending
    // one short.
    const kept = distinctByContent([hit('1', 'A'), hit('2', 'A'), hit('3', 'B'), hit('4', 'C')], 3);

    expect(kept.map((h) => h.id)).toEqual(['1', '3', '4']);
  });

  it('stops at the limit', () => {
    const kept = distinctByContent([hit('1', 'A'), hit('2', 'B'), hit('3', 'C')], 2);

    expect(kept).toHaveLength(2);
  });

  it('keeps passages that merely resemble each other', () => {
    const kept = distinctByContent(
      [hit('1', 'Điều 1. Thanh toán'), hit('2', 'Điều 2. Thanh toán')],
      8,
    );

    expect(kept).toHaveLength(2);
  });

  it('handles an empty result set', () => {
    expect(distinctByContent([], 8)).toEqual([]);
  });
});
