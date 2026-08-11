import type { ImageFormat } from '@aws-sdk/client-bedrock-runtime';
import { Injectable, Logger } from '@nestjs/common';
import type { TextSource } from '@prisma/client';
import mammoth from 'mammoth';
import { extractText, renderPageAsImage } from 'unpdf';
import { BedrockVisionService } from '@infrastructure/bedrock/bedrock-vision.service';
import { allowedTypeFor, extensionOf, rejectionMessage } from '@infrastructure/storage/allowlist';
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

const IMAGE_FORMATS: Record<string, ImageFormat> = {
  png: 'png',
  jpg: 'jpeg',
  jpeg: 'jpeg',
  webp: 'webp',
};

/**
 * Routes a file to the right reader and returns real text.
 *
 * Nothing here invents content: a file that cannot be read throws, and the
 * consumer records that as the document's failure. No path returns empty text
 * successfully — that is the invariant the asserts below defend.
 */
@Injectable()
export class TextExtractionService {
  private readonly logger = new Logger(TextExtractionService.name);

  constructor(private readonly vision: BedrockVisionService) {}

  async extract(buffer: Buffer, filename: string): Promise<ExtractionResult> {
    const allowed = allowedTypeFor(filename);
    if (!allowed) throw new Error(rejectionMessage(filename));

    switch (allowed.tier) {
      case 'native':
        return { text: buffer.toString('utf8'), textSource: 'native' };
      case 'docx': {
        const { value } = await mammoth.extractRawText({ buffer });
        return { text: value, textSource: 'docx' };
      }
      case 'pdf':
        return this.extractPdf(buffer);
      case 'image':
        return this.extractImage(buffer, filename);
    }
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

    if (hasTextLayer) {
      return { text: pageTexts.join('\n\n'), textSource: 'pdf_text' };
    }

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

  private async extractImage(buffer: Buffer, filename: string): Promise<ExtractionResult> {
    const format = IMAGE_FORMATS[extensionOf(filename)];
    if (!format) throw new Error(rejectionMessage(filename));

    const text = await this.vision.transcribe([{ bytes: buffer, format }]);
    if (text.trim().length === 0) {
      throw new Error('No text could be recognised in this image');
    }
    return { text, textSource: 'vision' };
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
