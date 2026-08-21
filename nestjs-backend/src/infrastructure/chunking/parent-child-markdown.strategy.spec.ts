import { parentChildMarkdownStrategy } from './parent-child-markdown.strategy';

/**
 * Small-to-big: the child is what gets embedded, the parent is what gets
 * returned. The invariant worth guarding is that every child of one section
 * carries the *same* parent — that is what makes the retrieval side coherent.
 */
describe('parentChildMarkdownStrategy', () => {
  it('returns nothing for empty or whitespace-only input', async () => {
    expect(await parentChildMarkdownStrategy('')).toEqual([]);
    expect(await parentChildMarkdownStrategy('   \n\n  ')).toEqual([]);
  });

  it('cuts on both H1 and H2, one section each', async () => {
    const chunks = await parentChildMarkdownStrategy(
      '# Chương I\n\nNội dung một.\n\n## Điều 1\n\nNội dung hai.',
    );

    const headers = chunks.map((chunk) => chunk.metadata?.sectionHeader);
    expect(new Set(headers)).toEqual(new Set(['Chương I', 'Điều 1']));
  });

  it('gives every child of one section the same parent', async () => {
    // Paragraphs, because the child splitter cuts on blank lines.
    const body = Array.from({ length: 8 }, (_, i) => `Đoạn ${i} ${'x'.repeat(120)}`).join('\n\n');
    const chunks = await parentChildMarkdownStrategy(`# Một mục\n\n${body}`);

    expect(chunks.length).toBeGreaterThan(1);
    expect(new Set(chunks.map((chunk) => chunk.parentContent)).size).toBe(1);
  });

  it('makes the parent wider than the child it stands in for', async () => {
    const chunks = await parentChildMarkdownStrategy(
      '# Mục lớn\n\n' +
        Array.from({ length: 6 }, (_, i) => `Câu ${i} ${'y'.repeat(150)}`).join('\n\n'),
    );

    expect(chunks.length).toBeGreaterThan(0);
    for (const chunk of chunks) {
      expect(chunk.parentContent!.length).toBeGreaterThan(chunk.content.length);
    }
  });

  it('carries the ancestor breadcrumb into a nested section parent', async () => {
    const chunks = await parentChildMarkdownStrategy(
      '# Cấp một\n\n## Cấp hai\n\n### Cấp ba\n\nNội dung sâu nhất.',
    );

    const deepest = chunks.find((chunk) => chunk.metadata?.sectionHeader === 'Cấp ba');
    expect(deepest).toBeDefined();
    expect(deepest!.parentContent).toMatch(/\[Cấp một\]\s*>\s*\[Cấp hai\]/);
    expect(deepest!.metadata?.parentHeaders).toEqual(['Cấp một', 'Cấp hai']);
  });

  it('keeps text before the first heading instead of dropping it', async () => {
    const chunks = await parentChildMarkdownStrategy('Lời mở đầu.\n\n# Mục một\n\nThân mục.');

    const preamble = chunks.find((chunk) => chunk.content.includes('Lời mở đầu'));
    expect(preamble).toBeDefined();
    expect(preamble!.metadata?.sectionHeader).toBe('');
    expect(preamble!.metadata?.parentHeaders).toEqual([]);
  });

  it('treats a document with no heading as one unheaded section', async () => {
    const chunks = await parentChildMarkdownStrategy('Chỉ là văn bản thuần.\n\nKhông có tiêu đề.');

    expect(chunks).toHaveLength(1);
    expect(chunks[0].metadata?.sectionHeader).toBe('');
    expect(chunks[0].metadata?.level).toBe(0);
  });

  it('emits nothing for a heading with no body under it', async () => {
    const chunks = await parentChildMarkdownStrategy(
      '# Có thân\n\nThân đây.\n\n# Rỗng\n\n# Cũng có thân\n\nThân nữa.',
    );

    expect(chunks.some((chunk) => chunk.metadata?.sectionHeader === 'Rỗng')).toBe(false);
    expect(chunks.some((chunk) => chunk.metadata?.sectionHeader === 'Có thân')).toBe(true);
  });

  it('does not mistake a # inside a fenced code block for a heading', async () => {
    const chunks = await parentChildMarkdownStrategy(
      '# Mục thật\n\n```\n# không phải tiêu đề\nmã nguồn\n```\n\nCòn nội dung.',
    );

    expect(new Set(chunks.map((chunk) => chunk.metadata?.sectionHeader))).toEqual(
      new Set(['Mục thật']),
    );
  });

  it('normalises Windows line endings before parsing', async () => {
    const chunks = await parentChildMarkdownStrategy('# Tiêu đề\r\n\r\nThân bài.\r\nDòng nữa.');

    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).not.toContain('\r');
    expect(chunks[0].parentContent).not.toContain('\r');
  });

  it('labels every chunk with the strategy that produced it', async () => {
    const chunks = await parentChildMarkdownStrategy('## Mục\n\nNội dung.');

    expect(chunks.length).toBeGreaterThan(0);
    for (const chunk of chunks) {
      expect(chunk.metadata?.chunkingStrategy).toBe('PARENT_CHILD_MARKDOWN');
      expect(chunk.metadata?.level).toBe(2);
    }
  });

  it('puts the section heading in the parent, not only in the body', async () => {
    const chunks = await parentChildMarkdownStrategy(
      '# Điều khoản thanh toán\n\nTrả trong 30 ngày.',
    );

    expect(chunks[0].parentContent).toContain('Điều khoản thanh toán');
  });
});

/**
 * A parent is only worth storing when it says more than the child does. These
 * cover the shapes where it would not — found by review, not by the tests
 * above, which asserted the invariant only over inputs that already held it.
 */
describe('parentChildMarkdownStrategy parent/child degenerate shapes', () => {
  it('leaves the parent unset when it would repeat the child verbatim', async () => {
    const chunks = await parentChildMarkdownStrategy('Một đoạn duy nhất, không tiêu đề.');

    expect(chunks).toHaveLength(1);
    expect(chunks[0].parentContent).toBeUndefined();
  });

  it('leaves the parent unset for a setext heading that fits one child', async () => {
    // remark reads this as a heading, but the underline stays in the body, so
    // the section and its only child are the same string.
    const chunks = await parentChildMarkdownStrategy('Tiêu đề\n=======\n\nMột đoạn ngắn.');

    expect(chunks).toHaveLength(1);
    expect(chunks[0].parentContent).toBeUndefined();
  });

  it('emits nothing for a heading that ends the document with no body', async () => {
    const chunks = await parentChildMarkdownStrategy('# Có thân\n\nThân đây.\n\n# Rỗng cuối');

    expect(chunks.map((chunk) => chunk.metadata?.sectionHeader)).toEqual(['Có thân']);
  });

  it('keeps the heading out of the child while keeping it in the parent', async () => {
    const chunks = await parentChildMarkdownStrategy(
      '# Điều 5. Bảo mật\n\nHai bên giữ kín thông tin trong 3 năm.',
    );

    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).not.toContain('# Điều 5');
    expect(chunks[0].parentContent).toContain('# Điều 5');
  });
});
