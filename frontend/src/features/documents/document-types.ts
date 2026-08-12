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

export interface DocumentStats {
  total: number;
  byStatus: Record<string, number>;
  byType: Record<string, number>;
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
};

export function typeLabel(type: string | null): string {
  if (!type) return TYPE_LABELS.unknown;
  return TYPE_LABELS[type] ?? type;
}

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}
