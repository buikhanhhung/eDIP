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

interface EntityRelation {
  id: string;
  type: string;
  description: string;
  evidence: string;
  documentId: string;
  otherEntityName: string;
  direction: 'out' | 'in';
}

interface Props {
  node: { id: string; label: string } | null;
  onClose: () => void;
  onFocus: (id: string) => void;
}

/**
 * Every node on the canvas is an entity now, so this panel is where the
 * documents behind it live — the list the graph stopped drawing.
 */
export function NodeDrawer({ node, onClose, onFocus }: Props) {
  const { data: documents } = useQuery({
    queryKey: ['graph-entity', node?.id],
    queryFn: async () =>
      (await apiClient.get<RelatedDocument[]>(`/graph/entities/${node!.id}/documents`)).data,
    enabled: Boolean(node),
  });

  const { data: relations } = useQuery({
    queryKey: ['graph-entity-relations', node?.id],
    queryFn: async () =>
      (await apiClient.get<EntityRelation[]>(`/graph/entities/${node!.id}/relations`)).data,
    enabled: Boolean(node),
  });

  if (!node) return null;

  return (
    <aside className="fixed inset-y-0 right-0 z-40 w-80 overflow-y-auto border-l border-stroke-soft-200 bg-bg-white-0 p-6 shadow-raised">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-subheading-xs uppercase text-text-soft-400">Entity</p>
          <h2 className="break-words text-lg font-semibold">{node.label}</h2>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>

      <div className="mt-4 space-y-3">
        <Button variant="outline" size="sm" className="w-full" onClick={() => onFocus(node.id)}>
          Show neighbourhood only
        </Button>

        {relations && relations.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Relations ({relations.length})</p>
            {relations.map((relation) => (
              <div key={relation.id} className="rounded-md border border-stroke-soft-200 p-2">
                <p className="text-xs">
                  <Badge variant="secondary">{relation.type}</Badge>{' '}
                  <span className="text-text-sub-600">
                    {relation.direction === 'out' ? '→' : '←'} {relation.otherEntityName}
                  </span>
                </p>
                {/* Every typed edge shows the sentence it came from, so a
                    reader can reject it without leaving the drawer. */}
                <blockquote className="mt-1 border-l-2 border-stroke-soft-200 pl-2 text-xs italic text-text-sub-600">
                  “{relation.evidence}”
                </blockquote>
                <Link
                  to={`/documents/${relation.documentId}`}
                  className="text-xs text-primary-base hover:underline"
                >
                  Source document
                </Link>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-2">
          <p className="text-sm text-text-sub-600">
            Appears in {documents?.length ?? 0} document(s)
          </p>
          {documents?.map((document) => (
            <Link
              key={document.id}
              to={`/documents/${document.id}`}
              className="block rounded-md border border-stroke-soft-200 p-2 hover:bg-bg-weak-50"
            >
              <p className="truncate text-sm font-medium">{document.title ?? document.filename}</p>
              {document.documentType && (
                <Badge variant="secondary">{typeLabel(document.documentType)}</Badge>
              )}
            </Link>
          ))}
        </div>
      </div>
    </aside>
  );
}
