import { pageItemsToText, TABULAR_PAGE_COVERAGE, type TextItem } from './pdf-tables';

/** Builds a page of items at explicit coordinates, the way a PDF holds them. */
function page(rows: { y: number; cells: { x: number; str: string }[] }[]): TextItem[] {
  return rows.flatMap((row) =>
    row.cells.map((cell) => ({ str: cell.str, x: cell.x, y: row.y, fontSize: 12 })),
  );
}

describe('pageItemsToText', () => {
  it('rebuilds an aligned grid as a markdown table', () => {
    const result = pageItemsToText(
      page([
        { y: 700, cells: [{ x: 60, str: 'Hạng mục' }, { x: 260, str: 'Số lượng' }, { x: 380, str: 'Thành tiền' }] },
        { y: 672, cells: [{ x: 60, str: 'Phí triển khai' }, { x: 260, str: '1' }, { x: 380, str: '120.000.000 VNĐ' }] },
        { y: 644, cells: [{ x: 60, str: 'Phí vận hành' }, { x: 260, str: '12' }, { x: 380, str: '36.000.000 VNĐ' }] },
      ]),
    );

    expect(result.tablesFound).toBe(1);
    expect(result.text).toBe(
      [
        '| Hạng mục | Số lượng | Thành tiền |',
        '| --- | --- | --- |',
        '| Phí triển khai | 1 | 120.000.000 VNĐ |',
        '| Phí vận hành | 12 | 36.000.000 VNĐ |',
      ].join('\n'),
    );
  });

  it('tolerates a column start that drifts by a fraction of the font size', () => {
    const result = pageItemsToText(
      page([
        { y: 700, cells: [{ x: 60, str: 'a' }, { x: 260, str: 'b' }] },
        { y: 672, cells: [{ x: 62, str: 'c' }, { x: 258, str: 'd' }] },
      ]),
    );

    expect(result.tablesFound).toBe(1);
  });

  it('leaves a multi-panel layout below the coverage a rebuild needs', () => {
    // Four panels of prose: lines share a left edge but hold whatever wrapped
    // there, so the cell counts disagree from line to line.
    const result = pageItemsToText(
      page([
        { y: 700, cells: [{ x: 60, str: 'Getting Started' }, { x: 200, str: 'Move Between Branches' }, { x: 380, str: 'Edit History' }] },
        { y: 680, cells: [{ x: 60, str: 'Start a new repo:' }, { x: 200, str: 'Switch branches:' }] },
        { y: 660, cells: [{ x: 60, str: 'git init' }] },
        { y: 640, cells: [{ x: 60, str: 'Clone an existing repo:' }, { x: 200, str: 'git switch <name>' }, { x: 380, str: 'git reset HEAD^' }] },
        { y: 620, cells: [{ x: 60, str: 'git clone <url>' }] },
      ]),
    );

    expect(result.tableCoverage).toBeLessThan(TABULAR_PAGE_COVERAGE);
  });

  it('does not call a run of single-cell lines a table', () => {
    const result = pageItemsToText(
      page([
        { y: 700, cells: [{ x: 60, str: 'một' }] },
        { y: 680, cells: [{ x: 60, str: 'hai' }] },
        { y: 660, cells: [{ x: 60, str: 'ba' }] },
      ]),
    );

    expect(result.tablesFound).toBe(0);
    expect(result.text).toBe('một\nhai\nba');
  });

  it('reads the page from the top down, not in item order', () => {
    const result = pageItemsToText([
      { str: 'dưới', x: 60, y: 100, fontSize: 12 },
      { str: 'trên', x: 60, y: 700, fontSize: 12 },
    ]);

    expect(result.text).toBe('trên\ndưới');
  });

  it('escapes a pipe so a cell cannot open a phantom column', () => {
    const result = pageItemsToText(
      page([
        { y: 700, cells: [{ x: 60, str: 'a|b' }, { x: 260, str: 'c' }] },
        { y: 672, cells: [{ x: 60, str: 'd' }, { x: 260, str: 'e' }] },
      ]),
    );

    expect(result.text).toContain('a\\|b');
  });

  it('returns nothing for a page with no text', () => {
    expect(pageItemsToText([])).toEqual({ text: '', tablesFound: 0, tableCoverage: 0 });
  });
});
