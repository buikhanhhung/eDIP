import { documentStructureChunks } from './document-structure.strategy';

/**
 * Flat sections cut on ATX headers. Unlike the parent-child strategy this one
 * stores nothing in `parentContent` — the section header travels inside the
 * chunk text and in `metadata`, so an oversized section stays readable after
 * being cut into pieces.
 */
describe('documentStructureChunks', () => {
  it('returns nothing for empty or whitespace-only input', () => {
    expect(documentStructureChunks('')).toEqual([]);
    expect(documentStructureChunks('   \n\n  ')).toEqual([]);
  });

  it('cuts one chunk per section and opens each with its own header', () => {
    const chunks = documentStructureChunks('# Chương I\n\nThân một.\n\n## Điều 1\n\nThân hai.');

    expect(chunks).toHaveLength(2);
    expect(chunks[0].content.startsWith('# Chương I')).toBe(true);
    expect(chunks[1].content.startsWith('## Điều 1')).toBe(true);
  });

  it('does not treat a # inside a fenced code block as a header', () => {
    const chunks = documentStructureChunks(
      '# Mục thật\n\n```\n# không phải tiêu đề\nmã nguồn\n```\n\nCòn nội dung.',
    );

    expect(chunks).toHaveLength(1);
    expect(chunks[0].metadata?.sectionHeader).toBe('Mục thật');
    // The text inside the fence survives rather than being cut away.
    expect(chunks[0].content).toContain('# không phải tiêu đề');
  });

  it('splits an oversized section on blank lines and repeats the header in every piece', () => {
    const paragraph = (label: string) => `${label} ${'n'.repeat(140)}`;
    const body = ['một', 'hai', 'ba'].map(paragraph).join('\n\n');
    const chunks = documentStructureChunks(`# Mục dài\n\n${body}`, { maxChunkSize: 200 });

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.content.startsWith('# Mục dài')).toBe(true);
      expect(chunk.metadata?.isSubChunk).toBe(true);
    }
    expect(chunks.map((chunk) => chunk.metadata?.subChunkIndex)).toEqual(
      chunks.map((_, index) => index),
    );
  });

  it('hard-cuts a paragraph at exact size boundaries, in order', () => {
    // Cycling letters rather than one repeated character, so a wrong boundary
    // or a swapped order is visible instead of averaging out.
    const paragraph = Array.from({ length: 250 }, (_, i) =>
      String.fromCharCode(97 + (i % 26)),
    ).join('');
    const chunks = documentStructureChunks(paragraph, {
      maxChunkSize: 100,
      preserveHeaders: false,
    });

    expect(chunks.map((chunk) => chunk.content.length)).toEqual([100, 100, 50]);
    expect(chunks.map((chunk) => chunk.content)).toEqual([
      paragraph.slice(0, 100),
      paragraph.slice(100, 200),
      paragraph.slice(200),
    ]);
  });

  /**
   * The cut is by character count, so it can land inside a run of whitespace.
   * The piece then carries no text: without a header it would be the empty
   * string, which the embedding provider rejects after the row is already
   * written; with one it would be the heading repeated. Both are dropped, and
   * the whitespace goes with them — so this path does lose characters.
   */
  it('drops a piece that holds nothing but whitespace', () => {
    const padded = `a${' '.repeat(300)}b`;

    expect(
      documentStructureChunks(padded, { maxChunkSize: 100, preserveHeaders: false }).map(
        (chunk) => chunk.content,
      ),
    ).toEqual(['a', 'b']);

    const headed = documentStructureChunks(`# H\n\n${padded}`, { maxChunkSize: 100 });
    expect(headed.map((chunk) => chunk.content)).toEqual(['# H\n\na', '# H\n\n b']);
  });

  /**
   * A non-positive size would never advance the hard-cut loop. `??` does not
   * catch zero, so the floor is explicit — without it this input exhausts the
   * heap rather than failing.
   */
  it('survives a maxChunkSize of zero instead of looping forever', () => {
    const chunks = documentStructureChunks('# H\n\nmột đoạn ngắn', { maxChunkSize: 0 });

    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.every((chunk) => chunk.content.length > 0)).toBe(true);
  });

  it('leaves the header line out when asked not to preserve it', () => {
    const chunks = documentStructureChunks('# Điều 5\n\nHai bên giữ kín.', {
      preserveHeaders: false,
    });

    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toBe('Hai bên giữ kín.');
    // The header is still recorded, just not repeated inside the text.
    expect(chunks[0].metadata?.sectionHeader).toBe('Điều 5');
  });

  it('treats text with no ATX header as one unheaded section', () => {
    const chunks = documentStructureChunks('1. MỤC ĐÍCH\n\nQuy định này áp dụng cho toàn công ty.');

    expect(chunks).toHaveLength(1);
    expect(chunks[0].metadata?.sectionHeader).toBe('');
    expect(chunks[0].metadata?.level).toBe(0);
  });

  it('records the strategy, the header and its level on every chunk', () => {
    const chunks = documentStructureChunks('### Mục nhỏ\n\nNội dung.');

    expect(chunks).toHaveLength(1);
    expect(chunks[0].metadata).toMatchObject({
      chunkingStrategy: 'DOCUMENT_STRUCTURE',
      sectionHeader: 'Mục nhỏ',
      level: 3,
      isSubChunk: false,
    });
  });

  it('never sets parentContent — this strategy is flat', () => {
    const chunks = documentStructureChunks(
      '# A\n\n' + 'đoạn '.repeat(200) + '\n\n## B\n\nThân B.',
      { maxChunkSize: 200 },
    );

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.parentContent).toBeUndefined();
    }
  });

  it('normalises Windows line endings before looking for headers', () => {
    const chunks = documentStructureChunks('# Tiêu đề\r\n\r\nThân bài.\r\nDòng nữa.');

    expect(chunks).toHaveLength(1);
    expect(chunks[0].metadata?.sectionHeader).toBe('Tiêu đề');
    expect(chunks[0].content).not.toContain('\r');
  });

  it('carries a header with no body into the next section that has one', () => {
    const chunks = documentStructureChunks(
      '# Có thân\n\nThân đây.\n\n# Rỗng\n\n# Cũng có\n\nThân nữa.',
    );

    expect(chunks.map((chunk) => chunk.metadata?.sectionHeader)).toEqual(['Có thân', 'Cũng có']);
    // The orphan is not lost — it opens the chunk it was folded into.
    expect(chunks[1].content).toBe('# Rỗng\n\n# Cũng có\n\nThân nữa.');
  });
});

