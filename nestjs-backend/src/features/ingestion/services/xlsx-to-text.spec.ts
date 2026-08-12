import ExcelJS from 'exceljs';
import { MAX_ROWS_PER_SHEET, xlsxToText } from './xlsx-to-text';

/** The reader returns sections so pictures can be attached; tests read them joined. */
const read = async (buffer: Buffer) => {
  const result = await xlsxToText(buffer);
  return { ...result, text: result.sections.join('\n\n') };
};

async function workbook(build: (wb: ExcelJS.Workbook) => void): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  build(wb);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe('xlsxToText', () => {
  it('renders a sheet as a markdown table under its own heading', async () => {
    const buffer = await workbook((wb) => {
      const sheet = wb.addWorksheet('Bảng giá');
      sheet.addRow(['Hạng mục', 'Thành tiền']);
      sheet.addRow(['Phí triển khai', '120.000.000 VNĐ']);
    });

    const { text } = await read(buffer);

    expect(text).toContain('## Bảng giá');
    expect(text).toContain('| Hạng mục | Thành tiền |');
    expect(text).toContain('| Phí triển khai | 120.000.000 VNĐ |');
  });

  it('contributes a formula result rather than its expression', async () => {
    const buffer = await workbook((wb) => {
      const sheet = wb.addWorksheet('Tổng');
      sheet.addRow(['Số lượng', 'Đơn giá', 'Thành tiền']);
      sheet.addRow([12, 3000000, { formula: 'A2*B2', result: 36000000 }]);
    });

    const { text } = await read(buffer);

    expect(text).toContain('36000000');
    expect(text).not.toContain('A2*B2');
  });

  it('spreads a merged cell across the columns it covers', async () => {
    const buffer = await workbook((wb) => {
      const sheet = wb.addWorksheet('Gộp');
      sheet.addRow(['a', 'b', 'c']);
      sheet.mergeCells('A2:C2');
      sheet.getCell('A2').value = 'Tổng cộng';
    });

    const { text } = await read(buffer);

    expect(text).toContain('| Tổng cộng | Tổng cộng | Tổng cộng |');
  });

  it('writes a single-column sheet as lines, not a one-column table', async () => {
    const buffer = await workbook((wb) => {
      const sheet = wb.addWorksheet('Ghi chú');
      sheet.addRow(['Hợp đồng ký ngày 15/03/2026.']);
      sheet.addRow(['Thanh toán theo quý.']);
    });

    const { text } = await read(buffer);

    expect(text).toContain('Hợp đồng ký ngày 15/03/2026.\nThanh toán theo quý.');
    expect(text).not.toContain('| ---');
  });

  it('keeps every sheet, each under its own heading', async () => {
    const buffer = await workbook((wb) => {
      wb.addWorksheet('Một').addRow(['x', 'y']);
      wb.addWorksheet('Hai').addRow(['p', 'q']);
    });

    const { text } = await read(buffer);

    expect(text).toContain('## Một');
    expect(text).toContain('## Hai');
  });

  it('cuts a long sheet and says how much it left', async () => {
    const buffer = await workbook((wb) => {
      const sheet = wb.addWorksheet('Giao dịch');
      sheet.addRow(['Mã', 'Số tiền']);
      for (let i = 0; i < MAX_ROWS_PER_SHEET + 50; i += 1) sheet.addRow([`GD-${i}`, i]);
    });

    const { text, warning } = await read(buffer);

    expect(text).toContain(`Only the first ${MAX_ROWS_PER_SHEET}`);
    expect(warning).toContain('Giao dịch');
    // Never silently: the count of rows read is the cap, and the note says so.
    expect(text.split('\n').filter((line) => line.startsWith('| GD-'))).toHaveLength(
      MAX_ROWS_PER_SHEET - 1,
    );
  });

  it('keeps a sheet picture with the sheet it was drawn on', async () => {
    const png =
      'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mP8z8BQz0AEYBxVSF+FAP5FDvcfRYWgAAAAAElFTkSuQmCC';
    const buffer = await workbook((wb) => {
      wb.addWorksheet('Không hình').addRow(['a', 'b']);
      const withImage = wb.addWorksheet('Có hình');
      withImage.addRow(['a', 'b']);
      withImage.addImage(wb.addImage({ base64: png, extension: 'png' }), {
        tl: { col: 0, row: 3 },
        ext: { width: 100, height: 60 },
      });
    });

    const { sections, imagesBySection } = await xlsxToText(buffer);

    expect(sections).toHaveLength(2);
    expect(imagesBySection[0]).toHaveLength(0);
    expect(imagesBySection[1]).toHaveLength(1);
    expect(imagesBySection[1][0].format).toBe('png');
  });

  it('escapes a pipe inside a cell', async () => {
    const buffer = await workbook((wb) => {
      const sheet = wb.addWorksheet('S');
      sheet.addRow(['a|b', 'c']);
      sheet.addRow(['d', 'e']);
    });

    expect((await read(buffer)).text).toContain('a\\|b');
  });
});
