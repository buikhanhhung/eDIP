import ExcelJS from 'exceljs';

/**
 * Turns a workbook into markdown tables, one per sheet.
 *
 * A spreadsheet is the one input here that is often not a document at all but
 * a database, and the pipeline behind this — chunking, embedding, entity
 * extraction — is built for prose. Ten thousand rows of transactions would
 * produce hundreds of chunks that answer no question anyone asks, so each
 * sheet is cut at a readable length and says so, the same way a scanned PDF
 * past its page limit does.
 *
 * Merged cells need no work: exceljs has already repeated the value into every
 * cell the merge covers, which is exactly what a markdown table wants.
 */

/** Rows kept per sheet. Beyond this a sheet is data, not a document. */
export const MAX_ROWS_PER_SHEET = 2000;

export interface WorkbookText {
  text: string;
  /** Set when at least one sheet was cut, for the document's warning. */
  warning?: string;
}

export async function xlsxToText(buffer: Buffer): Promise<WorkbookText> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(toArrayBuffer(buffer));

  const sections: string[] = [];
  const truncated: string[] = [];

  for (const sheet of workbook.worksheets) {
    const width = sheet.columnCount;
    if (width === 0) continue;

    const rows: string[][] = [];
    let seen = 0;
    let cut = false;

    sheet.eachRow({ includeEmpty: false }, (row) => {
      seen += 1;
      if (rows.length >= MAX_ROWS_PER_SHEET) {
        cut = true;
        return;
      }
      // By column index rather than by defined cell, so a row missing its last
      // cells still lines up with the header above it.
      const cells: string[] = [];
      for (let column = 1; column <= width; column += 1) {
        cells.push(cellText(row.getCell(column).value));
      }
      if (cells.some((cell) => cell.length > 0)) rows.push(cells);
    });

    if (rows.length === 0) continue;

    // A single column is a list of notes, not a table. Wrapping it in pipes
    // would claim a structure the sheet does not have.
    const body =
      width === 1
        ? rows.map((cells) => cells[0]).join('\n')
        : [
            `| ${rows[0].join(' | ')} |`,
            `| ${Array(width).fill('---').join(' | ')} |`,
            ...rows.slice(1).map((cells) => `| ${cells.join(' | ')} |`),
          ].join('\n');

    const note = cut ? `\n\n[Only the first ${MAX_ROWS_PER_SHEET} of ${seen} rows were read.]` : '';
    if (cut) truncated.push(sheet.name);

    sections.push(`## ${sheet.name}\n\n${body}${note}`);
  }

  return {
    text: sections.join('\n\n'),
    warning:
      truncated.length > 0
        ? `Sheets cut at ${MAX_ROWS_PER_SHEET} rows: ${truncated.join(', ')}.`
        : undefined,
  };
}

/**
 * Renders one cell.
 *
 * A formula contributes its cached result, not its expression: "=B2*C2" tells
 * a reader nothing, and searching for the number is what anyone would do.
 */
function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);

  if (typeof value === 'object') {
    if ('richText' in value) return escape(value.richText.map((part) => part.text).join(''));
    if ('formula' in value || 'sharedFormula' in value) return cellText(value.result ?? null);
    if ('hyperlink' in value) return escape(value.text ?? value.hyperlink);
    if ('error' in value) return escape(String(value.error));
  }

  return escape(String(value));
}

/** One line, and no bare pipe that would open a column of its own. */
function escape(text: string): string {
  return text.replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim();
}

/** exceljs wants an ArrayBuffer, and a Buffer may be a view into a larger one. */
function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
}
