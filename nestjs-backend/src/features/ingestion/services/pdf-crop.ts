import type { VisionImage } from '@infrastructure/ai/ai.port';
import type { TableRegion } from './pdf-tables';

/** Below this a crop is a rounding artefact, not a table. */
const MIN_CROP_PIXELS = 8;

/**
 * Cuts each table out of a rendered page so a vision model can read it.
 *
 * Coordinates find the grid reliably but cannot resolve what a merged cell
 * spans — a PDF stores no such thing, only a wider run of text. The picture
 * does show it, along with the ruled lines, so the box is located from the
 * coordinates and the reading is left to the model.
 *
 * Two coordinate systems meet here: PDF user space measures y upward from the
 * foot of the page, a bitmap measures it downward from the top.
 */
export async function cropTableRegions(
  pageImage: Buffer,
  regions: TableRegion[],
  scale: number,
): Promise<{ region: TableRegion; image: VisionImage }[]> {
  if (regions.length === 0) return [];

  const { createCanvas, loadImage } = await import('@napi-rs/canvas');
  const page = await loadImage(pageImage);
  const crops: { region: TableRegion; image: VisionImage }[] = [];

  for (const region of regions) {
    const left = clamp(Math.floor(region.left * scale), 0, page.width);
    const right = clamp(Math.ceil(region.right * scale), 0, page.width);
    // `top` is the larger PDF y, which is the smaller bitmap y.
    const top = clamp(Math.floor(page.height - region.top * scale), 0, page.height);
    const bottom = clamp(Math.ceil(page.height - region.bottom * scale), 0, page.height);

    const width = right - left;
    const height = bottom - top;
    if (width < MIN_CROP_PIXELS || height < MIN_CROP_PIXELS) continue;

    const canvas = createCanvas(width, height);
    canvas.getContext('2d').drawImage(page, left, top, width, height, 0, 0, width, height);
    const png = await canvas.encode('png');
    if (png.length > 0) {
      crops.push({ region, image: { bytes: Buffer.from(png), format: 'png' } });
    }
  }

  return crops;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}
