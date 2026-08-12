export interface TextItem {
  str: string;
  x: number;
  y: number;
  /** Advance width of the run, used to find a table's right edge. */
  width: number;
  fontSize: number;
}

/**
 * Rebuilds a page's text from positioned items, turning grids into markdown
 * tables.
 *
 * `extractText` already keeps rows intact — pdfjs groups items by baseline —
 * but it joins the cells with spaces, so "Phí triển khai 1 120.000.000 VNĐ"
 * gives no way to tell where the item name ends and the quantity begins. The
 * x coordinates do, and they cost nothing to read.
 *
 * The detector is deliberately reluctant, and it was measured before it was
 * trusted. A first version asked only that consecutive lines share two column
 * starts; on a multi-column print layout — a cheat sheet laid out in four
 * panels — that matched, and turned readable text into a ten-column grid with
 * the panels interleaved. Worse than the plain text it replaced.
 *
 * So a run now qualifies only when every line carries the *same number* of
 * cells and every cell sits under the same column start. Panel layouts fail
 * that immediately, because their lines hold whatever happened to wrap there.
 * A real table missed this way costs nothing: the caller keeps the plain text,
 * which already preserves rows.
 */

/** Same line when baselines differ by less than this share of the font size. */
const ROW_TOLERANCE = 0.5;
/** Same column when starts differ by less than this share of the font size. */
const COLUMN_TOLERANCE = 1.5;
/** Fewer rows than this is a coincidence, not a table. */
const MIN_TABLE_ROWS = 2;
/** A single column is a list; a table needs at least two. */
const MIN_TABLE_COLUMNS = 2;

interface Line {
  y: number;
  fontSize: number;
  cells: { x: number; width: number; text: string }[];
}

/** Where a table sits on the page, in PDF user space with y from the bottom. */
export interface TableRegion {
  left: number;
  right: number;
  top: number;
  bottom: number;
  /** Which block this table occupies, so a better rendering can replace it. */
  blockIndex: number;
}

export interface PageText {
  /** Text blocks in reading order; a table occupies exactly one of them. */
  blocks: string[];
  tables: TableRegion[];
  /** Share of the page's lines that landed inside a table, 0 to 1. */
  tableCoverage: number;
}

/**
 * Pages below this are prose that happens to contain an aligned pair or two,
 * and pdfjs renders prose better than this does — it recovers reading order
 * across a multi-panel layout, where a naive top-to-bottom sweep reads across
 * the panels and interleaves them.
 */
export const TABULAR_PAGE_COVERAGE = 0.5;

export function pageItemsToText(items: TextItem[]): PageText {
  const lines = groupIntoLines(items);
  if (lines.length === 0) return { blocks: [], tables: [], tableCoverage: 0 };

  const blocks: string[] = [];
  const tables: TableRegion[] = [];
  let tableLines = 0;
  let index = 0;

  while (index < lines.length) {
    const run = tableRunAt(lines, index);
    if (run) {
      const rows = lines.slice(index, index + run);
      tables.push({ ...boundsOf(rows), blockIndex: blocks.length });
      blocks.push(renderTable(rows));
      tableLines += run;
      index += run;
      continue;
    }
    blocks.push(lines[index].cells.map((cell) => cell.text).join(' '));
    index += 1;
  }

  return { blocks, tables, tableCoverage: tableLines / lines.length };
}

/** Text sits inside its ruled box, so the edges push out to catch the rules. */
function boundsOf(rows: Line[]): Omit<TableRegion, 'blockIndex'> {
  const pad = Math.max(...rows.map((row) => row.fontSize));
  const cells = rows.flatMap((row) => row.cells);

  return {
    left: Math.min(...cells.map((cell) => cell.x)) - pad,
    right: Math.max(...cells.map((cell) => cell.x + cell.width)) + pad,
    top: Math.max(...rows.map((row) => row.y)) + pad * 1.5,
    bottom: Math.min(...rows.map((row) => row.y)) - pad,
  };
}

/** PDF y grows upward, so a page reads from the largest y down. */
function groupIntoLines(items: TextItem[]): Line[] {
  const meaningful = items.filter((item) => item.str.trim().length > 0);
  const sorted = [...meaningful].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: Line[] = [];

  for (const item of sorted) {
    const fontSize = item.fontSize || 12;
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.y - item.y) <= fontSize * ROW_TOLERANCE) {
      last.cells.push({ x: item.x, width: item.width, text: item.str.trim() });
      continue;
    }
    lines.push({
      y: item.y,
      fontSize,
      cells: [{ x: item.x, width: item.width, text: item.str.trim() }],
    });
  }

  for (const line of lines) line.cells.sort((a, b) => a.x - b.x);
  return lines;
}

/** How many lines from `start` form a table, or null when they do not. */
function tableRunAt(lines: Line[], start: number): number | null {
  const first = lines[start];
  if (first.cells.length < MIN_TABLE_COLUMNS) return null;

  let end = start + 1;
  while (end < lines.length && alignsWith(first, lines[end])) end += 1;

  return end - start >= MIN_TABLE_ROWS ? end - start : null;
}

/**
 * Same shape, not merely overlapping: identical cell count, each one under the
 * column start above it. Two panels of prose can share an x or two by
 * coincidence; they do not agree on every cell of every line.
 */
function alignsWith(a: Line, b: Line): boolean {
  if (b.cells.length !== a.cells.length) return false;

  const tolerance = Math.max(a.fontSize, b.fontSize) * COLUMN_TOLERANCE;
  return a.cells.every((cell, index) => Math.abs(b.cells[index].x - cell.x) <= tolerance);
}

function renderTable(lines: Line[]): string {
  const columns = columnStarts(lines);
  const tolerance = Math.max(...lines.map((line) => line.fontSize)) * COLUMN_TOLERANCE;

  const rows = lines.map((line) => {
    const cells = Array<string>(columns.length).fill('');
    for (const cell of line.cells) {
      // Nearest column start rather than the first within tolerance: a cell
      // sitting between two columns belongs to the one it is closer to.
      let best = 0;
      for (let i = 1; i < columns.length; i += 1) {
        if (Math.abs(columns[i] - cell.x) < Math.abs(columns[best] - cell.x)) best = i;
      }
      const text = cell.text.replace(/\|/g, '\\|');
      cells[best] = cells[best] ? `${cells[best]} ${text}` : text;
    }
    return `| ${cells.join(' | ')} |`;
  });

  rows.splice(1, 0, `| ${Array(columns.length).fill('---').join(' | ')} |`);
  return rows.join('\n');
}

/** The union of every line's cell starts, merged when they nearly coincide. */
function columnStarts(lines: Line[]): number[] {
  const tolerance = Math.max(...lines.map((line) => line.fontSize)) * COLUMN_TOLERANCE;
  const starts: number[] = [];

  for (const x of lines.flatMap((line) => line.cells.map((cell) => cell.x)).sort((a, b) => a - b)) {
    const last = starts[starts.length - 1];
    if (last === undefined || x - last > tolerance) starts.push(x);
  }
  return starts;
}
