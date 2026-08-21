import { useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import {
  ArrowRight,
  Copy,
  Info,
  Lock,
  ScanText,
  Tags,
  Upload as UploadIcon,
  UploadCloud,
} from 'lucide-react';
import { useCallback, useRef, useState, type DragEvent } from 'react';
import { Link } from 'react-router-dom';
import { Capability } from '@/components/capability';
import { ChunkingStrategyDialog } from '@/components/chunking-strategy-dialog';
import { FileTypeChip } from '@/components/file-type-chip';
import { PageHeader } from '@/components/page-header';
import { StatusPill } from '@/components/status-pill';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { apiClient, extractErrorMessage } from '@/lib/api-client';
import { cn, formatBytes, formatDate } from '@/lib/utils';
import {
  CHUNKING_LABELS,
  type DocumentListResponse,
} from '@/features/documents/document-types';

/**
 * Mirrors the server allowlist. Two copies is the cost of two deployables; the
 * server's copy is the one that decides, this one only shapes the file picker.
 */
const ACCEPTED =
  '.txt,.md,.markdown,.csv,.json,.log,.xml,.html,.pdf,.docx,.xlsx,.pptx,.png,.jpg,.jpeg,.webp';


/**
 * What the dialog opens on, and what the server falls back to. Taken from the
 * label list rather than written out again, so renaming a key cannot leave the
 * dialog preselecting a strategy the server does not accept.
 */
const DEFAULT_CHUNKING = Object.keys(CHUNKING_LABELS)[0];

const POLL_INTERVAL_MS = 1500;

/** A status that will not change again on its own, so polling can stop. */
const TERMINAL = ['completed', 'failed'];

/** Enough to see what just landed without turning the page into the library. */
const RECENT_COUNT = 5;

interface PreviousVersion {
  id: string;
  filename: string;
  uploadedAt: string;
}

/**
 * Something worth saying about one file that the table below cannot show.
 *
 * A refused upload never became a document, so it has no row in the library to
 * appear in; an accepted one that shares a name with older files has a row, but
 * nothing in it says so. Both are facts about this attempt rather than about
 * the corpus, so they live here for the session and are not persisted.
 */
interface UploadNotice {
  key: string;
  filename: string;
  kind: 'duplicate' | 'failed' | 'versions';
  message?: string;
  duplicateOf?: { id: string; filename: string } | null;
  previousVersions?: PreviousVersion[];
}

export function UploadPage() {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notices, setNotices] = useState<UploadNotice[]>([]);
  // One strategy for the whole batch, not one per file: the choice describes
  // how this drop should be read, and asking per file would turn a drag of
  // twenty into twenty questions.
  const [chunking, setChunking] = useState(DEFAULT_CHUNKING);
  /**
   * What the dialog is standing in front of: the file picker it will open, or
   * files already dropped and waiting to be sent.
   */
  const [asking, setAsking] = useState<{ dropped?: File[] } | null>(null);
  /**
   * Read by the picker's change handler. State would do everywhere except
   * there: `input.click()` fires synchronously after the dialog closes, and the
   * handler must not see the previous render's value.
   */
  const chosen = useRef(DEFAULT_CHUNKING);

  /**
   * The library's newest rows, which is where a file lands the moment it is
   * accepted — so the just-uploaded and the previously-uploaded are one list
   * rather than two that disagree.
   */
  const { data: recent, isLoading } = useQuery({
    queryKey: ['documents', { take: RECENT_COUNT }],
    queryFn: async () =>
      (await apiClient.get<DocumentListResponse>('/documents', { params: { take: RECENT_COUNT } }))
        .data,
    // One poll for the whole list rather than one per file: the number of
    // requests must not grow with the number of files dropped. It stops of its
    // own accord once nothing is still being read.
    refetchInterval: (query) =>
      query.state.data?.items.some((item) => !TERMINAL.includes(item.status))
        ? POLL_INTERVAL_MS
        : false,
  });

  const submit = useCallback(
    async (files: FileList | File[] | null, strategy: string) => {
      if (!files || files.length === 0) return;
      setBusy(true);

      for (const file of Array.from(files)) {
        const form = new FormData();
        // Before the file by convention rather than necessity: multer finishes
        // parsing the whole body before the route handler runs, so `@Body()`
        // sees this field either way. Kept first because anything that inspects
        // parts as they arrive — a fileFilter, a streaming parser — would need
        // it to have arrived already.
        form.append('chunkingStrategy', strategy);
        form.append('file', file);
        try {
          const { data } = await apiClient.post<{
            id: string;
            filename: string;
            status: string;
            previousVersions: PreviousVersion[];
          }>('/documents', form);

          if (data.previousVersions?.length > 0) {
            setNotices((current) => [
              {
                key: data.id,
                filename: data.filename,
                kind: 'versions',
                previousVersions: data.previousVersions,
              },
              ...current,
            ]);
          }
        } catch (err) {
          // A refusal gets its own notice rather than one shared error line: in
          // a batch of twenty, the reader needs to know *which* file was
          // refused, and why.
          const conflict = axios.isAxiosError(err) && err.response?.status === 409;

          setNotices((current) => [
            {
              key: `rejected-${file.name}-${Date.now()}`,
              filename: file.name,
              kind: conflict ? 'duplicate' : 'failed',
              message: extractErrorMessage(err, `Could not upload ${file.name}.`),
              duplicateOf: conflict
                ? ((err.response?.data as { duplicateOf?: { id: string; filename: string } })
                    ?.duplicateOf ?? null)
                : null,
            },
            ...current,
          ]);
        }
      }

      // The new rows belong to the library and to the overview's counts, not
      // just to this page.
      void queryClient.invalidateQueries({ queryKey: ['documents'] });
      void queryClient.invalidateQueries({ queryKey: ['overview'] });
      setBusy(false);
    },
    [queryClient],
  );

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const files = Array.from(event.dataTransfer.files);
    if (files.length > 0) setAsking({ dropped: files });
  }

  /** The dialog's answer: send what was dropped, or go and ask for files. */
  function onStrategyConfirmed(strategy: string) {
    const dropped = asking?.dropped;
    setChunking(strategy);
    chosen.current = strategy;
    setAsking(null);

    if (dropped) void submit(dropped, strategy);
    else inputRef.current?.click();
  }

  return (
    <div className="space-y-6">
      <ChunkingStrategyDialog
        open={asking !== null}
        value={chunking}
        onChange={setChunking}
        onConfirm={onStrategyConfirmed}
        onCancel={() => setAsking(null)}
        // Dropped files are already in hand, so the next step is sending them.
        confirmLabel={asking?.dropped ? `Upload ${asking.dropped.length} file(s)` : 'Choose files'}
      />

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
          onChange={(e) => void submit(e.target.files, chosen.current)}
        />
        <Button className="mt-4" disabled={busy} onClick={() => setAsking({})}>
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

      {notices.length > 0 && (
        <div className="space-y-2">
          {notices.map((notice) => (
            <Notice key={notice.key} notice={notice} />
          ))}
        </div>
      )}

      {/* A bordered panel rather than a Card: the title then sits on the same
          left edge as the column headings under it, which a card's wider
          padding would put eight pixels out. */}
      <div className="overflow-hidden rounded-lg border border-stroke-soft-200 bg-bg-white-0 shadow-soft">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-stroke-soft-200 px-4 py-3">
          <h2 className="font-semibold text-text-strong-950">Recent uploads</h2>
          <Link
            to="/library"
            className="flex items-center gap-1 text-sm text-primary-base hover:underline"
          >
            View all uploads
            <ArrowRight className="size-3.5" />
          </Link>
        </div>

        <Table>
            <TableHeader>
              <TableRow>
                {/* Absorbs the leftover width and truncates, so a long
                    Vietnamese filename never pushes the dates off the edge. */}
                <TableHead className="w-full max-w-0">File name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Size</TableHead>
                <TableHead>Uploaded</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recent?.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="max-w-0">
                    <div className="flex min-w-0 items-center gap-3">
                      <FileTypeChip filename={item.filename} />
                      <div className="min-w-0">
                        <Link
                          to={`/documents/${item.id}`}
                          className="block truncate font-medium text-text-strong-950 hover:text-primary-base hover:underline"
                        >
                          {item.filename}
                        </Link>
                        {item.title && (
                          <p className="truncate text-xs text-text-soft-400">{item.title}</p>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <Badge variant="secondary">{extensionOf(item.filename)}</Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums text-text-sub-600">
                    {formatBytes(item.sizeBytes)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums text-text-sub-600">
                    {formatDate(item.uploadedAt)}
                  </TableCell>
                  <TableCell>
                    <StatusPill status={item.status} />
                  </TableCell>
                </TableRow>
              ))}
              {!isLoading && recent?.items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-text-sub-600">
                    Nothing uploaded yet. Drop a file above to get started.
                  </TableCell>
                </TableRow>
              )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

/**
 * The outcome of one upload attempt, in the words that attempt earned.
 *
 * A refusal is not an error — the file is already here, which is the system
 * working — so it is toned as information rather than as a failure.
 */
function Notice({ notice }: { notice: UploadNotice }) {
  if (notice.kind === 'failed') {
    return (
      <p className="rounded-md bg-danger-light px-3 py-2 text-sm text-danger-base">
        <span className="font-medium">{notice.filename}</span> — {notice.message}
      </p>
    );
  }

  if (notice.kind === 'duplicate') {
    return (
      <p className="flex items-start gap-2 rounded-md bg-bg-weak-50 px-3 py-2 text-sm text-text-sub-600">
        <Copy className="mt-0.5 size-4 shrink-0 text-text-soft-400" />
        <span>
          <span className="font-medium text-text-strong-950">{notice.filename}</span> was not
          uploaded
          {notice.duplicateOf ? (
            <>
              {' '}
              — it is identical to{' '}
              <Link
                to={`/documents/${notice.duplicateOf.id}`}
                className="text-primary-base hover:underline"
              >
                {notice.duplicateOf.filename}
              </Link>
              , already in the library.
            </>
          ) : (
            ', because an identical file is already in the library.'
          )}
        </span>
      </p>
    );
  }

  // Same name, different content: a revision, not a repeat.
  const versions = notice.previousVersions ?? [];
  return (
    <p className="flex items-start gap-2 rounded-md bg-primary-lighter px-3 py-2 text-sm text-text-sub-600">
      <Info className="mt-0.5 size-4 shrink-0 text-primary-base" />
      <span>
        <span className="font-medium text-text-strong-950">{notice.filename}</span> was uploaded.{' '}
        {versions.length} earlier file{versions.length > 1 ? 's' : ''} share this name:{' '}
        {versions.map((version, index) => (
          <span key={version.id}>
            {index > 0 && ', '}
            <Link to={`/documents/${version.id}`} className="text-primary-base hover:underline">
              {formatDate(version.uploadedAt)}
            </Link>
          </span>
        ))}
      </span>
    </p>
  );
}

/** The extension as a reader writes it, for the column that names the format. */
function extensionOf(filename: string): string {
  return filename.split('.').pop()?.toUpperCase() ?? 'FILE';
}

