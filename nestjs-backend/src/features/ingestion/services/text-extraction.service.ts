import { Inject, Injectable, Logger } from '@nestjs/common';
import type { TextSource } from '@prisma/client';
import mammoth from 'mammoth';
import { extractText, renderPageAsImage } from 'unpdf';
import { VISION_SERVICE } from '@infrastructure/ai/ai.di-token';
import type { ImageReading, IVisionService, VisionImage } from '@infrastructure/ai/ai.port';
import { allowedTypeFor, extensionOf, rejectionMessage } from '@infrastructure/storage/allowlist';
import { docxHtmlToText } from './docx-html-to-text';
import { batch, extractPdfImages, renderReading, toVisionImage } from './embedded-images';
import { ensurePdfjs } from './pdfjs-init';

export interface ExtractionResult {
  text: string;
  textSource: TextSource;
  /** Non-fatal note worth showing the user, e.g. page truncation. */
  warning?: string;
}

/** Below this many non-whitespace characters, a page counts as an image. */
const MIN_CHARS_PER_PAGE = 100;
/** Rasterising costs ~4 MB a page and a vision call, so this bounds both. */
const MAX_VISION_PAGES = 5;
/** Above 1 the text is legible to the model; 2 is the usual trade. */
const RENDER_SCALE = 2;

const IMAGE_FORMATS: Record<string, VisionImageFormat> = {
  png: 'png',
  jpg: 'jpeg',
  jpeg: 'jpeg',
  webp: 'webp',
};

type VisionImageFormat = VisionImage['format'];

/**
 * Routes a file to the right reader and returns real text.
 *
 * Nothing here invents content *and passes it off as source*: text read out of
 * a file is returned as-is, and anything the model wrote about a picture is
 * prefixed so it stays distinguishable downstream. A file that cannot be read
 * throws, and the consumer records that as the document's failure. No path
 * returns empty text successfully — that is the invariant the asserts defend.
 */
@Injectable()
export class TextExtractionService {
  private readonly logger = new Logger(TextExtractionService.name);

  constructor(@Inject(VISION_SERVICE) private readonly vision: IVisionService) {}

  async extract(buffer: Buffer, filename: string): Promise<ExtractionResult> {
    const allowed = allowedTypeFor(filename);
    if (!allowed) throw new Error(rejectionMessage(filename));

    switch (allowed.tier) {
      case 'native':
        return { text: buffer.toString('utf8'), textSource: 'native' };
      case 'docx':
        return this.extractDocx(buffer);
      case 'pdf':
        return this.extractPdf(buffer);
      case 'image':
        return this.extractImage(buffer, filename);
    }
  }

  /**
   * Via HTML, because that is mammoth's only output that keeps a table.
   * `extractRawText` runs the cells together with no column boundary, and
   * `convertToMarkdown` has no table branch in its writer either.
   */
  private async extractDocx(buffer: Buffer): Promise<ExtractionResult> {
    const collected: { marker: string; image: VisionImage }[] = [];

    const { value: html } = await mammoth.convertToHtml(
      { buffer },
      {
        convertImage: mammoth.images.imgElement(async (image) => {
          const bytes = await image.readAsBuffer();
          const vision = toVisionImage(image.contentType, bytes);
          if (!vision) return { src: '' };

          const marker = `__EDIP_IMAGE_${collected.length}__`;
          collected.push({ marker, image: vision });
          return { src: '', alt: marker };
        }),
      },
    );

    const value = docxHtmlToText(html);
    if (collected.length === 0) return { text: value, textSource: 'docx' };

    const readings = await this.readAll(collected.map((entry) => entry.image));

    // Substituting on the bare marker rather than the surrounding markdown
    // keeps this working whichever way the writer chose to render the image.
    let text = value;
    const orphans: string[] = [];
    for (const [index, entry] of collected.entries()) {
      const rendered = renderReading(readings[index]);
      if (text.includes(entry.marker)) {
        text = text.replaceAll(entry.marker, rendered);
      } else if (rendered.length > 0) {
        orphans.push(rendered);
      }
    }
    if (orphans.length > 0) text = `${text}\n\n${orphans.join('\n\n')}`;

    this.logger.log(`docx: read ${collected.length} embedded image(s)`);
    return { text, textSource: 'docx' };
  }

