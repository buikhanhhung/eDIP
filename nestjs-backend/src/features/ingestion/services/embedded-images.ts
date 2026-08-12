import { extractImages } from 'unpdf';
import type { VisionImage, VisionImageFormat } from '@infrastructure/ai/ai.port';
import { ensurePdfjs } from './pdfjs-init';

/** How many images ride along in one vision request. */
export const VISION_BATCH_SIZE = 4;

/** Marks generated text so nothing quoting a document mistakes it for source. */
export const DESCRIPTION_PREFIX = '[Image description]';

const SUPPORTED_CONTENT_TYPES: Record<string, VisionImageFormat> = {
  'image/png': 'png',
  'image/jpeg': 'jpeg',
  'image/jpg': 'jpeg',
  'image/webp': 'webp',
};

/** A docx image is already encoded, so its bytes pass straight through. */
export function toVisionImage(contentType: string, bytes: Buffer): VisionImage | null {
  const format = SUPPORTED_CONTENT_TYPES[contentType.toLowerCase()];
  if (!format || bytes.length === 0) return null;
  return { bytes, format };
}

/**
 * Pulls every embedded image out of a PDF, page by page.
 *
 * unpdf hands back raw pixel planes rather than an encoded file, so each one is
 * painted onto a canvas and encoded as PNG before it can be sent anywhere. A
 * page that throws is skipped rather than failing the document: an unreadable
 * XObject is a missing picture, not a broken PDF.
 */
export async function extractPdfImages(buffer: Buffer, pages: number): Promise<VisionImage[]> {
  await ensurePdfjs();
  const { createCanvas, ImageData } = await import('@napi-rs/canvas');
  const images: VisionImage[] = [];

  for (let page = 1; page <= pages; page += 1) {
    let extracted: Awaited<ReturnType<typeof extractImages>>;
    try {
      extracted = await extractImages(new Uint8Array(buffer), page);
    } catch {
      continue;
    }

    for (const image of extracted) {
      const rgba = toRgba(image.data, image.channels, image.width, image.height);
      if (!rgba) continue;

      const canvas = createCanvas(image.width, image.height);
      canvas.getContext('2d').putImageData(new ImageData(rgba, image.width, image.height), 0, 0);
      const png = await canvas.encode('png');
      if (png.length > 0) images.push({ bytes: Buffer.from(png), format: 'png' });
    }
  }

  return images;
}

/** Canvas takes RGBA only, so greyscale and RGB planes are widened to it. */
function toRgba(
  data: Uint8ClampedArray,
  channels: 1 | 3 | 4,
  width: number,
  height: number,
): Uint8ClampedArray | null {
  const pixels = width * height;
  if (pixels === 0 || data.length < pixels * channels) return null;
  if (channels === 4) return data;

  const rgba = new Uint8ClampedArray(pixels * 4);
  for (let i = 0; i < pixels; i += 1) {
    const source = i * channels;
    const target = i * 4;
    rgba[target] = data[source];
    rgba[target + 1] = channels === 1 ? data[source] : data[source + 1];
    rgba[target + 2] = channels === 1 ? data[source] : data[source + 2];
    rgba[target + 3] = 255;
  }
  return rgba;
}

/** Splits into request-sized groups, so one call covers several images. */
export function batch<T>(items: T[], size = VISION_BATCH_SIZE): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) batches.push(items.slice(i, i + size));
  return batches;
}

/**
 * Renders one image's contribution to the document text.
 *
 * Both halves are indexed, because an image with no text still has to be
 * findable — but the generated half says so, so a citation can never present a
 * model's sentence as something the document said.
 */
export function renderReading(reading: { transcription: string; description: string }): string {
  const parts: string[] = [];
  if (reading.transcription.trim().length > 0) parts.push(reading.transcription.trim());
  if (reading.description.trim().length > 0) {
    parts.push(`${DESCRIPTION_PREFIX} ${reading.description.trim()}`);
  }
  return parts.join('\n');
}
