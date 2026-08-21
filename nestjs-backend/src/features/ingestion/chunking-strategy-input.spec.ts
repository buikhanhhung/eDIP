import { IMPLEMENTED_CHUNKING_STRATEGIES } from '@infrastructure/chunking/chunking.service';
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
   * The check is against what is implemented, not against the column's
   * vocabulary. All four ids happen to be implemented now, so this asserts the
   * agreement rather than a hard-coded list: were one removed or put behind a
   * flag, accepting it here would take the upload, queue it, and fail the job
   * on the user's document.
   */
  it('accepts exactly the strategies that have an implementation', () => {
    for (const id of IMPLEMENTED_CHUNKING_STRATEGIES) {
      expect(parseChunkingStrategy(id)).toBe(id);
    }
    expect(IMPLEMENTED_CHUNKING_STRATEGIES).toContain('SEMANTIC');
  });

  it('rejects a strategy id that was declared but never implemented', () => {
    // Reaches the same guard a stale value read back from the database would.
    expect(parseChunkingStrategy('NUMBERED_SECTION')).toBeNull();
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
