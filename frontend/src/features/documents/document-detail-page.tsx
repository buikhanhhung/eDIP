import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { Badge, statusVariant } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { apiClient } from '@/lib/api-client';
import { formatDate } from '@/lib/utils';
import { statusLabel, typeLabel, type DocumentListItem } from './document-types';

interface DocumentEntity {
  id: string;
  type: string;
  displayName: string;
  mentionText: string;
  charStart: number | null;
  charEnd: number | null;
}

interface DocumentDetail extends DocumentListItem {
  summary: string | null;
  textContent: string | null;
  textSource: string | null;
  sizeBytes: number;
  mimeType: string;
  entities: DocumentEntity[];
}

export function DocumentDetailPage() {
  const { id } = useParams<{ id: string }>();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['document', id],
    queryFn: async () => (await apiClient.get<DocumentDetail>(`/documents/${id}`)).data,
    enabled: Boolean(id),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Đang tải tài liệu…</p>;
  if (isError || !data) return <p className="text-sm text-destructive">Không tìm thấy tài liệu.</p>;

  const metadata = (data.metadata ?? {}) as {
    parties?: string[];
    date?: string | null;
    amount?: string | null;
    keywords?: string[];
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link to="/library" className="text-sm text-muted-foreground hover:underline">
            ← Thư viện
          </Link>
          <h1 className="truncate text-2xl font-semibold tracking-tight">
            {data.title ?? data.filename}
          </h1>
          <p className="text-sm text-muted-foreground">{data.filename}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {data.documentType && (
            <Badge variant="secondary">
              {typeLabel(data.documentType)}
              {data.typeConfidence != null && ` · ${Math.round(data.typeConfidence * 100)}%`}
            </Badge>
          )}
          <Badge variant={statusVariant(data.status)}>{statusLabel(data.status)}</Badge>
        </div>
      </div>

      {data.error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {data.error}
        </p>
      )}

      {data.summary && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Tóm tắt</CardTitle>
          </CardHeader>
          <CardContent className="text-sm leading-relaxed">{data.summary}</CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle>Metadata</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Field label="Các bên" value={metadata.parties?.join(', ')} />
            <Field label="Ngày" value={metadata.date ?? undefined} />
            <Field label="Giá trị" value={metadata.amount ?? undefined} />
            <Field label="Ngôn ngữ" value={data.language ?? undefined} />
            <Field label="Nguồn văn bản" value={data.textSource ?? undefined} />
            <Field label="Tải lên" value={formatDate(data.uploadedAt)} />
            {metadata.keywords && metadata.keywords.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {metadata.keywords.map((keyword) => (
                  <Badge key={keyword} variant="outline">
                    {keyword}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle>Thực thể nhận dạng ({data.entities.length})</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {data.entities.length === 0 && (
              <p className="text-sm text-muted-foreground">Chưa có thực thể nào.</p>
            )}
            {data.entities.map((entity) => (
              <Badge
                key={`${entity.id}-${entity.mentionText}`}
                variant={entity.charStart != null ? 'default' : 'secondary'}
                title={
                  entity.charStart != null
                    ? `${entity.type} · vị trí ${entity.charStart}`
                    : `${entity.type} · không xác định vị trí`
                }
              >
                {entity.displayName}
              </Badge>
            ))}
          </CardContent>
        </Card>
      </div>

      {data.textContent && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Nội dung trích xuất</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="max-h-[28rem] overflow-auto whitespace-pre-wrap rounded-md bg-muted/50 p-4 text-sm leading-relaxed">
              {data.textContent}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex gap-2">
      <span className="w-28 shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 break-words">{value || '—'}</span>
    </div>
  );
}
