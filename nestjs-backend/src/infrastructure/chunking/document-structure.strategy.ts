import type { Chunk, ChunkingStrategy } from './chunking.types';

const DEFAULT_MAX_CHUNK_SIZE = 1500;

/** ATX headers only: one to six hashes, then the rest of the line as the title. */
const HEADER_RE = /^(#{1,6})\s+(.+?)\s*$/;

interface Section {
  header: string;
  level: number;
  body: string;
}

export interface DocumentStructureOptions {
  maxChunkSize?: number;
  /** Repeat the section header inside every chunk that section produced. */
  preserveHeaders?: boolean;
}

/**
 * Flat sections cut on markdown headers.
 *
 * Where the parent-child strategy answers with a wider passage, this one keeps
 * the header *inside* every chunk it emits. That is what lets an oversized
 * section survive being cut: a piece three cuts deep still says which clause it
 * belongs to, without a second column to read it from.
 *
 * Headers are matched line by line rather than parsed, and the fenced code
 * state is tracked by hand so a `#` inside a fence is not read as a heading.
 * The parent-child strategy solves the same problem from a real mdast tree, and
 * would be more correct — it also sees setext headings and strips closing
 * hashes. This one stays regex-based to match the implementation it was ported
 * from, which means the two strategies genuinely disagree on where sections
 * begin for `Title
====`, `## Heading ##`, `~~~` fences and indented code.
 *
 * Exported with options so the size and header behaviour can be exercised
 * directly; the registered strategy takes the defaults.
 */
export function documentStructureChunks(
  text: string,
  options: DocumentStructureOptions = {},
): Chunk[] {
  if (text.trim().length === 0) return [];

  // Floored at 1: the hard-cut loop advances by this value, so zero or a
  // negative never terminates and fills the heap instead. `??` does not catch
  // it, because zero is a perfectly good number.
  const maxChunkSize = Math.max(1, options.maxChunkSize ?? DEFAULT_MAX_CHUNK_SIZE);
  const preserveHeaders = options.preserveHeaders ?? true;

  const chunks: Chunk[] = [];

  /**
   * Headings whose own section had no text under them, waiting for one that
   * does.
   *
   * `# Chương 1` followed straight by `## Điều 1` is the ordinary shape of a
   * Vietnamese decree, and it leaves the chapter heading with an empty body.
   * Emitting it alone produces a chunk that is nothing but its own title —
   * measured at a quarter of all chunks on that shape — which costs an
   * embedding to say nothing and then outranks the real clause whenever
   * somebody searches the chapter's name. Dropping it instead would lose which
   * chapter the articles belong to. So it is carried forward and prepended to
   * the next section that has something to say.
   */
  let pendingHeaders = '';

  for (const section of extractSections(text.replace(/\r\n/g, '\n'))) {
    const ownHeader =
      preserveHeaders && section.header ? `${'#'.repeat(section.level)} ${section.header}\n\n` : '';

    if (section.body.length === 0) {
      pendingHeaders += ownHeader;
      continue;
    }

    const headerText = pendingHeaders + ownHeader;
    pendingHeaders = '';

    // Non-empty by construction: `section.body` is already trimmed and known
    // non-empty here, so the old empty-`whole` guard could never fire.
    const whole = (headerText + section.body).trim();

    if (whole.length <= maxChunkSize) {
      chunks.push(buildChunk(whole, section, false));
      continue;
    }

    // Oversized: cut on blank lines, carrying the header into every piece.
    const paragraphs = section.body
      .split(/\n\n+/)
      .map((paragraph) => paragraph.trim())
      .filter((paragraph) => paragraph.length > 0);

    let buffer = headerText;
    let subIndex = 0;

    for (const paragraph of paragraphs) {
      const candidate = buffer ? `${buffer.trimEnd()}\n\n${paragraph}` : paragraph;

      if (candidate.length <= maxChunkSize) {
        buffer = candidate;
        continue;
      }

      // A buffer holding more than the header has a finished piece in it.
      if (buffer.length > headerText.length) {
        chunks.push(buildChunk(buffer.trim(), section, true, subIndex++));
      }

      if (paragraph.length > maxChunkSize) {
        // No blank line to cut on, so cut by length. This can split a
        // Vietnamese word across the boundary; the alternative is a chunk too
        // large to embed at all.
        for (let at = 0; at < paragraph.length; at += maxChunkSize) {
          const slice = paragraph.slice(at, at + maxChunkSize);
          // A cut landing inside a long run of whitespace carries no text. With
          // no header it trims to an empty string, which the embedding provider
          // rejects *after* `replaceChunks` has committed the row; with a header
          // it becomes a chunk of nothing but the heading, repeated. Neither is
          // worth a row, and skipping keeps every surviving piece byte-identical.
          if (slice.trim().length === 0) continue;
          chunks.push(buildChunk((headerText + slice).trim(), section, true, subIndex++));
        }
        buffer = headerText;
      } else {
        buffer = headerText + paragraph;
      }
    }

    if (buffer.length > headerText.length) {
      chunks.push(buildChunk(buffer.trim(), section, true, subIndex++));
    }
  }

  return chunks;
}

function buildChunk(
  content: string,
  section: Section,
  isSubChunk: boolean,
  subChunkIndex?: number,
): Chunk {
  const metadata: Record<string, unknown> = {
    chunkingStrategy: 'DOCUMENT_STRUCTURE',
    sectionHeader: section.header,
    level: section.level,
    isSubChunk,
  };
  if (subChunkIndex !== undefined) metadata.subChunkIndex = subChunkIndex;

  // No `parentContent` on purpose: this strategy is flat, and the header it
  // carries inline is the context a reader of one chunk needs.
  return { content, metadata };
}

function extractSections(text: string): Section[] {
  const sections: Section[] = [];
  let current: Section = { header: '', level: 0, body: '' };
  let bodyLines: string[] = [];
  let inCode = false;

  const flush = () => {
    current.body = bodyLines.join('\n').trim();
    // A header with an empty body is still kept, as a chunk of its own title.
    if (current.header || current.body) sections.push(current);
    bodyLines = [];
  };

  for (const line of text.split('\n')) {
    if (line.trim().startsWith('```')) {
      inCode = !inCode;
      bodyLines.push(line);
      continue;
    }

    const header = inCode ? null : HEADER_RE.exec(line);
    if (header) {
      flush();
      current = { header: header[2].trim(), level: header[1].length, body: '' };
    } else {
      bodyLines.push(line);
    }
  }
  flush();

  return sections;
}

export const documentStructureStrategy: ChunkingStrategy = (text: string): Promise<Chunk[]> =>
  Promise.resolve(documentStructureChunks(text));
