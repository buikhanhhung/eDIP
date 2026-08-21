import { DEFAULT_CHUNKING_STRATEGY } from '@infrastructure/chunking/chunking.types';
import { parseChunkingStrategy } from './chunking-strategy-input';

describe('parseChunkingStrategy', () => {
  it('falls back to the default when the uploader expressed no preference', () => {
    expect(parseChunkingStrategy(undefined)).toBe(DEFAULT_CHUNKING_STRATEGY);
    expect(parseChunkingStrategy(null)).toBe(DEFAULT_CHUNKING_STRATEGY);
    // Multipart has no null: an untouched field arrives as the empty string.
    expect(parseChunkingStrategy('')).toBe(DEFAULT_CHUNKING_STRATEGY);
  });

  it('accepts a strategy that is implemented', () => {
    expect(parseChunkingStrategy('RECURSIVE_CHARACTER')).toBe('RECURSIVE_CHARACTER');
  });

  it('rejects a value that is not a strategy at all', () => {
    expect(parseChunkingStrategy('KHONG_TON_TAI')).toBeNull();
  });

  /**
   * The four ids are the column's vocabulary; only some of them have an
   * implementation at any given time. Accepting a listed-but-unimplemented one
   * would take the upload, queue it, and fail the job on the user's document —
   * a rejection at the door is the honest answer.
   */
  it('rejects a listed strategy that has no implementation yet', () => {
    expect(parseChunkingStrategy('SEMANTIC')).toBeNull();
  });

  it('rejects values that are not strings', () => {
    expect(parseChunkingStrategy(7)).toBeNull();
    expect(parseChunkingStrategy(['RECURSIVE_CHARACTER'])).toBeNull();
    expect(parseChunkingStrategy({})).toBeNull();
  });

  it('does not accept a differently-cased spelling', () => {
    // The value is stored verbatim and shown as the UI label, so casing is
    // part of the identity rather than a formatting detail.
    expect(parseChunkingStrategy('recursive_character')).toBeNull();
  });
});
