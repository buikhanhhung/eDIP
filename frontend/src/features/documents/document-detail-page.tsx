import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Badge, statusVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { apiClient, extractErrorMessage } from '@/lib/api-client';
import { formatDate } from '@/lib/utils';
import { useAuth } from '@/features/auth/auth-context';
import { MetadataPanel, type DocumentMetadata } from './metadata-panel';
import { TextPreview, type HighlightSpan } from './text-preview';
import { statusLabel, typeLabel, type DocumentListItem } from './document-types';
import { downloadDocument } from './download-document';

interface DocumentEntity extends HighlightSpan {
  displayName: string;
}

interface DocumentDetail extends DocumentListItem {
  summary: string | null;
  textContent: string | null;
  textSource: string | null;
  metadataEditedAt: string | null;
  entities: DocumentEntity[];
}

export function DocumentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeEntityId, setActiveEntityId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['document', id],
    queryFn: async () => (await apiClient.get<DocumentDetail>(`/documents/${id}`)).data,
    enabled: Boolean(id),
  });

  const remove = useMutation({
    mutationFn: async () => (await apiClient.delete(`/documents/${id}`)).data,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['documents'] });
      await queryClient.invalidateQueries({ queryKey: ['stats'] });
      navigate('/library', { replace: true });
    },
  });

  if (isLoading) return <p className="text-sm text-text-sub-600">Loading document…</p>;
  if (isError || !data) return <p className="text-sm text-danger-base">Document not found.</p>;

  const metadata = (data.metadata ?? {}) as DocumentMetadata;

  /** Hovering a party in the panel lights up its first recorded mention. */
  function highlightParty(party: string | null) {
    if (!party) return setActiveEntityId(null);
    const match = data!.entities.find(
      (entity) => entity.displayName === party || entity.mentionText === party,
    );
    setActiveEntityId(match?.id ?? null);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link to="/library" className="text-sm text-text-sub-600 hover:underline">
            ← Library
          </Link>
          <h1 className="truncate text-2xl font-semibold tracking-tight">
            {data.title ?? data.filename}
          </h1>
          <p className="text-sm text-text-sub-600">
            {data.filename} · uploaded {formatDate(data.uploadedAt)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {data.documentType && <Badge variant="secondary">{typeLabel(data.documentType)}</Badge>}
          <Badge variant={statusVariant(data.status)}>{statusLabel(data.status)}</Badge>
          {can('download') && (
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                setDownloadError(null);
                try {
                  await downloadDocument(data.id, data.filename);
                } catch (err) {
                  setDownloadError(extractErrorMessage(err, 'Could not download this file.'));
                }
              }}
            >
              Download
            </Button>
          )}
          {can('delete') && (
            <Button
              size="sm"
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => {
                if (confirm(`Delete "${data.filename}"? This cannot be undone.`)) {
                  remove.mutate();
                }
              }}
            >
              Delete
            </Button>
          )}
        </div>
      </div>

      {(data.error || downloadError) && (
        <p className="rounded-md bg-danger-light px-3 py-2 text-sm text-danger-base">
          {downloadError ?? data.error}
        </p>
      )}

      {data.summary && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Summary</CardTitle>
          </CardHeader>
          <CardContent className="text-sm leading-relaxed">{data.summary}</CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle>Metadata</CardTitle>
          </CardHeader>
          <CardContent>
            <MetadataPanel
              documentId={data.id}
              title={data.title}
              documentType={data.documentType}
              typeConfidence={data.typeConfidence}
              metadata={metadata}
              language={data.language}
              textSource={data.textSource}
              editedAt={data.metadataEditedAt}
              onHoverParty={highlightParty}
            />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle>Recognised entities ({data.entities.length})</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {data.entities.length === 0 && (
              <p className="text-sm text-text-sub-600">No entities were found.</p>
            )}
            {data.entities.map((entity) => (
              <button
                key={`${entity.id}-${entity.mentionText}`}
                type="button"
                onMouseEnter={() => setActiveEntityId(entity.id)}
                onMouseLeave={() => setActiveEntityId(null)}
              >
                <Badge
                  variant={entity.charStart != null ? 'default' : 'secondary'}
                  title={
                    entity.charStart != null
                      ? `${entity.type} · at character ${entity.charStart}`
                      : `${entity.type} · position not located in the text`
                  }
                >
                  {entity.displayName}
                </Badge>
              </button>
            ))}
          </CardContent>
        </Card>
      </div>

      {data.textContent && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Extracted text</CardTitle>
          </CardHeader>
          <CardContent>
            <TextPreview
              text={data.textContent}
              spans={data.entities}
              activeId={activeEntityId}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
