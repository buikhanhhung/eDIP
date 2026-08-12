import { decodeMultipartFilename } from './decode-multipart-filename';

describe('decodeMultipartFilename', () => {
  it('restores a Vietnamese name that arrived as latin1-decoded UTF-8', () => {
    // Taken from a real upload: these are the UTF-8 bytes of the name below,
    // each byte read as one latin1 code point.
    const asMulterSawIt = Buffer.from('Kỹ năng đọc và xử lý lỗi.txt', 'utf8').toString('latin1');

    expect(decodeMultipartFilename(asMulterSawIt)).toBe('Kỹ năng đọc và xử lý lỗi.txt');
  });

  it('leaves an ASCII name alone', () => {
    expect(decodeMultipartFilename('report-q1-2026.md')).toBe('report-q1-2026.md');
  });

  it('leaves a name that is already correct alone', () => {
    // Re-decoding this one would destroy it, so the invalid-UTF-8 guard has to
    // catch it rather than the transform being applied blindly.
    expect(decodeMultipartFilename('Kỹ năng.txt')).toBe('Kỹ năng.txt');
  });
});
