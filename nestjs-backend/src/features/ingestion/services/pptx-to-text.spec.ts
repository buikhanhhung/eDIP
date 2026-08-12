import JSZip from 'jszip';
import { pptxToText } from './pptx-to-text';

const NS =
  'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" ' +
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"';

function slideXml(inner: string): string {
  return `<p:sld ${NS}><p:cSld><p:spTree>${inner}</p:spTree></p:cSld></p:sld>`;
}

function paragraphs(...lines: string[]): string {
  return `<p:sp><p:txBody>${lines
    .map((line) => `<a:p><a:r><a:t>${line}</a:t></a:r></a:p>`)
    .join('')}</p:txBody></p:sp>`;
}

async function deck(files: Record<string, string>): Promise<Buffer> {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(files)) zip.file(path, content);
  return zip.generateAsync({ type: 'nodebuffer' });
}

describe('pptxToText', () => {
  it('reads slides in numeric order, not the order the paths sort in', async () => {
    const buffer = await deck({
      'ppt/slides/slide1.xml': slideXml(paragraphs('Slide một')),
      'ppt/slides/slide2.xml': slideXml(paragraphs('Slide hai')),
      'ppt/slides/slide10.xml': slideXml(paragraphs('Slide mười')),
    });

    const { text, slideCount } = await pptxToText(buffer);

    expect(slideCount).toBe(3);
    expect(text.indexOf('Slide một')).toBeLessThan(text.indexOf('Slide hai'));
    expect(text.indexOf('Slide hai')).toBeLessThan(text.indexOf('Slide mười'));
  });

  it('joins the runs a sentence was split across', async () => {
    // PowerPoint starts a new run wherever formatting changes, so one sentence
    // arrives in pieces.
    const buffer = await deck({
      'ppt/slides/slide1.xml': slideXml(
        '<p:sp><p:txBody><a:p>' +
          '<a:r><a:t>Chi phí </a:t></a:r><a:r><a:t>triển khai</a:t></a:r>' +
          '</a:p></p:txBody></p:sp>',
      ),
    });

    const { text } = await pptxToText(buffer);

    expect(text).toContain('Chi phí triển khai');
  });

  it('keeps a slide table as a markdown table', async () => {
    const buffer = await deck({
      'ppt/slides/slide1.xml': slideXml(
        '<p:graphicFrame><a:tbl>' +
          '<a:tr><a:tc><a:txBody><a:p><a:r><a:t>Hạng mục</a:t></a:r></a:p></a:txBody></a:tc>' +
          '<a:tc><a:txBody><a:p><a:r><a:t>Thành tiền</a:t></a:r></a:p></a:txBody></a:tc></a:tr>' +
          '<a:tr><a:tc><a:txBody><a:p><a:r><a:t>Triển khai</a:t></a:r></a:p></a:txBody></a:tc>' +
          '<a:tc><a:txBody><a:p><a:r><a:t>120tr</a:t></a:r></a:p></a:txBody></a:tc></a:tr>' +
          '</a:tbl></p:graphicFrame>',
      ),
    });

    const { text } = await pptxToText(buffer);

    expect(text).toContain('| Hạng mục | Thành tiền |');
    expect(text).toContain('| Triển khai | 120tr |');
  });

  it('does not repeat table cells in the prose beside the table', async () => {
    const buffer = await deck({
      'ppt/slides/slide1.xml': slideXml(
        paragraphs('Chi phí') +
          '<p:graphicFrame><a:tbl><a:tr>' +
          '<a:tc><a:txBody><a:p><a:r><a:t>ô bảng</a:t></a:r></a:p></a:txBody></a:tc>' +
          '<a:tc><a:txBody><a:p><a:r><a:t>x</a:t></a:r></a:p></a:txBody></a:tc>' +
          '</a:tr></a:tbl></p:graphicFrame>',
      ),
    });

    const { text } = await pptxToText(buffer);

    expect(text.match(/ô bảng/g)).toHaveLength(1);
  });

  it('keeps the speaker notes, where a deck usually keeps its argument', async () => {
    const buffer = await deck({
      'ppt/slides/slide1.xml': slideXml(paragraphs('Bảo mật')),
      'ppt/notesSlides/notesSlide1.xml': `<p:notes ${NS}><p:cSld><p:spTree>${paragraphs(
        'Nhấn mạnh phần mã hoá.',
      )}</p:spTree></p:cSld></p:notes>`,
    });

    const { text } = await pptxToText(buffer);

    expect(text).toContain('Speaker notes: Nhấn mạnh phần mã hoá.');
  });

  it('decodes entities', async () => {
    const buffer = await deck({
      'ppt/slides/slide1.xml': slideXml(paragraphs('Bên A &amp; Bên B')),
    });

    expect((await pptxToText(buffer)).text).toContain('Bên A & Bên B');
  });

  it('returns nothing for a deck with no slides', async () => {
    expect(await pptxToText(await deck({ 'docProps/app.xml': '<x/>' }))).toEqual({
      text: '',
      slideCount: 0,
    });
  });
});
