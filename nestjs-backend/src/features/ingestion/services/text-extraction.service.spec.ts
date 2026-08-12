import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { ImageReading, IVisionService, VisionImage } from '@infrastructure/ai/ai.port';
import { DESCRIPTION_PREFIX } from './embedded-images';
import { TextExtractionService } from './text-extraction.service';

/** Records what it was handed so the batching and ordering can be asserted. */
class FakeVision implements IVisionService {
  readonly readCalls: VisionImage[][] = [];
  constructor(private readonly readings: ImageReading[] = []) {}

  transcribe(): Promise<string> {
    throw new Error('not used in these tests');
  }

  read(images: VisionImage[]): Promise<ImageReading[]> {
    this.readCalls.push(images);
    const start = this.readCalls.slice(0, -1).reduce((sum, call) => sum + call.length, 0);
    return Promise.resolve(
      images.map(
        (_, index) =>
          this.readings[start + index] ?? { transcription: '', description: 'mô tả mặc định' },
      ),
    );
  }
}

const FIXTURE = path.join(__dirname, '__fixtures__', 'contract-with-table.docx');

describe('TextExtractionService — docx', () => {
  it('keeps a table as a markdown table instead of running the cells together', async () => {
    const vision = new FakeVision([{ transcription: '', description: 'sơ đồ kiến trúc hệ thống' }]);
    const service = new TextExtractionService(vision);

    const { text, textSource } = await service.extract(readFileSync(FIXTURE), 'contract.docx');

    expect(textSource).toBe('docx');
    expect(text).toContain('| Hạng mục | Số lượng | Thành tiền |');
    expect(text).toContain('| Phí triển khai | 1 | 120.000.000 VNĐ |');
    expect(text).toContain('| Phí vận hành | 12 | 36.000.000 VNĐ |');
  });

  it('replaces the embedded image with its reading, in place', async () => {
    const vision = new FakeVision([{ transcription: '', description: 'sơ đồ kiến trúc hệ thống' }]);
    const service = new TextExtractionService(vision);

    const { text } = await service.extract(readFileSync(FIXTURE), 'contract.docx');

    expect(text).toContain(`${DESCRIPTION_PREFIX} sơ đồ kiến trúc hệ thống`);
    // No placeholder survives into the indexed text.
    expect(text).not.toContain('__EDIP_IMAGE_');
    // And it lands where the picture was, between its caption and the closing
    // line, so the description reads as part of the document's flow.
    expect(text.indexOf('Sơ đồ kiến trúc:')).toBeLessThan(text.indexOf(DESCRIPTION_PREFIX));
    expect(text.indexOf(DESCRIPTION_PREFIX)).toBeLessThan(text.indexOf('Hết.'));
  });

  it('indexes text found on an image alongside the generated description', async () => {
    const vision = new FakeVision([
      { transcription: 'Client → API → Postgres', description: 'sơ đồ luồng dữ liệu' },
    ]);
    const service = new TextExtractionService(vision);

    const { text } = await service.extract(readFileSync(FIXTURE), 'contract.docx');

    expect(text).toContain('Client → API → Postgres');
    expect(text).toContain(`${DESCRIPTION_PREFIX} sơ đồ luồng dữ liệu`);
  });

  it('sends embedded images in one request rather than one call each', async () => {
    const vision = new FakeVision();
    const service = new TextExtractionService(vision);

    await service.extract(readFileSync(FIXTURE), 'contract.docx');

    expect(vision.readCalls).toHaveLength(1);
    expect(vision.readCalls[0]).toHaveLength(1);
    expect(vision.readCalls[0][0].format).toBe('png');
  });
});

describe('TextExtractionService — standalone image', () => {
  it('keeps an image findable through its description when it carries no text', async () => {
    const vision = new FakeVision([
      { transcription: '', description: 'ảnh chụp một toà nhà văn phòng' },
    ]);
    const service = new TextExtractionService(vision);

    const { text, textSource } = await service.extract(Buffer.from([1, 2, 3]), 'photo.jpg');

    expect(textSource).toBe('vision');
    expect(text).toBe(`${DESCRIPTION_PREFIX} ảnh chụp một toà nhà văn phòng`);
  });

  it('fails only when the image yields neither text nor a description', async () => {
    const vision = new FakeVision([{ transcription: '', description: '' }]);
    const service = new TextExtractionService(vision);

    await expect(service.extract(Buffer.from([1, 2, 3]), 'photo.jpg')).rejects.toThrow(
      /could not read or describe/i,
    );
  });
});
