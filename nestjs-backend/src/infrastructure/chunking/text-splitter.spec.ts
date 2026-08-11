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
