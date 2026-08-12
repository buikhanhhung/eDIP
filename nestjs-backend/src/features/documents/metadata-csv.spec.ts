import { toMetadataCsv, type ExportedDocument } from './metadata-csv';

function document(overrides: Partial<ExportedDocument> = {}): ExportedDocument {
  return {
    filename: 'hop-dong.md',
    title: 'HỢP ĐỒNG DỊCH VỤ',
    documentType: 'contract',
    typeConfidence: 0.95,
    status: 'completed',
    error: null,
    language: 'vi',
    metadata: {},
    uploadedAt: new Date('2026-03-15T08:00:00.000Z'),
    processedAt: new Date('2026-03-15T08:00:05.000Z'),
    owner: { email: 'admin@ecloudvalley.demo' },
    ...overrides,
  };
}

const lines = (csv: string) => csv.replace(/^﻿/, '').trim().split('\r\n');

describe('toMetadataCsv', () => {
  it('starts with a UTF-8 byte order mark', () => {
    // Without it Excel on Windows reads the file as the system code page and
    // every Vietnamese name in the export arrives mangled.
    const csv = toMetadataCsv([document()]);

    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(Buffer.from(csv, 'utf8').subarray(0, 3).toString('hex')).toBe('efbbbf');
  });

  it('writes a header and one row per document', () => {
    const rows = lines(toMetadataCsv([document(), document({ filename: 'hoa-don.md' })]));

    expect(rows[0]).toBe(
      'filename,title,type,type_confidence,status,error,language,parties,' +
        'document_date,amount,keywords,uploaded_by,uploaded_at,processed_at',
    );
    expect(rows).toHaveLength(3);
  });

  it('keeps Vietnamese text intact', () => {
    const csv = toMetadataCsv([document()]);

    expect(csv).toContain('HỢP ĐỒNG DỊCH VỤ');
  });

  it('joins list metadata with semicolons so the comma stays the separator', () => {
    const csv = toMetadataCsv([
      document({ metadata: { parties: ['Ecloudvalley Vietnam', 'Saigon Retail JSC'] } }),
    ]);

    expect(csv).toContain('Ecloudvalley Vietnam; Saigon Retail JSC');
  });

  it('quotes a value containing a comma, and doubles an inner quote', () => {
    const csv = toMetadataCsv([document({ title: 'Báo cáo "Quý 1", bản cuối' })]);

    expect(csv).toContain('"Báo cáo ""Quý 1"", bản cuối"');
  });

  it('quotes a cell that would otherwise be run as a formula', () => {
    // A spreadsheet treats a leading = or + as an expression, which turns a
    // filename into code the moment someone opens the export.
    const csv = toMetadataCsv([document({ filename: '=SUM(A1:A9)' })]);

    expect(csv).toContain('"=SUM(A1:A9)"');
  });

  it('leaves an unprocessed document with empty cells rather than "null"', () => {
    const csv = toMetadataCsv([
      document({ title: null, documentType: null, typeConfidence: null, processedAt: null }),
    ]);

    expect(csv).not.toContain('null');
    expect(csv).not.toContain('undefined');
  });

  it('writes only a header when there is nothing to export', () => {
    expect(lines(toMetadataCsv([]))).toHaveLength(1);
  });
});
