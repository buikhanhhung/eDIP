/**
 * multer hands back `originalname` as the raw `Content-Disposition` bytes
 * decoded as latin1, so a UTF-8 Vietnamese filename arrives as mojibake:
 * "Kỹ năng.txt" becomes "Ká»¹ nÄng.txt". Re-reading those bytes as UTF-8
 * restores the original.
 *
 * A name that was *already* correct would be mangled by that round trip, so
 * the re-decode is only accepted when it produces valid UTF-8 — an incorrect
 * re-decode almost always yields replacement characters, and the original is
 * kept instead.
 */
export function decodeMultipartFilename(raw: string): string {
  const reread = Buffer.from(raw, 'latin1').toString('utf8');
  return reread.includes('�') ? raw : reread;
}
