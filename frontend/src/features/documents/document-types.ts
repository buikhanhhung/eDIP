export interface DocumentListItem {
  id: string;
  filename: string;
  documentType: string | null;
  typeConfidence: number | null;
  status: string;
  error: string | null;
  title: string | null;
  language: string | null;
  metadata: Record<string, unknown> | null;
  sizeBytes: number;
  uploadedAt: string;
  processedAt: string | null;
  owner: { id: string; email: string } | null;
}

export interface DocumentListResponse {
  items: DocumentListItem[];
  total: number;
}

/** A figure beside the same figure one window earlier. */
export interface StatDelta {
  value: number;
  previous: number;
  /** Null when the earlier window was empty — a rise from zero has no rate. */
  changePct: number | null;
}

export interface OverviewStats {
  range: { from: string; to: string; bucket: 'day' | 'month' };
  tiles: {
    total: StatDelta;
    processed: StatDelta;
    failed: StatDelta;
    processing: StatDelta;
    storageBytes: StatDelta;
  };
  byType: Record<string, number>;
  /** Which door each document came through — upload, google_drive. */
  bySource: Record<string, number>;
  /** Every bucket in the window, empty ones included. */
  series: { date: string; uploaded: number; failed: number }[];
  usage: {
    byType: { type: string; uses: number }[];
    documents: {
      id: string;
      filename: string;
      title: string | null;
      documentType: string | null;
      uses: number;
    }[];
  };
  ai: {
    totalQueries: number;
    searches: number;
    questions: number;
    /** Null until audited actions start carrying a measured duration. */
    avgResponseMs: number | null;
  };
  tokens: {
    byPurpose: {
      purpose: string;
      calls: number;
      /** Calls whose provider returned token figures. */
      reportedCalls: number;
      inputTokens: number;
      outputTokens: number;
      inputChars: number;
    }[];
    totalInput: number;
    totalOutput: number;
    calls: number;
    /** Calls the provider reported nothing for, so the totals understate them. */
    unreportedCalls: number;
  };
}

/** Display labels for the document types the classifier produces. */
export const TYPE_LABELS: Record<string, string> = {
  contract: 'Contract',
  invoice: 'Invoice',
  policy: 'Policy',
  report: 'Report',
  kyc: 'KYC record',
  other: 'Other',
  unknown: 'Unclassified',
};

/**
 * One colour per document type, fixed for the life of the app.
 *
 * Keyed by type rather than assigned in rank order: a filter that changes which
 * type is largest must not repaint the ones that remain, and "Report" has to be
 * the same blue in every chart on the page. The hues are the validated
 * categorical order — worst adjacent CVD ΔE 11.5, worst normal-vision ΔE 19.2
 * against a white surface — with the sub-3:1 slots relieved by the labelled
 * legend that always accompanies them.
 */
export const TYPE_COLORS: Record<string, string> = {
  report: '#3b82f6',
  contract: '#f97316',
  other: '#10b981',
  policy: '#a855f7',
  invoice: '#ec4899',
  kyc: '#f59e0b',
  unknown: '#94a3b8',
};

export function typeColor(type: string | null): string {
  return TYPE_COLORS[type ?? 'unknown'] ?? TYPE_COLORS.unknown;
}

/**
 * The chunking strategies the server will accept, in the order they are
 * offered. Kept as technical names on purpose: what is shown here is exactly
 * what lands in `chunking_strategy` and in the logs, so looking one up later
 * needs no translation.
 *
 * One entry per implemented strategy — the upload page hides the control
 * entirely while there is nothing to choose between.
 */
export const CHUNKING_LABELS: Record<string, string> = {
  RECURSIVE_CHARACTER: 'RECURSIVE_CHARACTER',
  PARENT_CHILD_MARKDOWN: 'PARENT_CHILD_MARKDOWN',
};

/**
 * What each strategy actually does to a file, for the reader who has just been
 * handed four technical names. Kept beside the labels so a strategy cannot be
 * offered without one.
 */
export const CHUNKING_NOTES: Record<string, string> = {
  RECURSIVE_CHARACTER: 'Splits on paragraph breaks. Works on any file type.',
  PARENT_CHILD_MARKDOWN:
    'Splits on Markdown headings and answers with the whole section for context. ' +
    'Files without Markdown headings — most PDFs, Word files and scans — become one section.',
};

export const STATUS_LABELS: Record<string, string> = {
  uploaded: 'Uploaded',
  processing: 'Processing',
  completed: 'Completed',
  failed: 'Failed',
  duplicate: 'Duplicate',
};

export function typeLabel(type: string | null): string {
  if (!type) return TYPE_LABELS.unknown;
  return TYPE_LABELS[type] ?? type;
}

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}
