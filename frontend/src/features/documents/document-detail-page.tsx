import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Check,
  Copy,
  Download,
  FileSearch,
  FileText,
  ScanText,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { FileTypeChip } from '@/components/file-type-chip';
import { StatusPill } from '@/components/status-pill';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SectionIcon, SectionTitle } from '@/components/section-title';
import { Card, CardContent } from '@/components/ui/card';
import { apiClient, extractErrorMessage } from '@/lib/api-client';
import { cn, formatDate } from '@/lib/utils';
import { useAuth } from '@/features/auth/auth-context';
import { MetadataPanel, type DocumentMetadata } from './metadata-panel';
import { TextPreview, type HighlightSpan } from './text-preview';
import { typeLabel, type DocumentListItem } from './document-types';
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
      await queryClient.invalidateQueries({ queryKey: ['overview'] });
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
    <div className="space-y-5">
      <Link
        to="/library"
        className="inline-flex items-center gap-1.5 text-sm text-text-sub-600 transition-default hover:text-text-strong-950"
      >
        <ArrowLeft className="size-4" />
        Library
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <FileTypeChip filename={data.filename} />
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight text-text-strong-950">
              {data.title ?? data.filename}
            </h1>
            <p className="mt-0.5 truncate text-sm text-text-sub-600">
              <span className="font-medium text-text-strong-950">{data.filename}</span>
              {' · '}
              Uploaded {formatDate(data.uploadedAt)}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* The type and status sit in the same row as the actions but are not
              buttons: they state what this document is, and nothing happens if
              you press them. */}
          {data.documentType && (
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-stroke-soft-200 bg-bg-white-0 px-3 py-2 text-sm font-medium text-text-strong-950">
              <FileText className="size-4 text-text-sub-600" />
              {typeLabel(data.documentType)}
            </span>
          )}
          <StatusPill status={data.status} />

          {can('download') && (
            <Button
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
              <Download className="mr-1.5 size-4" />
              Download
            </Button>
          )}
          {can('delete') && (
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => {
                if (confirm(`Delete "${data.filename}"? This cannot be undone.`)) {
                  remove.mutate();
                }
              }}
            >
              <Trash2 className="mr-1.5 size-4" />
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
        // A left rule rather than another bordered card: the summary is the
        // model speaking about the document, not a field of it.
        <Card className="border-l-4 border-l-primary-base">
          <CardContent className="flex gap-4 p-5">
            <SectionIcon icon={FileText} tone="blue" />
            <div className="min-w-0 pt-1">
              <h2 className="text-base font-semibold text-text-strong-950">Summary</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-text-sub-600">{data.summary}</p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <Card>
          <CardContent className="p-5">
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

        <Card>
          <CardContent className="p-5">
            <SectionTitle
              icon={FileSearch}
              tone="violet"
              title="Recognised entities"
              action={
                <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-medium tabular-nums text-violet-600">
                  {data.entities.length}
                </span>
              }
            />

            {data.entities.length === 0 ? (
              <EmptyEntities />
            ) : (
              <div className="flex flex-wrap gap-2">
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
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {data.textContent && (
        <Card>
          <CardContent className="p-5">
            <SectionTitle
              icon={ScanText}
              tone="green"
              title="Extracted text"
              action={<CopyButton text={data.textContent} />}
            />
            <div className="rounded-xl bg-emerald-50/50 p-4">
              <TextPreview text={data.textContent} spans={data.entities} activeId={activeEntityId} />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/** How long the button holds its result before returning to "Copy". */
const COPY_FEEDBACK_MS = 1500;

/**
 * Copies the extracted text, and says what happened.
 *
 * The Clipboard API is refused often enough to plan for — an unfocused
 * document, a permission the browser never granted — so a failure falls back to
 * the older selection-based copy, and a failure of both says so. Swallowing it
 * leaves a button that visibly does nothing, which is the one outcome that
 * makes a reader press it again and again.
 */
function CopyButton({ text }: { text: string }) {
  const [result, setResult] = useState<'idle' | 'copied' | 'failed'>('idle');

  async function copy() {
    setResult((await writeToClipboard(text)) ? 'copied' : 'failed');
    setTimeout(() => setResult('idle'), COPY_FEEDBACK_MS);
  }

  return (
    <Button variant="outline" size="sm" onClick={copy}>
      {result === 'copied' ? (
        <Check className="mr-1.5 size-4 text-success-base" />
      ) : (
        <Copy className={cn('mr-1.5 size-4', result === 'failed' && 'text-danger-base')} />
      )}
      {result === 'copied' ? 'Copied' : result === 'failed' ? 'Copy failed' : 'Copy'}
    </Button>
  );
}

async function writeToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return copyBySelection(text);
  }
}

/**
 * The pre-Clipboard-API route: put the text in an off-screen field, select it,
 * and let the browser's own copy command take it. Deprecated, and still the
 * only thing that works when the Clipboard API is refused.
 */
function copyBySelection(text: string): boolean {
  const field = document.createElement('textarea');
  field.value = text;
  field.setAttribute('readonly', '');
  field.style.position = 'fixed';
  field.style.left = '-9999px';
  document.body.appendChild(field);

  try {
    field.select();
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    field.remove();
  }
}

/**
 * Says both what is missing and why nothing is wrong.
 *
 * "0" on its own reads as a failure of the extractor; a document with no
 * companies, people or dates in it is a perfectly ordinary thing.
 */
function EmptyEntities() {
  return (
    <div className="flex flex-col items-center px-4 py-10 text-center">
      <span className="mb-4 grid size-24 place-items-center rounded-full bg-violet-50">
        <FileSearch className="size-10 text-violet-400" strokeWidth={1.5} />
      </span>
      <p className="text-base font-medium text-text-strong-950">No entities were found.</p>
      <p className="mt-1 text-sm text-text-sub-600">
        This document contains no companies, people, dates or amounts the extractor recognised.
      </p>
    </div>
  );
}
