/**
 * The one extension map, ported from eDIP v1 (`src/lib/extraction/allowlist.ts`).
 *
 * The upload guard, the stored mime type, the download response type and the
 * file picker's `accept` string all read from here, which is what stops them
 * drifting apart.
 *
 * The mime is derived from the **extension**, never from the multipart
 * `Content-Type`: multer copies that header straight from the request, so
 * trusting it means trusting the uploader.
 */

export type ExtractionTier = 'native' | 'pdf' | 'docx' | 'xlsx' | 'pptx' | 'image';

export interface AllowedType {
  tier: ExtractionTier;
  mime: string;
}

export const ALLOWLIST: Record<string, AllowedType> = {
  txt: { tier: 'native', mime: 'text/plain' },
  md: { tier: 'native', mime: 'text/markdown' },
  markdown: { tier: 'native', mime: 'text/markdown' },
  csv: { tier: 'native', mime: 'text/csv' },
  json: { tier: 'native', mime: 'application/json' },
  log: { tier: 'native', mime: 'text/plain' },
  xml: { tier: 'native', mime: 'application/xml' },
  html: { tier: 'native', mime: 'text/html' },
  pdf: { tier: 'pdf', mime: 'application/pdf' },
  docx: {
    tier: 'docx',
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  },
  xlsx: {
    tier: 'xlsx',
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  },
  pptx: {
    tier: 'pptx',
    mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  },
  png: { tier: 'image', mime: 'image/png' },
  jpg: { tier: 'image', mime: 'image/jpeg' },
  jpeg: { tier: 'image', mime: 'image/jpeg' },
  webp: { tier: 'image', mime: 'image/webp' },
};

export const SUPPORTED_EXTENSIONS = Object.keys(ALLOWLIST);

/** Lowercased final extension, or '' when the name carries none. */
export function extensionOf(fileName: string): string {
  const parts = fileName.split('.');
  return parts.length > 1 ? (parts.pop() ?? '').toLowerCase() : '';
}

export function allowedTypeFor(fileName: string): AllowedType | null {
  return ALLOWLIST[extensionOf(fileName)] ?? null;
}

/**
 * Extensions that must never be served back under their own content type.
 *
 * An uploaded .html served inline from this origin is stored XSS: httpOnly
 * stops the token being read but not being used, so injected script performs
 * authenticated writes as whoever opens the file. The download route also sends
 * `attachment` and `nosniff`; this is the third layer.
 */
const NEUTRALISED_EXTENSIONS = new Set(['html', 'xml', 'svg']);

export function downloadMimeFor(fileName: string): string {
  const extension = extensionOf(fileName);
  if (NEUTRALISED_EXTENSIONS.has(extension)) return 'text/plain; charset=utf-8';
  return ALLOWLIST[extension]?.mime ?? 'application/octet-stream';
}

export function rejectionMessage(fileName: string): string {
  const extension = extensionOf(fileName);
  const label = extension.length > 0 ? `".${extension}"` : 'that file';
  return (
    `Cannot read ${label}. Supported types: ${SUPPORTED_EXTENSIONS.join(', ')}. ` +
    'Legacy .doc, .xls and .ppt are not supported — save as .docx, .xlsx or .pptx first.'
  );
}
