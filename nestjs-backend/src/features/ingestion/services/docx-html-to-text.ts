/**
 * Flattens mammoth's HTML into text, keeping tables as markdown tables.
 *
 * mammoth offers three outputs and none of them is this. `extractRawText`
 * walks text nodes only, so a table's cells run together with no column
 * boundary anywhere. `convertToMarkdown` looks like the answer but its writer
 * maps only p, br, lists, strong, em, a, img and headings — it has no table
 * branch either, so it loses columns the same way. Only `convertToHtml` keeps
 * the structure, which leaves converting it here.
 *
 * The input is not arbitrary HTML: mammoth emits a small, well-formed tag set,
 * so this handles that set rather than pretending to be a parser.
 *
 * Column spans are not expanded. A spanned cell contributes its text once, in
 * its first column, which keeps the row count honest even when the grid is not
 * rectangular.
 */

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
};

export function docxHtmlToText(html: string): string {
  const parts: string[] = [];
  const tablePattern = /<table\b[^>]*>([\s\S]*?)<\/table>/gi;

  let cursor = 0;
  for (const match of html.matchAll(tablePattern)) {
    const start = match.index ?? 0;
    parts.push(flattenProse(html.slice(cursor, start)));
    parts.push(toMarkdownTable(match[1]));
    cursor = start + match[0].length;
  }
  parts.push(flattenProse(html.slice(cursor)));

  return parts
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .join('\n\n');
}

/** Everything outside a table: block tags become breaks, the rest is dropped. */
function flattenProse(html: string): string {
  return decode(
    html
      .replace(/<br\s*\/?>/gi, '\n')
      // Alt text survives the tag it rode in on: the docx reader puts a
      // placeholder there and swaps in the image's reading afterwards, so
      // dropping it would leave every embedded picture unaccounted for.
      .replace(/<img\b[^>]*\balt="([^"]*)"[^>]*>/gi, '$1')
      .replace(/<\/(p|div|li|h[1-6]|dd|dt)>/gi, '\n\n')
      .replace(/<li\b[^>]*>/gi, '- ')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n');
}

function toMarkdownTable(inner: string): string {
  const rows: string[][] = [];
  let headerWidth = 0;

  for (const rowMatch of inner.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells: string[] = [];
    for (const cellMatch of rowMatch[1].matchAll(/<(t[hd])\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
      // A newline inside a cell would break the row apart, so the cell is
      // flattened to one line; a literal pipe would open a phantom column.
      cells.push(flattenProse(cellMatch[2]).replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim());
    }
    if (cells.length === 0) continue;
    rows.push(cells);
    headerWidth = Math.max(headerWidth, cells.length);
  }

  if (rows.length === 0) return '';

  // Ragged rows are padded so every line has the same number of pipes, which
  // is what makes a markdown table render as a table at all.
  const lines = rows.map(
    (cells) =>
      `| ${[...cells, ...Array(headerWidth - cells.length).fill('')].join(' | ')} |`,
  );
  lines.splice(1, 0, `| ${Array(headerWidth).fill('---').join(' | ')} |`);
  return lines.join('\n');
}

function decode(text: string): string {
  return text
    .replace(/&(amp|lt|gt|quot|apos|nbsp|#39);/g, (entity) => ENTITIES[entity] ?? entity)
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)));
}
