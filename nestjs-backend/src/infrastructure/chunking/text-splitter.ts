/**
 * Paragraph-aware splitter, ~20 lines instead of a parser module.
 *
 * ECVBot's content-parser was measured before being rejected: 15 files, 1249
 * LOC, and the one strategy that would apply here splits on ATX markdown
 * headers. The corpus contains none — its headings look like `1. MỤC ĐÍCH` —
 * so that strategy degenerates to splitting on blank lines, which is exactly
 * what this does without the `cheerio` dependency.
 */

export function splitText(text: string, size = 1000, overlap = 100): string[] {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);

  const chunks: string[] = [];
  let current = '';

  for (const paragraph of paragraphs) {
    if (current.length > 0 && current.length + paragraph.length + 2 > size) {
      chunks.push(current);
      // Carry the tail of the previous chunk so a sentence spanning the cut is
      // still retrievable from one of the two pieces.
      current = overlap > 0 ? `${current.slice(-overlap)}\n\n${paragraph}` : paragraph;
    } else {
      current = current.length > 0 ? `${current}\n\n${paragraph}` : paragraph;
    }
  }

  if (current.trim().length > 0) chunks.push(current);

  // A single paragraph longer than `size` is left whole rather than cut
  // mid-word: at this corpus size one oversized chunk costs nothing, and a
  // hard character cut would break Vietnamese words across the boundary.
  return chunks;
}