/**
 * A chapter heading followed straight by its articles is the ordinary shape of
 * the documents this system ingests, and it leaves the chapter with an empty
 * body. Emitted alone it is a chunk of its own title; dropped, the articles no
 * longer say which chapter they belong to. Folding it forward keeps both.
 */
describe('documentStructureChunks orphan headings', () => {
  const decree = [1, 2]
    .map(
      (chapter) =>
        `# Chương ${chapter}\n\n` +
        [1, 2].map((article) => `## Điều ${article}\n\nNội dung điều ${article}.`).join('\n\n'),
    )
    .join('\n\n');

  it('emits no chunk that is only a heading', () => {
    const chunks = documentStructureChunks(decree);

    expect(chunks).toHaveLength(4);
    expect(chunks.filter((chunk) => /^#{1,6} [^\n]*$/.test(chunk.content.trim()))).toEqual([]);
  });

  it('opens the first article of a chapter with the chapter heading', () => {
    const chunks = documentStructureChunks(decree);

    expect(chunks[0].content).toBe('# Chương 1\n\n## Điều 1\n\nNội dung điều 1.');
    // Only the first: the second article is already inside that chapter.
    expect(chunks[1].content).toBe('## Điều 2\n\nNội dung điều 2.');
    // The section a chunk belongs to is still its own, not the chapter's.
    expect(chunks[0].metadata?.sectionHeader).toBe('Điều 1');
    expect(chunks[0].metadata?.level).toBe(2);
  });

  it('accumulates several empty headings in order', () => {
    const chunks = documentStructureChunks('# A\n\n## B\n\n### C\n\nThân.');

    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toBe('# A\n\n## B\n\n### C\n\nThân.');
  });

  it('drops a trailing heading, having nothing left to fold it into', () => {
    const chunks = documentStructureChunks('# Có thân\n\nThân đây.\n\n# Rỗng cuối');

    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toBe('# Có thân\n\nThân đây.');
  });
});

/**
 * Found by running the strategy over the repository's own markdown rather than
 * a fixture: `maxChunkSize` bounds the *body*, and the header re-prepended to a
 * sub-chunk is added on top of it. So an emitted chunk can exceed the limit by
 * exactly the header's length. Ported behaviour, pinned here because a tidy
 * fixture never crosses that line and the number matters to anyone sizing a
 * prompt around it.
 */
describe('documentStructureChunks size limit', () => {
  it('keeps a whole section within the limit', () => {
    const chunks = documentStructureChunks(`# H\n\n${'a'.repeat(80)}`, { maxChunkSize: 100 });

    expect(chunks).toHaveLength(1);
    expect(chunks[0].content.length).toBeLessThanOrEqual(100);
  });

  it('overshoots by the header it re-prepends to a hard-cut piece', () => {
    const headerText = '# H\n\n'; // 5 characters
    const chunks = documentStructureChunks(`# H\n\n${'a'.repeat(250)}`, { maxChunkSize: 100 });

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.content.startsWith('# H')).toBe(true);
      expect(chunk.content.length).toBeLessThanOrEqual(100 + headerText.length);
    }
    // The first piece is a full-size cut plus the header, not a full-size cut.
    expect(chunks[0].content.length).toBe(100 + '# H'.length + 2);
  });
});

