/**
 * Renders the library's metadata as a CSV a spreadsheet will open correctly.
 *
 * The byte order mark is the whole reason this is not a one-line join. Excel
 * on Windows reads a BOM-less file as the system code page, so every Vietnamese
 * name in the export arrives mangled — the same class of fault as the upload
 * filenames, and just as invisible until someone opens the file.
 *
 * CRLF for the same reason: it is what the format specifies and what older
 * spreadsheet software expects.
 */

const BOM = '﻿';
const NEWLINE = '\r\n';

export interface ExportedDocument {
  filename: string;
  title: string | null;
  documentType: string | null;
  typeConfidence: number | null;
  status: string;
  error: string | null;
  language: string | null;
  metadata: unknown;
  uploadedAt: Date;
  processedAt: Date | null;
  owner: { email: string } | null;
}

const COLUMNS = [
  'filename',
  'title',
  'type',
  'type_confidence',
  'status',
  'error',
  'language',
  'parties',
  'document_date',
  'amount',
  'keywords',
  'uploaded_by',
  'uploaded_at',
  'processed_at',
] as const;

export function toMetadataCsv(documents: ExportedDocument[]): string {
  const rows = documents.map((document) => {
    const metadata = (document.metadata ?? {}) as {
      parties?: unknown;
      date?: unknown;
      amount?: unknown;
      keywords?: unknown;
    };

    return [
      document.filename,
      document.title ?? '',
      document.documentType ?? '',
      document.typeConfidence ?? '',
      document.status,
      document.error ?? '',
      document.language ?? '',
      list(metadata.parties),
      scalar(metadata.date),
      scalar(metadata.amount),
      list(metadata.keywords),
      document.owner?.email ?? '',
      iso(document.uploadedAt),
      iso(document.processedAt),
    ].map(cell);
  });

  return BOM + [COLUMNS.join(','), ...rows.map((row) => row.join(','))].join(NEWLINE) + NEWLINE;
}

/**
 * Quotes only when the value would otherwise break the row, and doubles any
 * quote inside it. A leading separator character is quoted too: a cell opening
 * with `=` or `+` is run as a formula by some spreadsheets.
 */
function cell(value: string | number): string {
  const text = String(value);
  const risky = /[",\r\n]/.test(text) || /^[=+\-@]/.test(text);
  return risky ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Semicolons inside the cell, so the comma stays the column separator. */
function list(value: unknown): string {
  return Array.isArray(value) ? value.map((item) => String(item)).join('; ') : '';
}

function scalar(value: unknown): string {
  return value === null || value === undefined ? '' : String(value);
}

function iso(value: Date | null): string {
  return value ? value.toISOString() : '';
}
