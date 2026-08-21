import type { IEmbeddingService } from '@infrastructure/ai/ai.port';
import { semanticChunks, semanticStrategy } from './semantic.strategy';
import { splitSentences } from './sentence-splitter';
import { splitText } from './text-splitter';

/**
 * The only strategy that spends quota, so most of what matters here is when it
 * declines to: too little text to be worth a call, or a provider that failed.
 * Every fallback must land on the same output the default strategy would give,
 * and must say in metadata that it did — a document recorded as SEMANTIC whose
 * chunks were cut some other way is the kind of thing nobody notices.
 */
function embeddingsReturning(vectors: number[][]) {
  const generateEmbeddings = jest.fn().mockResolvedValue(vectors);
  return { service: { generateEmbeddings } as unknown as IEmbeddingService, generateEmbeddings };
}

/** Six sentences: the first three alike, the last three alike but unlike them. */
const SIX_SENTENCES = [
  'Bên A có nghĩa vụ thanh toán đúng hạn theo hợp đồng.',
  'Bên A phải chuyển tiền vào tài khoản đã đăng ký.',
  'Bên A chịu trách nhiệm về mọi khoản phí chuyển khoản.',
  'Thời hạn bảo hành thiết bị là hai mươi bốn tháng.',
  'Bảo hành không áp dụng cho hư hỏng do người dùng gây ra.',
  'Bảo hành được gia hạn nếu hai bên có thoả thuận riêng.',
].join(' ');

const ALIKE = [1, 0];
const DIFFERENT = [0, 1];

describe('semanticStrategy', () => {
  it('cuts where the meaning changes, not where the length runs out', async () => {
    const { service, generateEmbeddings } = embeddingsReturning([
      ALIKE,
      ALIKE,
      ALIKE,
      DIFFERENT,
      DIFFERENT,
      DIFFERENT,
    ]);

    const chunks = await semanticChunks(SIX_SENTENCES, service, {
      targetChars: 160,
      minChars: 100,
    });

    expect(chunks).toHaveLength(2);
    expect(chunks[0].content).toContain('Bên A có nghĩa vụ');
    expect(chunks[0].content).toContain('mọi khoản phí');
    expect(chunks[0].content).not.toContain('bảo hành thiết bị');
    expect(chunks[1].content).toContain('Thời hạn bảo hành');
    expect(generateEmbeddings).toHaveBeenCalledTimes(1);
  });

  it('asks for every sentence in one call rather than one call each', async () => {
    const { service, generateEmbeddings } = embeddingsReturning(
      Array.from({ length: 6 }, () => ALIKE),
    );

    await semanticStrategy(SIX_SENTENCES, service);

    expect(generateEmbeddings).toHaveBeenCalledTimes(1);
    const [texts] = generateEmbeddings.mock.calls[0] as [string[]];
    expect(Array.isArray(texts)).toBe(true);
    expect(texts).toHaveLength(6);
  });

  it('spends nothing on a document too short to be worth embedding', async () => {
    const { service, generateEmbeddings } = embeddingsReturning([]);
    const short = 'Câu một ở đây. Câu hai ở đây. Câu ba ở đây.';

    const chunks = await semanticStrategy(short, service);

    expect(generateEmbeddings).not.toHaveBeenCalled();
    expect(chunks.map((chunk) => chunk.content)).toEqual(splitText(short));
    expect(chunks[0].metadata?.fellBackTo).toBe('RECURSIVE_CHARACTER');
  });

  it('falls back to the default cut when the provider fails, without throwing', async () => {
    const generateEmbeddings = jest.fn().mockRejectedValue(new Error('429 rate limit exceeded'));
    const service = { generateEmbeddings } as unknown as IEmbeddingService;

    const chunks = await semanticStrategy(SIX_SENTENCES, service);

    expect(chunks.map((chunk) => chunk.content)).toEqual(splitText(SIX_SENTENCES));
    expect(chunks[0].metadata?.fellBackTo).toBe('RECURSIVE_CHARACTER');
    expect(String(chunks[0].metadata?.fallbackReason)).toContain('429');
  });

  it('falls back when the provider returns the wrong number of vectors', async () => {
    const { service } = embeddingsReturning([ALIKE, ALIKE]);

    const chunks = await semanticStrategy(SIX_SENTENCES, service);

    expect(chunks.map((chunk) => chunk.content)).toEqual(splitText(SIX_SENTENCES));
    expect(chunks[0].metadata?.fellBackTo).toBe('RECURSIVE_CHARACTER');
  });

  it('records how it cut when it did use the embeddings', async () => {
    const { service } = embeddingsReturning(Array.from({ length: 6 }, () => ALIKE));

    const chunks = await semanticStrategy(SIX_SENTENCES, service);

    expect(chunks[0].metadata).toMatchObject({ chunkingStrategy: 'SEMANTIC' });
    expect(chunks[0].metadata?.fellBackTo).toBeUndefined();
  });

  it('keeps every sentence, in order, across the chunks it produced', async () => {
    const { service } = embeddingsReturning([ALIKE, ALIKE, ALIKE, DIFFERENT, DIFFERENT, DIFFERENT]);

    const chunks = await semanticChunks(SIX_SENTENCES, service, {
      targetChars: 160,
      minChars: 100,
    });

    expect(chunks.map((chunk) => chunk.content).join(' ')).toBe(SIX_SENTENCES);
  });

  it('returns nothing for empty input without calling the provider', async () => {
    const { service, generateEmbeddings } = embeddingsReturning([]);

    expect(await semanticStrategy('   \n\n ', service)).toEqual([]);
    expect(generateEmbeddings).not.toHaveBeenCalled();
  });
});

