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

/** Vietnamese labels for the document types eDIP v1 produced. */
export const TYPE_LABELS: Record<string, string> = {
  contract: 'Hợp đồng',
  invoice: 'Hoá đơn',
  policy: 'Chính sách',
  report: 'Báo cáo',
  kyc: 'Hồ sơ KYC',
  unknown: 'Chưa phân loại',
};

export const STATUS_LABELS: Record<string, string> = {
  uploaded: 'Đã tải lên',
  processing: 'Đang xử lý',
  completed: 'Hoàn tất',
  failed: 'Lỗi',
};

export function typeLabel(type: string | null): string {
  if (!type) return TYPE_LABELS.unknown;
  return TYPE_LABELS[type] ?? type;
}

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}