  private async extractPdf(buffer: Buffer): Promise<ExtractionResult> {
    // Before the first unpdf call of any kind, not just before rendering.
    await ensurePdfjs();

    const { text: pages } = await extractText(new Uint8Array(buffer), { mergePages: false });
    const pageTexts = Array.isArray(pages) ? pages : [pages];

    const meaningful = pageTexts.filter(
      (page) => page.replace(/\s/g, '').length >= MIN_CHARS_PER_PAGE,
    );
    // Majority rule, as in v1: one dense cover page does not make a scanned
    // report readable, and one sparse page does not make a born-digital PDF
    // worth sending through vision.
    const hasTextLayer = meaningful.length >= Math.ceil(pageTexts.length * 0.5);

    if (hasTextLayer) return this.extractBornDigitalPdf(buffer, pageTexts);

    this.logger.log(`no usable text layer across ${pageTexts.length} page(s); rendering for vision`);
    const images = await this.renderPages(buffer, MAX_VISION_PAGES);
    const text = await this.vision.transcribe(images.map((bytes) => ({ bytes, format: 'png' })));

    if (text.trim().length === 0) {
      throw new Error('Vision returned no text for this PDF');
    }

    const truncated = images.length === MAX_VISION_PAGES && pageTexts.length > MAX_VISION_PAGES;
    const warning = truncated
      ? `Only the first ${MAX_VISION_PAGES} of ${pageTexts.length} pages were read.`
      : undefined;

    return {
      text: truncated ? `${text}\n\n[${warning}]` : text,
      textSource: 'vision',
      warning,
    };
  }

  /**
   * The text layer carries the words but not the pictures, so the embedded
   * images are read separately and appended. They cannot be placed inline —
   * the text layer gives no anchor to place them against.
   */
  private async extractBornDigitalPdf(
    buffer: Buffer,
    pageTexts: string[],
  ): Promise<ExtractionResult> {
    const text = pageTexts.join('\n\n');

    let images: VisionImage[] = [];
    try {
      images = await extractPdfImages(buffer, pageTexts.length);
    } catch (error) {
      // A picture that will not decode is not worth losing the document over.
      this.logger.warn(`could not extract embedded images: ${(error as Error).message}`);
    }
    if (images.length === 0) return { text, textSource: 'pdf_text' };

    const rendered = (await this.readAll(images)).map(renderReading).filter(Boolean);
    this.logger.log(`pdf: read ${images.length} embedded image(s)`);

    return {
      text: rendered.length > 0 ? `${text}\n\n${rendered.join('\n\n')}` : text,
      textSource: 'pdf_text',
    };
  }

  /**
   * A standalone image is the document, so it gets both halves: the text on it
   * and what it shows. A photograph carrying no words at all still has to be
   * findable, which transcription alone never made it.
   */
  private async extractImage(buffer: Buffer, filename: string): Promise<ExtractionResult> {
    const format = IMAGE_FORMATS[extensionOf(filename)];
    if (!format) throw new Error(rejectionMessage(filename));

    const [reading] = await this.vision.read([{ bytes: buffer, format }]);
    const text = renderReading(reading);
    if (text.trim().length === 0) {
      throw new Error('Vision could not read or describe this image');
    }
    return { text, textSource: 'vision' };
  }

  /** Several images per request, so image count costs batches, not calls. */
  private async readAll(images: VisionImage[]): Promise<ImageReading[]> {
    const readings: ImageReading[] = [];
    for (const group of batch(images)) {
      readings.push(...(await this.vision.read(group)));
    }
    return readings;
  }

  private async renderPages(buffer: Buffer, maxPages: number): Promise<Buffer[]> {
    await ensurePdfjs();
    const images: Buffer[] = [];

    for (let page = 1; page <= maxPages; page += 1) {
      let rendered: ArrayBuffer;
      try {
        rendered = await renderPageAsImage(new Uint8Array(buffer), page, {
          scale: RENDER_SCALE,
          // Mandatory under Node: unpdf carries no canvas of its own.
          canvasImport: () => import('@napi-rs/canvas'),
        });
      } catch {
        // unpdf exposes no page count here, so running off the end is the
        // termination condition rather than an error.
        break;
      }

      const image = Buffer.from(new Uint8Array(rendered));
      if (image.length === 0) {
        throw new Error(`PDF page ${page} rendered to an empty buffer`);
      }
      images.push(image);
    }

    if (images.length === 0) {
      throw new Error('Could not render any page of this PDF to an image');
    }
    return images;
  }
}
