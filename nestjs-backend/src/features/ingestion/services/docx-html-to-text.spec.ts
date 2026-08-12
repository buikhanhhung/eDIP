import { docxHtmlToText } from './docx-html-to-text';

describe('docxHtmlToText', () => {
  it('keeps a table as a markdown table', () => {
    const html =
      '<table><thead><tr><th>Hạng mục</th><th>Giá trị</th></tr></thead>' +
      '<tbody><tr><td>Phí dịch vụ</td><td>120.000.000 VNĐ</td></tr></tbody></table>';

    expect(docxHtmlToText(html)).toBe(
      ['| Hạng mục | Giá trị |', '| --- | --- |', '| Phí dịch vụ | 120.000.000 VNĐ |'].join('\n'),
    );
  });

  it('keeps prose around a table, in order', () => {
    const html = '<p>Trước bảng</p><table><tr><td>A</td></tr></table><p>Sau bảng</p>';

    expect(docxHtmlToText(html)).toBe(
      ['Trước bảng', '', '| A |', '| --- |', '', 'Sau bảng'].join('\n'),
    );
  });

  it('pads a ragged row so the table still renders', () => {
    const html = '<table><tr><td>a</td><td>b</td></tr><tr><td>c</td></tr></table>';

    expect(docxHtmlToText(html)).toBe(['| a | b |', '| --- | --- |', '| c |  |'].join('\n'));
  });

  it('escapes a pipe inside a cell rather than opening a column', () => {
    const html = '<table><tr><td>a|b</td></tr></table>';

    expect(docxHtmlToText(html)).toContain('a\\|b');
  });

  it('flattens a multi-line cell onto one row', () => {
    const html = '<table><tr><td><p>dòng một</p><p>dòng hai</p></td><td>x</td></tr></table>';

    expect(docxHtmlToText(html)).toBe(
      ['| dòng một dòng hai | x |', '| --- | --- |'].join('\n'),
    );
  });

  it('decodes entities and drops inline formatting', () => {
    expect(docxHtmlToText('<p>Bên <strong>A</strong> &amp; Bên B</p>')).toBe('Bên A & Bên B');
  });

  it('marks list items', () => {
    expect(docxHtmlToText('<ul><li>một</li><li>hai</li></ul>')).toBe('- một\n\n- hai');
  });

  it('returns nothing for markup with no text', () => {
    expect(docxHtmlToText('<p></p><table></table>')).toBe('');
  });
});
