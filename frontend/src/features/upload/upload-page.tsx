import { useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import {
  Info,
  Lock,
  ScanText,
  Tags,
  Upload as UploadIcon,
  UploadCloud,
  type LucideIcon,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/page-header';
import { StatusPill } from '@/components/status-pill';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { apiClient, extractErrorMessage } from '@/lib/api-client';
import { cn, formatDate } from '@/lib/utils';


/**
 * Mirrors the server allowlist. Two copies is the cost of two deployables; the
 * server's copy is the one that decides, this one only shapes the file picker.
 */
const ACCEPTED =
  '.txt,.md,.markdown,.csv,.json,.log,.xml,.html,.pdf,.docx,.xlsx,.pptx,.png,.jpg,.jpeg,.webp';

const POLL_INTERVAL_MS = 1500;
/**
 * `duplicate` never comes from the API — the row is closed the moment the
 * upload is refused, so it must not be polled for a status it will never have.
 */
const TERMINAL = ['completed', 'failed', 'duplicate'];

interface PreviousVersion {
  id: string;
  filename: string;
  uploadedAt: string;
}

interface TrackedUpload {
  id: string;
  filename: string;
  status: string;
  error: string | null;
  documentType: string | null;
  /** The document this file duplicates, when the upload was refused. */
  duplicateOf?: { id: string; filename: string } | null;
  /** Earlier files with the same name but different content. */
  previousVersions?: PreviousVersion[];
}

export function UploadPage() {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tracked, setTracked] = useState<TrackedUpload[]>([]);

  const pending = tracked.filter((item) => !TERMINAL.includes(item.status));

  // One timer for all in-flight documents rather than one per row, so the
  // number of requests does not grow with the number of files dropped.
  useEffect(() => {
    if (pending.length === 0) return;

    const timer = setInterval(async () => {
      const updates = await Promise.allSettled(
        pending.map((item) =>
          apiClient.get<{ status: string; error: string | null; documentType: string | null }>(
            `/documents/${item.id}/status`,
          ),
        ),
      );

      setTracked((current) =>
        current.map((item) => {
          const index = pending.findIndex((p) => p.id === item.id);
          if (index < 0) return item;
          const result = updates[index];
          if (result.status !== 'fulfilled') return item;
          return { ...item, ...result.value.data };
        }),
      );

      // A finished job changes the library and the dashboard counts.
      if (updates.some((u) => u.status === 'fulfilled' && TERMINAL.includes(u.value.data.status))) {
        void queryClient.invalidateQueries({ queryKey: ['documents'] });
        void queryClient.invalidateQueries({ queryKey: ['stats'] });
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [pending, queryClient]);

  const submit = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError(null);

    for (const file of Array.from(files)) {
      const form = new FormData();
      form.append('file', file);
      try {
        const { data } = await apiClient.post<{
          id: string;
          filename: string;
          status: string;
          previousVersions: PreviousVersion[];
        }>('/documents', form);
        setTracked((current) => [
          {
            id: data.id,
            filename: data.filename,
            status: data.status,
            error: null,
            documentType: null,
            previousVersions: data.previousVersions,
          },
          ...current,
        ]);
      } catch (err) {
        // A refusal gets its own row rather than one shared error line: in a
        // batch of twenty, the reader needs to know *which* file was refused.
        const conflict = axios.isAxiosError(err) && err.response?.status === 409;
        const duplicateOf = conflict
          ? ((err.response?.data as { duplicateOf?: { id: string; filename: string } })
              ?.duplicateOf ?? null)
          : null;

        setTracked((current) => [
          {
            id: `rejected-${file.name}-${Date.now()}`,
            filename: file.name,
            status: conflict ? 'duplicate' : 'failed',
            error: extractErrorMessage(err, `Could not upload ${file.name}.`),
            documentType: null,
            duplicateOf,
          },
          ...current,
        ]);
      }
    }

    setBusy(false);
  }, []);

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    void submit(event.dataTransfer.files);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={UploadIcon}
        title="Upload documents"
        description="Drop files here. Text extraction, classification and metadata all run automatically."
      />

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'rounded-lg border-2 border-dashed bg-bg-white-0 p-10 text-center transition-default',
          dragging ? 'border-primary-base bg-primary-lighter' : 'border-stroke-soft-200',
        )}
      >
        <span className="mx-auto mb-4 grid size-14 place-items-center rounded-full bg-primary-lighter">
          <UploadCloud className="size-6 text-primary-base" />
        </span>
        <p className="text-lg font-semibold text-text-strong-950">Drag &amp; drop files here</p>
        <p className="mt-1 text-sm text-text-sub-600">
          or pick them from your computer. Scanned PDFs and images are read with vision, up to the
          first 5 pages.
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED}
          className="hidden"
          onChange={(e) => void submit(e.target.files)}
        />
        <Button className="mt-4" disabled={busy} onClick={() => inputRef.current?.click()}>
          {busy ? 'Uploading…' : 'Choose files'}
        </Button>
        <p className="mt-3 text-xs text-text-soft-400">
          PDF, DOCX, XLSX, PPTX, TXT, MD, CSV, JSON, XML, HTML, PNG, JPG, WEBP · up to 20 MB each
        </p>
      </div>

      {/* What the pipeline will do, said once here rather than discovered
          afterwards from a document that came back classified. */}
      <Card>
        <CardContent className="grid gap-6 pt-6 sm:grid-cols-2 lg:grid-cols-4">
          <Capability
            icon={ScanText}
            tone="bg-primary-lighter text-primary-base"
            title="Smart extraction"
            body="Text, tables and pictures, including scans read with vision."
          />
          <Capability
            icon={Tags}
            tone="bg-success-light text-success-base"
            title="Auto classification"
            body="Each document is typed and tagged on the way in."
          />
          <Capability
            icon={Info}
            tone="bg-warning-light text-warning-base"
            title="Metadata enrichment"
            body="Parties, dates and amounts are pulled out and structured."
          />
          <Capability
            icon={Lock}
            tone="bg-danger-light text-danger-base"
            title="Duplicate safe"
            body="An identical file is refused before it costs a second pass."
          />
        </CardContent>
      </Card>

      {error && (
        <p className="rounded-md bg-danger-light px-3 py-2 text-sm text-danger-base">{error}</p>
      )}

      {tracked.length > 0 && (
        <Card>
          <CardContent className="divide-y divide-stroke-soft-200 pt-6">
            {tracked.map((item) => {
              const refused = item.status === 'duplicate';
              return (
                <div key={item.id} className="space-y-1 py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center gap-3">
                    {/* A refused file has no document to open. */}
                    {refused ? (
                      <span className="min-w-0 flex-1 truncate font-medium text-text-sub-600">
                        {item.filename}
                      </span>
                    ) : (
                      <Link
                        to={`/documents/${item.id}`}
                        className="min-w-0 flex-1 truncate font-medium hover:underline"
                      >
                        {item.filename}
                      </Link>
                    )}
                    {item.documentType && <Badge variant="secondary">{item.documentType}</Badge>}
                    <StatusPill status={item.status} />
                    {item.error && !refused && (
                      <span className="max-w-sm truncate text-xs text-danger-base" title={item.error}>
                        {item.error}
                      </span>
                    )}
                  </div>

                  {refused && item.duplicateOf && (
                    <p className="text-xs text-text-sub-600">
                      Identical to{' '}
                      <Link
                        to={`/documents/${item.duplicateOf.id}`}
                        className="text-primary-base hover:underline"
                      >
                        {item.duplicateOf.filename}
                      </Link>
                      , already in the library — nothing was uploaded.
                    </p>
                  )}

                  {/* Same name, different content: a revision, not a repeat. */}
                  {!refused && item.previousVersions && item.previousVersions.length > 0 && (
                    <p className="text-xs text-text-sub-600">
                      {item.previousVersions.length} earlier file
                      {item.previousVersions.length > 1 ? 's' : ''} share this name:{' '}
                      {item.previousVersions.map((version, index) => (
                        <span key={version.id}>
                          {index > 0 && ', '}
                          <Link
                            to={`/documents/${version.id}`}
                            className="text-primary-base hover:underline"
                          >
                            {formatDate(version.uploadedAt)}
                          </Link>
                        </span>
                      ))}
                    </p>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Capability({
  icon: Icon,
  tone,
  title,
  body,
}: {
  icon: LucideIcon;
  tone: string;
  title: string;
  body: string;
}) {
  return (
    <div className="flex gap-3">
      <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${tone}`}>
        <Icon className="size-4" />
      </span>
      <div>
        <p className="text-sm font-medium text-text-strong-950">{title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-text-sub-600">{body}</p>
      </div>
    </div>
  );
}
