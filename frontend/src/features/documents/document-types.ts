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
  /** How each document's text was obtained — native, vision, docx, and so on. */
  byTextSource: Record<string, number>;
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
