import type { Chunk, ChunkingStrategy } from './chunking.types';
import { splitText } from './text-splitter';

const DEFAULT_CHILD_SIZE = 500;
const DEFAULT_CHILD_OVERLAP = 100;

/**
 * The heading line at the top of a section's own slice of the document.
 *
 * The line ending is optional because the last heading in a document has none.
 * Requiring it left the body equal to the heading itself, so a trailing
 * `# Heading` with nothing under it was emitted as a chunk of its own title.
 */
const ATX_LEADING_HEADER_RE = /^#{1,6}\s+.+?(?:\n|$)/;

/** Only the parts of the mdast tree this strategy reads. */
interface MdastHeadingNode {
  type: string;
  depth: number;
  position?: { start: { offset?: number } };
}
interface MdastRoot {
  children: MdastHeadingNode[];
}
interface Parser {
  parse(markdown: string): MdastRoot;
}

interface Section {
  header: string;
  level: number;
  parentHeaders: string[];
  /** The section including its own heading — what the reader gets back. */
  raw: string;
  /** The section without its heading — what gets cut into children. */
  body: string;
}

/**
 * Small-to-big chunking over markdown headings.
 *
 * The child is what gets embedded, because a short passage makes a sharp
 * vector. The parent is what comes back, because an answer needs the
 * surrounding clause to make sense. Both retrieval queries have selected
 * `COALESCE(parent_content, content)` since before anything wrote the column —
 * this is the strategy that fills it.
 *
 * `unified` and `remark-parse` are pure ESM, so they are loaded lazily on first
 * use: importing them at module scope would drag the parser into the startup
 * path of every process that touches chunking, including ones that never chunk
 * markdown.
 */
let cached: { parser: Parser; nodeToString: (node: unknown) => string } | null = null;

async function ensureParser() {
  if (cached) return cached;

  const [{ unified }, remarkParse, toStringModule] = await Promise.all([
    import('unified'),
    import('remark-parse'),
    import('mdast-util-to-string'),
  ]);
  const plugin = (remarkParse as { default: unknown }).default ?? remarkParse;

  cached = {
    parser: unified().use(plugin as never) as unknown as Parser,
    nodeToString: toStringModule.toString,
  };
  return cached;
}

export const parentChildMarkdownStrategy: ChunkingStrategy = async (
  text: string,
): Promise<Chunk[]> => {
  if (text.trim().length === 0) return [];

  const { parser, nodeToString } = await ensureParser();
  const normalised = text.replace(/\r\n/g, '\n');
  const sections = extractSections(normalised, parser.parse(normalised), nodeToString);

  const chunks: Chunk[] = [];
  for (const section of sections) {
    if (section.body.trim().length === 0) continue;

    // The ancestor trail, so a child lifted out of a deep subsection still
    // says which chapter it belongs to.
    const breadcrumb =
      section.parentHeaders.length > 0
        ? `${section.parentHeaders.map((header) => `[${header}]`).join(' > ')}\n\n`
        : '';
    const parentContent = `${breadcrumb}${section.raw.trim()}`;

    for (const child of splitText(section.body, DEFAULT_CHILD_SIZE, DEFAULT_CHILD_OVERLAP)) {
      const content = child.trim();
      if (content.length === 0) continue;

      chunks.push({
        content,
        // A parent equal to its child is the same text stored twice, and the
        // COALESCE that reads it would return the child unchanged. That is
        // reachable: a section with no heading to prepend, short enough to fit
        // one child, produces exactly that. Leave the column NULL instead.
        parentContent: parentContent === content ? undefined : parentContent,
        metadata: {
          chunkingStrategy: 'PARENT_CHILD_MARKDOWN',
          sectionHeader: section.header,
          level: section.level,
          parentHeaders: section.parentHeaders,
          isParentChild: true,
          chunkSize: DEFAULT_CHILD_SIZE,
          chunkOverlap: DEFAULT_CHILD_OVERLAP,
        },
      });
    }
  }

  return chunks;
};

/**
 * Headings come from the AST rather than a regex, which is the whole reason for
 * the dependency: a `#` inside a fenced code block is not a heading, and only a
 * parser knows the difference.
 */
function extractSections(
  content: string,
  tree: MdastRoot,
  nodeToString: (node: unknown) => string,
): Section[] {
  const headings: { level: number; text: string; startOffset: number; parentHeaders: string[] }[] =
    [];
  const ancestors: { level: number; text: string }[] = [];

  for (const node of tree.children) {
    if (node?.type !== 'heading') continue;

    // Pop to the nearest shallower heading: that stack *is* the breadcrumb.
    while (ancestors.length > 0 && ancestors[ancestors.length - 1].level >= node.depth) {
      ancestors.pop();
    }
    headings.push({
      level: node.depth,
      text: nodeToString(node).trim(),
      startOffset: node.position?.start?.offset ?? 0,
      parentHeaders: ancestors.map((ancestor) => ancestor.text),
    });
    ancestors.push({ level: node.depth, text: nodeToString(node).trim() });
  }

  const sections: Section[] = [];

  // Anything above the first heading is still text someone wrote, and dropping
  // it would lose the preamble of every document that opens without one.
  const firstOffset = headings[0]?.startOffset ?? content.length;
  const preamble = content.slice(0, firstOffset).trim();
  if (firstOffset > 0 && preamble.length > 0) {
    sections.push({ header: '', level: 0, parentHeaders: [], raw: preamble, body: preamble });
  }

  headings.forEach((heading, index) => {
    const endOffset = headings[index + 1]?.startOffset ?? content.length;
    const raw = content.slice(heading.startOffset, endOffset);

    sections.push({
      header: heading.text,
      level: heading.level,
      parentHeaders: heading.parentHeaders,
      raw,
      body: raw.replace(ATX_LEADING_HEADER_RE, '').trim(),
    });
  });

  if (sections.length === 0) {
    const whole = content.trim();
    if (whole.length > 0) {
      sections.push({ header: '', level: 0, parentHeaders: [], raw: whole, body: whole });
    }
  }

  return sections;
}