/**
 * Gaps a mutation pass exposed: each of these fails a plausible wrong
 * implementation that the tests above accept.
 */
describe('documentStructureChunks boundaries the tests above missed', () => {
  it('cuts on blank lines, not on every newline', () => {
    // Splitting on /\n+/ instead of /\n\n+/ would separate these two lines and
    // rejoin them with a blank line between.
    const chunks = documentStructureChunks(`# H\n\nline one\nline two\n\n${'x'.repeat(50)}`, {
      maxChunkSize: 60,
    });

    expect(chunks[0].content).toContain('line one\nline two');
  });

  it('needs whitespace after the hashes, and stops at six', () => {
    const chunks = documentStructureChunks('####### bảy dấu\n\nthân bài\n\n#khongcachtrong');

    // Every line falls through to the unheaded section rather than becoming a
    // heading of its own.
    expect(chunks).toHaveLength(1);
    expect(chunks[0].metadata?.sectionHeader).toBe('');
    expect(chunks[0].content).toContain('####### bảy dấu');
    expect(chunks[0].content).toContain('#khongcachtrong');
  });

  it('emits nothing at all when the only section is a header it was told to drop', () => {
    expect(documentStructureChunks('# Chỉ tiêu đề', { preserveHeaders: false })).toEqual([]);
  });

  it('numbers sub-chunks per section, not across the document', () => {
    const long = (label: string) => `${label} ${'y'.repeat(120)}`;
    const body = [long('một'), long('hai')].join('\n\n');
    const chunks = documentStructureChunks(`# A\n\n${body}\n\n# B\n\n${body}`, {
      maxChunkSize: 200,
    });

    const perSection = new Map<string, unknown[]>();
    for (const chunk of chunks) {
      const header = String(chunk.metadata?.sectionHeader);
      perSection.set(header, [...(perSection.get(header) ?? []), chunk.metadata?.subChunkIndex]);
    }

    expect(perSection.get('A')).toEqual([0, 1]);
    expect(perSection.get('B')).toEqual([0, 1]);
  });
});
