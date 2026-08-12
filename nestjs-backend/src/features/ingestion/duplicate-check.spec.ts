import { decideDuplicate, hashContent } from './duplicate-check';

const HASH = hashContent(Buffer.from('HỢP ĐỒNG DỊCH VỤ'));
const OTHER = hashContent(Buffer.from('HỢP ĐỒNG DỊCH VỤ (bản sửa)'));

const row = (overrides: Partial<Parameters<typeof decideDuplicate>[1][number]> = {}) => ({
  id: 'doc-1',
  filename: 'hop-dong.md',
  uploadedAt: new Date('2026-03-15T08:00:00.000Z'),
  contentHash: HASH,
  ...overrides,
});

describe('hashContent', () => {
  it('gives the same hash for the same bytes and a different one otherwise', () => {
    expect(hashContent(Buffer.from('abc'))).toBe(hashContent(Buffer.from('abc')));
    expect(hashContent(Buffer.from('abc'))).not.toBe(hashContent(Buffer.from('abd')));
  });
});

describe('decideDuplicate', () => {
  it('finds nothing when the library is empty', () => {
    expect(decideDuplicate(HASH, [])).toEqual({ identical: null, sameName: [] });
  });

  it('calls a byte-identical file a duplicate, whatever it is named', () => {
    const verdict = decideDuplicate(HASH, [row({ filename: 'ban-sao-hop-dong.md' })]);

    expect(verdict.identical?.id).toBe('doc-1');
    expect(verdict.identical?.filename).toBe('ban-sao-hop-dong.md');
  });

  it('treats the same name with different bytes as a version, not a duplicate', () => {
    // The contract came back signed. Refusing it would lose the revision.
    const verdict = decideDuplicate(OTHER, [row()]);

    expect(verdict.identical).toBeNull();
    expect(verdict.sameName).toHaveLength(1);
  });

  it('does not also list the duplicate as an earlier version', () => {
    // It would say the same thing twice, in two different tones.
    const verdict = decideDuplicate(HASH, [row()]);

    expect(verdict.identical).not.toBeNull();
    expect(verdict.sameName).toEqual([]);
  });

  it('ignores a row still waiting for its backfilled hash', () => {
    const verdict = decideDuplicate(HASH, [row({ contentHash: null })]);

    expect(verdict.identical).toBeNull();
    expect(verdict.sameName).toHaveLength(1);
  });

  it('reports every earlier version of the name', () => {
    const verdict = decideDuplicate(OTHER, [
      row({ id: 'doc-1' }),
      row({ id: 'doc-2', contentHash: 'something-else' }),
    ]);

    expect(verdict.sameName.map((match) => match.id)).toEqual(['doc-1', 'doc-2']);
  });

  it('does not leak the hash into what the caller sends back', () => {
    const verdict = decideDuplicate(HASH, [row()]);

    expect(verdict.identical).not.toHaveProperty('contentHash');
  });
});
