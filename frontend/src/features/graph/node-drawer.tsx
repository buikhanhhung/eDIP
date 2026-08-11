import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { apiClient } from '@/lib/api-client';
import { typeLabel } from '@/features/documents/document-types';

interface RelatedDocument {
  id: string;
  title: string | null;
  filename: string;
  documentType: string | null;
}

interface Props {
  node: { id: string; kind: string; label: string } | null;
  onClose: () => void;
  onFocus: (id: string) => void;
}

export function NodeDrawer({ node, onClose, onFocus }: Props) {
  const isEntity = node?.kind === 'entity';

  const { data: documents } = useQuery({
    queryKey: ['graph-entity', node?.id],
    queryFn: async () =>
      (await apiClient.get<RelatedDocument[]>(`/graph/entities/${node!.id}/documents`)).data,
    enabled: Boolean(node && isEntity),
  });

  if (!node) return null;

  return (
    <aside className="fixed inset-y-0 right-0 z-40 w-80 overflow-y-auto border-l bg-background p-6 shadow-lg">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {isEntity ? 'Thực thể' : 'Tài liệu'}
          </p>
          <h2 className="break-words text-lg font-semibold">{node.label}</h2>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Đóng
        </Button>
      </div>

      <div className="mt-4 space-y-3">
        <Button variant="outline" size="sm" className="w-full" onClick={() => onFocus(node.id)}>
          Chỉ xem lân cận
        </Button>

        {!isEntity && (
          <Link
            to={`/documents/${node.id}`}
            className="flex h-9 w-full items-center justify-center rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Mở tài liệu
          </Link>
        )}

        {isEntity && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Xuất hiện trong {documents?.length ?? 0} tài liệu
            </p>
            {documents?.map((document) => (
              <Link
                key={document.id}
                to={`/documents/${document.id}`}
                className="block rounded-md border p-2 hover:bg-accent"
              >
                <p className="truncate text-sm font-medium">{document.title ?? document.filename}</p>
                {document.documentType && (
                  <Badge variant="secondary">{typeLabel(document.documentType)}</Badge>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
