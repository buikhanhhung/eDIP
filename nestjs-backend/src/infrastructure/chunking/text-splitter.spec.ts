import { ChunkingService } from './chunking.service';
import { splitText } from './text-splitter';

const paragraph = (label: string, length: number) => `${label} `.repeat(length).trim();

describe('splitText', () => {
  it('keeps a short document as one chunk', () => {
    expect(splitText('Một đoạn ngắn.')).toEqual(['Một đoạn ngắn.']);
  });

  it('drops empty paragraphs rather than emitting blank chunks', () => {
    const chunks = splitText('A\n\n\n\n   \n\nB');
    expect(chunks).toEqual(['A\n\nB']);
  });

  it('splits once the size budget is exceeded', () => {
    const text = [paragraph('alpha', 100), paragraph('beta', 100), paragraph('gamma', 100)].join(
      '\n\n',
    );
    const chunks = splitText(text, 700, 0);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.trim().length > 0)).toBe(true);
  });

  it('carries an overlap so a boundary sentence survives in one piece', () => {
    const text = [paragraph('alpha', 100), paragraph('beta', 100)].join('\n\n');
    const [first, second] = splitText(text, 500, 100);

    expect(second.startsWith(first.slice(-100))).toBe(true);
  });

  it('leaves an oversized paragraph whole rather than cutting mid-word', () => {
    const huge = paragraph('dài', 2000);
    expect(splitText(huge, 1000)).toEqual([huge]);
  });
});

/**
 * The registry must not change what the corpus already looks like. Until a
 * second strategy exists, `RECURSIVE_CHARACTER` *is* `splitText`, and this
 * describe block is what says so — element by element, on the inputs that
 * exercise each branch of the splitter.
 */
describe('RECURSIVE_CHARACTER equals splitText', () => {
  const service = new ChunkingService();

  const cases: [label: string, text: string][] = [
    ['empty', ''],
    ['one paragraph', 'Một đoạn ngắn.'],
    ['several paragraphs', 'A\n\nB\n\n\n\n   \n\nC'],
    ['a paragraph longer than the size budget', paragraph('dài', 2000)],
    [
      'Vietnamese diacritics and decimal amounts',
      'Hợp đồng số 12/2026.\n\nGiá trị 1.850.000 VND, thanh toán trong 30 ngày.',
    ],
  ];

  it.each(cases)('matches on %s', async (_label, text) => {
    expect(await service.split(text, 'RECURSIVE_CHARACTER')).toEqual(
      splitText(text).map((content) => ({ content })),
    );
  });
});

/**
 * The block above proves the registry reaches `splitText` and adds nothing on
 * the way back. It cannot prove *what* `splitText` returns — it derives the
 * expectation by running it. These two pin the output itself, at the production
 * defaults (`size = 1000`, `overlap = 100`), from the inputs alone.
 *
 * The distinction is not academic: a later strategy that reaches for
 * `splitText` with its own size and overlap could change the default path, and
 * every equivalence case above would still pass while the corpus re-chunked.
 */
describe('RECURSIVE_CHARACTER output at the production defaults', () => {
  const service = new ChunkingService();

  it('joins paragraphs that fit the budget into one chunk', async () => {
    const text = 'Hợp đồng số 12/2026.\n\nGiá trị 1.850.000 VND, thanh toán trong 30 ngày.';

    expect(await service.split(text, 'RECURSIVE_CHARACTER')).toEqual([
      { content: 'Hợp đồng số 12/2026.\n\nGiá trị 1.850.000 VND, thanh toán trong 30 ngày.' },
    ]);
  });

  it('cuts at the budget and carries a 100-character tail into the next chunk', async () => {
    const first = paragraph('alpha', 100);
    const second = paragraph('beta', 100);

    expect(await service.split(`${first}\n\n${second}`, 'RECURSIVE_CHARACTER')).toEqual([
      { content: first },
      { content: `${first.slice(-100)}\n\n${second}` },
    ]);
  });
});
