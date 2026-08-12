import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import { Link } from 'react-router-dom';
import { Badge, statusVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { apiClient, extractErrorMessage } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { statusLabel } from '@/features/documents/document-types';

/**
 * Mirrors the server allowlist. Two copies is the cost of two deployables; the
 * server's copy is the one that decides, this one only shapes the file picker.
 */
const ACCEPTED =
  '.txt,.md,.markdown,.csv,.json,.log,.xml,.html,.pdf,.docx,.xlsx,.pptx,.png,.jpg,.jpeg,.webp';

const POLL_INTERVAL_MS = 1500;
const TERMINAL = ['completed', 'failed'];

interface TrackedUpload {
  id: string;
  filename: string;
  status: string;
  error: string | null;
  documentType: string | null;
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
        const { data } = await apiClient.post<{ id: string; filename: string; status: string }>(
          '/documents',
          form,
        );
        setTracked((current) => [
          { id: data.id, filename: data.filename, status: data.status, error: null, documentType: null },
          ...current,
        ]);
      } catch (err) {
        setError(extractErrorMessage(err, `Could not upload ${file.name}.`));
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
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Upload documents</h1>
        <p className="text-sm text-text-sub-600">
          Drop files here. Text extraction, classification and metadata all run automatically.
        </p>
      </div>

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
        <p className="text-sm text-text-sub-600">
          Drag files in, or pick them from your computer. Scanned PDFs and images are read with
          vision, up to the first 5 pages.
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
      </div>

      {error && (
        <p className="rounded-md bg-danger-light px-3 py-2 text-sm text-danger-base">{error}</p>
      )}

      {tracked.length > 0 && (
        <Card>
          <CardContent className="divide-y divide-stroke-soft-200 pt-6">
            {tracked.map((item) => (
              <div key={item.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <Link to={`/documents/${item.id}`} className="min-w-0 flex-1 truncate font-medium hover:underline">
                  {item.filename}
                </Link>
                {item.documentType && <Badge variant="secondary">{item.documentType}</Badge>}
                <Badge variant={statusVariant(item.status)}>{statusLabel(item.status)}</Badge>
                {item.error && (
                  <span className="max-w-sm truncate text-xs text-danger-base" title={item.error}>
                    {item.error}
                  </span>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
