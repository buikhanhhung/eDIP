import { Inject, Injectable, Logger } from '@nestjs/common';
import type { TextSource } from '@prisma/client';
import mammoth from 'mammoth';
import { extractText, extractTextItems, getDocumentProxy, renderPageAsImage } from 'unpdf';
import { VISION_SERVICE } from '@infrastructure/ai/ai.di-token';
import type { ImageReading, IVisionService, VisionImage } from '@infrastructure/ai/ai.port';
import { allowedTypeFor, extensionOf, rejectionMessage } from '@infrastructure/storage/allowlist';
import { docxHtmlToText } from './docx-html-to-text';
import {
  batch,
  extractPdfImages,
  renderReading,
  toVisionImage,
  unreadableImageNote,
} from './embedded-images';
import { cropTableRegions } from './pdf-crop';
import {
  pageItemsToText,
  TABULAR_PAGE_COVERAGE,
  type PageText,
  type TableRegion,
  type TextItem,
} from './pdf-tables';
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
    // `image` is null for a format no provider takes; the entry is still kept
    // so the picture leaves a mark rather than vanishing.
    const collected: { marker: string; image: VisionImage | null; contentType: string }[] = [];

    const { value: html } = await mammoth.convertToHtml(
      { buffer },
      {
        convertImage: mammoth.images.imgElement(async (image) => {
          const bytes = await image.readAsBuffer();
          const marker = `__EDIP_IMAGE_${collected.length}__`;
          collected.push({
            marker,
            image: toVisionImage(image.contentType, bytes),
            contentType: image.contentType,
          });
          return { src: '', alt: marker };
        }),
      },
    );

    const value = docxHtmlToText(html);
    if (collected.length === 0) return { text: value, textSource: 'docx' };

    const readable = collected.filter((entry) => entry.image !== null);
    const readings = await this.readAll(readable.map((entry) => entry.image as VisionImage));
    const byMarker = new Map(readable.map((entry, index) => [entry.marker, readings[index]]));

    // Substituting on the bare marker rather than the surrounding markup keeps
    // this working whichever way the writer chose to render the image.
    let text = value;
    const orphans: string[] = [];
    for (const entry of collected) {
      const reading = byMarker.get(entry.marker);
      const rendered = reading ? renderReading(reading) : unreadableImageNote(entry.contentType);
      if (text.includes(entry.marker)) {
        text = text.replaceAll(entry.marker, rendered);
      } else if (rendered.length > 0) {
        orphans.push(rendered);
      }
    }
    if (orphans.length > 0) text = `${text}\n\n${orphans.join('\n\n')}`;

    const skipped = collected.length - readable.length;
    this.logger.log(
      `docx: read ${readable.length} embedded image(s)` +
        (skipped > 0 ? `, noted ${skipped} in a format vision cannot take` : ''),
    );
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
   * images are read separately and joined back on.
   *
   * They land at the foot of their own page rather than inline. The PDF gives
   * no finer anchor than that — a page's text and its images arrive as two
   * separate lists, and the image list carries no coordinates — but page is
   * near enough that a picture stays with the text it belongs to instead of
   * drifting to the end of a thirty-page report.
   */
  private async extractBornDigitalPdf(
    buffer: Buffer,
    pageTexts: string[],
  ): Promise<ExtractionResult> {
    const pages = (await this.rebuildTables(buffer, pageTexts)) ?? pageTexts;

    let imagesByPage: VisionImage[][] = [];
    try {
      imagesByPage = await extractPdfImages(buffer, pageTexts.length);
    } catch (error) {
      // A picture that will not decode is not worth losing the document over.
      this.logger.warn(`could not extract embedded images: ${(error as Error).message}`);
    }

    const flat = imagesByPage.flat();
    if (flat.length === 0) {
      return { text: joinPages(pages), textSource: 'pdf_text' };
    }

    // One pass over every image in the document, so the batches stay full even
    // when the pictures are spread a page apart.
    const readings = await this.readAll(flat);
    let taken = 0;
    const withImages = pages.map((page, index) => {
      const count = imagesByPage[index]?.length ?? 0;
      const rendered = readings
        .slice(taken, taken + count)
        .map(renderReading)
        .filter(Boolean);
      taken += count;
      return rendered.length > 0 ? `${page}\n\n${rendered.join('\n\n')}` : page;
    });

    this.logger.log(`pdf: read ${flat.length} embedded image(s) across ${pages.length} page(s)`);
    return { text: joinPages(withImages), textSource: 'pdf_text' };
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

  /**
   * Re-reads the page from positioned text items so grids come back as
   * markdown tables. `extractText` keeps rows but joins cells with spaces,
   * which leaves no way to tell an item's name from the figure beside it.
   *
   * Returns null rather than throwing: this is a better rendering of text the
   * caller already has, so a PDF whose item stream will not read should fall
   * back to that text, not fail.
   */
  private async rebuildTables(buffer: Buffer, pageTexts: string[]): Promise<string[] | null> {
    try {
      // A document proxy, not the raw bytes: handing `extractTextItems` a
      // Uint8Array makes pdfjs structured-clone its own worker port and throw.
      const proxy = await getDocumentProxy(new Uint8Array(buffer));
      const { items } = await extractTextItems(proxy);
      const parsed = items.map((page) => pageItemsToText(page as TextItem[]));

      // Page by page, and only where the page really is a table. pdfjs
      // recovers reading order across a multi-panel layout; sweeping the item
      // stream top to bottom reads straight across those panels and
      // interleaves them. So the rebuilt page is taken only when the grid is
      // most of what is on it, and prose keeps the renderer that gets it right.
      const tabular = parsed.map(
        (page) => page.tables.length > 0 && page.tableCoverage >= TABULAR_PAGE_COVERAGE,
      );
      if (!tabular.some(Boolean)) return null;

      await this.readTablesWithVision(buffer, parsed, tabular);

      const pages = parsed.map((page, index) =>
        tabular[index] ? page.blocks.join('\n') : (pageTexts[index] ?? page.blocks.join('\n')),
      );
      this.logger.log(`pdf: rebuilt tables on ${tabular.filter(Boolean).length} page(s)`);
      return pages;
    } catch (error) {
      this.logger.warn(`could not rebuild tables from item positions: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * Replaces each detected table with the model's reading of a picture of it.
   *
   * Coordinates locate a grid reliably but cannot say what a merged cell
   * spans — the PDF holds no such fact, only a wider run of text. Cropping the
   * table out of the rendered page and handing that to vision recovers it,
   * along with ruled lines the text layer never mentions.
   *
   * Failure is silent by design: the coordinate-built table is already in
   * place, so anything that goes wrong here leaves a usable table rather than
   * none. Every crop in the document goes in one request.
   */
  private async readTablesWithVision(
    buffer: Buffer,
    parsed: PageText[],
    tabular: boolean[],
  ): Promise<void> {
    const crops: { page: number; region: TableRegion; image: VisionImage }[] = [];

    for (const [index, page] of parsed.entries()) {
      if (!tabular[index]) continue;
      try {
        const rendered = await renderPageAsImage(new Uint8Array(buffer), index + 1, {
          scale: RENDER_SCALE,
          canvasImport: () => import('@napi-rs/canvas'),
        });
        const cut = await cropTableRegions(
          Buffer.from(new Uint8Array(rendered)),
          page.tables,
          RENDER_SCALE,
        );
        crops.push(...cut.map((entry) => ({ page: index, ...entry })));
      } catch (error) {
        this.logger.warn(`page ${index + 1}: could not crop tables: ${(error as Error).message}`);
      }
    }

    if (crops.length === 0) return;

    let readings: ImageReading[];
    try {
      readings = await this.readAll(crops.map((crop) => crop.image));
    } catch (error) {
      this.logger.warn(`vision could not read the tables: ${(error as Error).message}`);
      return;
    }

    let replaced = 0;
    for (const [index, crop] of crops.entries()) {
      // A reply with no pipe is prose, not a table — the coordinate version is
      // the better answer in that case.
      const markdown = readings[index]?.transcription?.trim() ?? '';
      if (!markdown.includes('|')) continue;
      parsed[crop.page].blocks[crop.region.blockIndex] = markdown;
      replaced += 1;
    }

    this.logger.log(`pdf: vision read ${replaced} of ${crops.length} table(s)`);
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

/** Blank-line separated, and pages that read empty are left out entirely. */
function joinPages(pages: string[]): string {
  return pages.filter((page) => page.trim().length > 0).join('\n\n');
}
