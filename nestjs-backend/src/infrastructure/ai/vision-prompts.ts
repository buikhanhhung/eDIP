import type { ImageReading, VisionImage } from './ai.port';

/**
 * Shared by every vision provider. The wording is the behaviour here — three
 * providers drifting apart on what "transcribe" means would show up as three
 * different corpora depending on a config value.
 */
export const TRANSCRIBE_PROMPT = [
  'Transcribe every piece of text visible in these images, in reading order.',
  'Preserve the original language, including Vietnamese diacritics, and keep',
  'line breaks where the layout has them.',
  'Render any table as a GitHub-flavoured markdown table, one row per line,',
  'so its columns survive; merged cells repeat their value in each column they',
  'span.',
  'Output the transcription only — no commentary, no summary, no markdown',
  'fences around the whole answer. If an image contains no legible text at all,',
  'output nothing for it.',
].join(' ');

export const READ_PROMPT = [
  'For each image, in order, return what it contains.',
  'Reply with a JSON array of objects, one per image, and nothing else:',
  '[{"transcription": "...", "description": "..."}]',
  '"transcription" is the text visible in the image, verbatim, preserving the',
  'original language and its Vietnamese diacritics, with tables rendered as',
  'GitHub-flavoured markdown tables. Use an empty string when the image has no',
  'legible text.',
  '"description" is one or two sentences describing what the image shows —',
  'the subject, and any chart or diagram it depicts — written in the same',
  'language as the text in the image, or Vietnamese when it has none.',
  'Always fill in "description", including when the image is dense with text.',
].join(' ');

/**
 * A zero-byte render is the signature of the pdfjs init-order bug: the page
 * comes back blank, transcribes to nothing, and the document looks like a bad
 * scan instead of a misconfigured renderer.
 */
export function assertReadableImages(images: VisionImage[], verb: string): void {
  if (images.length === 0) throw new Error(`No images to ${verb}`);
  for (const image of images) {
    if (image.bytes.length === 0) throw new Error(`Refusing to ${verb} an empty image buffer`);
  }
}

/**
 * Parses the `read` reply into exactly `expected` entries.
 *
 * Models fence JSON, prefix it with prose, and occasionally return fewer
 * objects than there were images. None of that should cost the caller a
 * document, so anything unparsable degrades to empty readings and the images
 * simply contribute nothing — which is the state the pipeline was in before
 * this existed.
 */
export function parseReadings(raw: string, expected: number): ImageReading[] {
  const readings: ImageReading[] = [];

  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  if (start !== -1 && end > start) {
    try {
      const parsed: unknown = JSON.parse(raw.slice(start, end + 1));
      if (Array.isArray(parsed)) {
        for (const entry of parsed) {
          const record = (entry ?? {}) as Record<string, unknown>;
          readings.push({
            transcription: typeof record.transcription === 'string' ? record.transcription : '',
            description: typeof record.description === 'string' ? record.description : '',
          });
        }
      }
    } catch {
      // Fall through to the padding below.
    }
  }

  while (readings.length < expected) readings.push({ transcription: '', description: '' });
  return readings.slice(0, expected);
}
