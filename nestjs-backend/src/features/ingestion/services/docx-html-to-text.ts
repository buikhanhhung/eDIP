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

/**
 * Lays the cells out on a grid, resolving spans.
 *
 * Markdown has no merged cell, so a span repeats its value in every slot it
 * covers. Repeating beats leaving the slots blank: a reader scanning the
 * column, and a query matching against it, both find the row they wanted. It
 * is also what the vision prompt asks the model to do, so a table reaches the
 * index in the same shape whichever path the document came in by.
 */
function toMarkdownTable(inner: string): string {
  const grid: string[][] = [];
  /** Values still descending from a rowspan, keyed by column. */
  const carried = new Map<number, { text: string; rowsLeft: number }>();
  let width = 0;

  for (const rowMatch of inner.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const row: string[] = [];

    const place = (text: string) => {
      while (carried.has(row.length)) {
        const carry = carried.get(row.length)!;
        row.push(carry.text);
        carry.rowsLeft -= 1;
        if (carry.rowsLeft <= 0) carried.delete(row.length - 1);
      }
      row.push(text);
    };

    for (const cellMatch of rowMatch[1].matchAll(/<(t[hd])([^>]*)>([\s\S]*?)<\/\1>/gi)) {
      // A newline inside a cell would break the row apart, and a literal pipe
      // would open a phantom column.
      const text = flattenProse(cellMatch[3]).replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim();
      const colspan = spanOf(cellMatch[2], 'colspan');
      const rowspan = spanOf(cellMatch[2], 'rowspan');

      for (let i = 0; i < colspan; i += 1) {
        const column = row.length;
        place(text);
        if (rowspan > 1) carried.set(column, { text, rowsLeft: rowspan - 1 });
      }
    }

    // Anything still descending past the last written cell belongs on the end.
    while (carried.has(row.length)) {
      const carry = carried.get(row.length)!;
      row.push(carry.text);
      carry.rowsLeft -= 1;
      if (carry.rowsLeft <= 0) carried.delete(row.length - 1);
    }

    if (row.length === 0) continue;
    grid.push(row);
    width = Math.max(width, row.length);
  }

  if (grid.length === 0) return '';

  // Ragged rows are padded so every line has the same number of pipes, which
  // is what makes a markdown table render as a table at all.
  const lines = grid.map(
    (row) => `| ${[...row, ...Array(width - row.length).fill('')].join(' | ')} |`,
  );
  lines.splice(1, 0, `| ${Array(width).fill('---').join(' | ')} |`);
  return lines.join('\n');
}

function spanOf(attributes: string, name: 'colspan' | 'rowspan'): number {
  const match = new RegExp(`\\b${name}="(\\d+)"`, 'i').exec(attributes);
  const value = match ? Number(match[1]) : 1;
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function decode(text: string): string {
  return text
    .replace(/&(amp|lt|gt|quot|apos|nbsp|#39);/g, (entity) => ENTITIES[entity] ?? entity)
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)));
}
