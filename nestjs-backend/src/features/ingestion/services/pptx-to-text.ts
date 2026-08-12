import JSZip from 'jszip';

/**
 * Reads a deck: one section per slide, in slide order, with its table content
 * and its speaker notes.
 *
 * Written against the OOXML rather than through a library. The parts that
 * matter are small and stable — text lives in `<a:t>` runs, a table is
 * `<a:tbl>` of `<a:tr>` of `<a:tc>` — while the pptx packages on npm are thin
 * and largely unmaintained, which is the opposite of the trade that made
 * exceljs the right answer for a workbook.
 *
 * Notes are kept because a deck usually carries its argument there; the slide
 * itself is often five words and a picture.
 */

interface Slide {
  number: number;
  path: string;
}

export interface DeckText {
  text: string;
  slideCount: number;
}

export async function pptxToText(buffer: Buffer): Promise<DeckText> {
  const zip = await JSZip.loadAsync(buffer);

  const slides: Slide[] = Object.keys(zip.files)
    .map((path) => ({ path, match: /^ppt\/slides\/slide(\d+)\.xml$/.exec(path) }))
    .filter((entry) => entry.match !== null)
    .map((entry) => ({ number: Number(entry.match![1]), path: entry.path }))
    // Sorted numerically: a plain string sort puts slide10 before slide2.
    .sort((a, b) => a.number - b.number);

  const sections: string[] = [];

  for (const slide of slides) {
    const xml = await zip.file(slide.path)?.async('string');
    if (!xml) continue;

    const parts = [`## Slide ${slide.number}`, slideBody(xml)];

    const notesXml = await zip.file(`ppt/notesSlides/notesSlide${slide.number}.xml`)?.async('string');
    const notes = notesXml ? textRuns(notesXml).join('\n') : '';
    if (notes.trim().length > 0) parts.push(`Speaker notes: ${notes.trim()}`);

    const body = parts.filter((part) => part.trim().length > 0).join('\n\n');
    if (body.trim().length > 0) sections.push(body);
  }

  return { text: sections.join('\n\n'), slideCount: slides.length };
}

/** Tables first pulled out, so their cells do not land in the prose. */
function slideBody(xml: string): string {
  const blocks: string[] = [];
  let rest = xml;

  for (const match of xml.matchAll(/<a:tbl\b[\s\S]*?<\/a:tbl>/g)) {
    const table = toMarkdownTable(match[0]);
    if (table) blocks.push(table);
    rest = rest.replace(match[0], '');
  }

  const prose = textRuns(rest).join('\n');
  return [prose, ...blocks].filter((block) => block.trim().length > 0).join('\n\n');
}

function toMarkdownTable(xml: string): string | null {
  const rows: string[][] = [];

  for (const rowMatch of xml.matchAll(/<a:tr\b[\s\S]*?<\/a:tr>/g)) {
    const cells: string[] = [];
    for (const cellMatch of rowMatch[0].matchAll(/<a:tc\b[\s\S]*?<\/a:tc>/g)) {
      cells.push(textRuns(cellMatch[0]).join(' ').replace(/\|/g, '\\|').trim());
    }
    if (cells.length > 0) rows.push(cells);
  }

  if (rows.length === 0) return null;

  const width = Math.max(...rows.map((row) => row.length));
  const lines = rows.map(
    (row) => `| ${[...row, ...Array(width - row.length).fill('')].join(' | ')} |`,
  );
  lines.splice(1, 0, `| ${Array(width).fill('---').join(' | ')} |`);
  return lines.join('\n');
}

/**
 * The text of each `<a:t>` run, one line per paragraph.
 *
 * PowerPoint splits a sentence across runs whenever formatting changes, so the
 * runs inside one `<a:p>` are joined before the paragraphs are.
 */
function textRuns(xml: string): string[] {
  const paragraphs: string[] = [];

  for (const match of xml.matchAll(/<a:p\b[\s\S]*?<\/a:p>/g)) {
    const runs = [...match[0].matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((run) => decode(run[1]));
    const line = runs.join('').trim();
    if (line.length > 0) paragraphs.push(line);
  }

  return paragraphs;
}

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
};

function decode(text: string): string {
  return text
    .replace(/&(amp|lt|gt|quot|apos);/g, (entity) => ENTITIES[entity] ?? entity)
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)));
}
