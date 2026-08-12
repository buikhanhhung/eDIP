import { FOLDER_MIME, folderQuery, planImport } from './google-drive-files';

const file = (name: string, mimeType: string) => ({ id: 'x', name, mimeType });

describe('planImport', () => {
  it('downloads an ordinary file the pipeline can read', () => {
    expect(planImport(file('hop-dong.pdf', 'application/pdf'))).toEqual({
      action: 'download',
      filename: 'hop-dong.pdf',
    });
  });

  it('exports a Google Doc as docx, so its tables survive', () => {
    // A native doc has no bytes to download, and exporting to plain text would
    // throw away every table in it.
    const plan = planImport(file('Hợp đồng dịch vụ', 'application/vnd.google-apps.document'));

    expect(plan).toEqual({
      action: 'export',
      filename: 'Hợp đồng dịch vụ.docx',
      exportMimeType:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
  });

  it('exports a Sheet as xlsx and a Slides deck as pptx', () => {
    expect(planImport(file('Bảng giá', 'application/vnd.google-apps.spreadsheet'))).toMatchObject({
      filename: 'Bảng giá.xlsx',
    });
    expect(planImport(file('Giới thiệu', 'application/vnd.google-apps.presentation'))).toMatchObject(
      { filename: 'Giới thiệu.pptx' },
    );
  });

  it('does not double the extension when a native doc already carries one', () => {
    const plan = planImport(file('bao.cao.2026', 'application/vnd.google-apps.document'));

    expect(plan).toMatchObject({ filename: 'bao.cao.docx' });
  });

  it('skips a folder', () => {
    expect(planImport(file('Hợp đồng', FOLDER_MIME))).toEqual({
      action: 'skip',
      reason: 'Folder',
    });
  });

  it('skips a Google format with no document equivalent', () => {
    const plan = planImport(file('Sơ đồ', 'application/vnd.google-apps.drawing'));

    expect(plan).toMatchObject({ action: 'skip' });
  });

  it('skips a type the extractor would refuse anyway', () => {
    // Decided by extension here exactly as it is on upload, so nothing can be
    // accepted from Drive that the pipeline would then reject.
    expect(planImport(file('setup.exe', 'application/octet-stream'))).toMatchObject({
      action: 'skip',
      reason: 'Unsupported file type',
    });
  });

  it('accepts the office formats that arrive as real files', () => {
    for (const name of ['a.docx', 'b.xlsx', 'c.pptx']) {
      expect(planImport(file(name, 'application/octet-stream'))).toMatchObject({
        action: 'download',
      });
    }
  });
});

describe('folderQuery', () => {
  it('asks for the children of a folder, excluding the bin', () => {
    expect(folderQuery('abc123')).toBe("'abc123' in parents and trashed = false");
  });

  it('escapes a quote so an id cannot rewrite the query', () => {
    expect(folderQuery("a'b")).toBe("'a\\'b' in parents and trashed = false");
  });
});
