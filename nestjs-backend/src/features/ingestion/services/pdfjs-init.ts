import { definePDFJSModule } from 'unpdf';

/**
 * Points unpdf at the official pdfjs build, once, before any other unpdf call.
 *
 * This must run before `extractText` too, not only before rendering. unpdf
 * resolves its PDF.js build on first use and keeps it: if `extractText` goes
 * first, unpdf settles on its own bundled serverless build, which has no canvas
 * support, and a later `renderPageAsImage` yields blank pages. Blank pages
 * transcribe to empty text, so the failure looks like a bad scan rather than an
 * initialisation-order bug — which is why the callers assert on empty output.
 *
 * The **legacy** build is required under Node: pdfjs' modern build calls
 * `hashOriginal.toHex()`, absent on this runtime, and throws at import time.
 *
 * A rejected promise is never cached. Keeping one would make a single transient
 * failure permanent for the life of the process, with every later PDF reporting
 * the first error.
 */
let initPromise: Promise<void> | null = null;

export function ensurePdfjs(): Promise<void> {
  initPromise ??= definePDFJSModule(() => import('pdfjs-dist/legacy/build/pdf.mjs')).catch(
    (error: unknown) => {
      initPromise = null;
      throw error;
    },
  );
  return initPromise;
}