describe('splitSentences', () => {
  it('does not cut inside a Vietnamese amount', () => {
    // The thousands separators have no space after them, which is what keeps
    // them out of the sentence boundary.
    expect(splitSentences('Giá trị 1.850.000 VND đã bao gồm thuế.')).toEqual([
      'Giá trị 1.850.000 VND đã bao gồm thuế.',
    ]);
  });

  it('cuts on sentence punctuation followed by a space', () => {
    expect(splitSentences('Điều một quy định rõ. Điều hai quy định thêm!')).toEqual([
      'Điều một quy định rõ.',
      'Điều hai quy định thêm!',
    ]);
  });

  it('folds an abbreviation back instead of leaving it as a sentence', () => {
    // `TP.` would otherwise become a sentence of its own and be embedded as one.
    const sentences = splitSentences('Công ty đặt tại TP. Hồ Chí Minh theo giấy phép.');

    expect(sentences).toHaveLength(1);
    expect(sentences[0]).toContain('TP. Hồ Chí Minh');
  });

  it('folds a short leading fragment into the sentence after it', () => {
    const sentences = splitSentences('TS. Nguyễn Văn A là người đại diện theo pháp luật.');

    expect(sentences).toHaveLength(1);
    expect(sentences[0].startsWith('TS.')).toBe(true);
  });

  it('returns nothing for blank input', () => {
    expect(splitSentences('  \n ')).toEqual([]);
  });
});

describe('semanticChunks guards', () => {
  it('declines a document with more sentences than it will embed', async () => {
    const { service, generateEmbeddings } = embeddingsReturning([]);
    const many = Array.from(
      { length: 40 },
      (_, i) => `Câu số ${i} trong tài liệu rất dài này.`,
    ).join(' ');

    const chunks = await semanticChunks(many, service, { maxSentences: 20 });

    // Refused before the call, not after: the point is the quota not spent.
    expect(generateEmbeddings).not.toHaveBeenCalled();
    expect(chunks[0].metadata?.fellBackTo).toBe('RECURSIVE_CHARACTER');
    expect(String(chunks[0].metadata?.fallbackReason)).toContain('exceeds');
  });
});

/**
 * The splitter is the only place document text can go missing, and the
 * strategy-level test above cannot see it: every sentence in that fixture is
 * long, so the trailing-fragment path never runs.
 */
describe('splitSentences preserves the text it was given', () => {
  const cases = [
    'Một câu đầy đủ ở đây. Một câu nữa cũng đủ dài.',
    'Câu dài đầu tiên ở đây. TS.',
    'TS.',
    'Không có dấu chấm câu nào ở đây cả',
    'Câu một ở đây rồi. Ok.',
    'Giá 1.850.000 đồng. Đã gồm thuế. TP. Hồ Chí Minh.',
  ];

  it.each(cases)('loses no words from %s', (text) => {
    const rejoined = splitSentences(text).join(' ');
    const words = (value: string) => value.split(/\s+/).filter(Boolean);

    expect(words(rejoined)).toEqual(words(text));
  });

  it('never returns an empty sentence', () => {
    for (const text of cases) {
      expect(splitSentences(text).every((sentence) => sentence.trim().length > 0)).toBe(true);
    }
  });
});
