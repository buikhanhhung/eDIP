import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  Check,
  ChevronRight,
  Cloud,
  Copy,
  FolderOpen,
  Info,
  ScanText,
  Tags,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Capability } from '@/components/capability';
import { ChunkingStrategyDialog } from '@/components/chunking-strategy-dialog';
import { GoogleDriveLogo } from '@/components/google-drive-logo';
import { PageHeader } from '@/components/page-header';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CHUNKING_LABELS } from '@/features/documents/document-types';
import { apiClient, extractErrorMessage } from '@/lib/api-client';
import { openDrivePicker, type PickedEntry } from '@/lib/google-picker';
import { cn, formatDate } from '@/lib/utils';

interface DriveStatus {
  configured: boolean;
  connected: boolean;
  accountEmail?: string | null;
  createdAt?: string;
}

interface PickerConfig {
  ready: boolean;
  clientId: string;
  apiKey: string;
  accessToken: string;
}

interface ImportOutcome {
  queued: number;
  /** Named with the reason, so a file left behind is never a silent omission. */
  skipped: { name: string; reason: string }[];
}

export function SourcesPage() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);
  // Asked before Drive opens, for the same reason as a local upload: the answer
  // decides how every file in the selection is read.
  const [asking, setAsking] = useState(false);
  const [chunking, setChunking] = useState(Object.keys(CHUNKING_LABELS)[0]);

  const callbackError = searchParams.get('error');

  const status = useQuery({
    queryKey: ['drive-status'],
    queryFn: async () => (await apiClient.get<DriveStatus>('/connectors/google/status')).data,
  });

  const connect = useMutation({
    mutationFn: async () =>
      (await apiClient.get<{ url: string }>('/connectors/google/authorize')).data,
    onSuccess: ({ url }) => {
      // Full navigation, not a popup: Google refuses to render its consent
      // screen inside a frame, and a popup is the first thing a browser blocks.
      window.location.href = url;
    },
  });

  const disconnect = useMutation({
    mutationFn: async () => apiClient.delete('/connectors/google/connection'),
    onSuccess: async () => {
      setOutcome(null);
      await queryClient.invalidateQueries({ queryKey: ['drive-status'] });
    },
  });

  /**
   * Open the picker, then hand whatever came back to the server.
   *
   * The Drive token is fetched for this press and kept in this closure only —
   * never in state, never in storage. It is the one credential the page is
   * trusted with, and the shorter its life here the better.
   */
  const pick = useMutation({
    mutationFn: async (chunkingStrategy: string): Promise<ImportOutcome | null> => {
      const config = (await apiClient.get<PickerConfig>('/connectors/google/picker-config')).data;
      if (!config.ready) {
        throw new Error(
          'The file picker is not configured on this server. Set GOOGLE_API_KEY and restart the API.',
        );
      }

      const picked: PickedEntry[] = await openDrivePicker(config);
      if (picked.length === 0) return null;

      return (
        await apiClient.post<ImportOutcome>('/connectors/google/import', {
          chunkingStrategy,
          files: picked.map((entry) => ({
            id: entry.id,
            name: entry.name,
            mimeType: entry.mimeType,
          })),
        })
      ).data;
    },
    onSuccess: async (result) => {
      // Cancelling leaves the previous summary alone rather than blanking it.
      if (!result) return;
      setOutcome(result);
      await queryClient.invalidateQueries({ queryKey: ['documents'] });
      await queryClient.invalidateQueries({ queryKey: ['overview'] });
    },
  });

  const configured = status.data?.configured ?? false;
  const connected = status.data?.connected ?? false;

  return (
    <div className="space-y-6">
      <ChunkingStrategyDialog
        open={asking}
        value={chunking}
        onChange={setChunking}
        onConfirm={(strategy) => {
          setAsking(false);
          pick.mutate(strategy);
        }}
        onCancel={() => setAsking(false)}
        confirmLabel="Choose from Drive"
      />

      <PageHeader
        icon={Cloud}
        title="Sources"
        description="Import documents straight from a connected account, in the same pipeline an upload goes through."
      />

      {callbackError && (
        <p className="rounded-md bg-danger-light px-3 py-2 text-sm text-danger-base">
          Google Drive could not be connected: {callbackError}
          <button
            type="button"
            className="ml-2 underline"
            onClick={() => setSearchParams({}, { replace: true })}
          >
            Dismiss
          </button>
        </p>
      )}

      <Card className="overflow-hidden">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="flex min-w-0 items-center gap-4">
            {/* The logo sits on plain white at its own size. A brand mark in a
                tinted app-coloured tile reads as our icon, not theirs. */}
            <GoogleDriveLogo className="size-8 shrink-0" />
            <div className="min-w-0">
              <p className="font-medium text-text-strong-950">Google Drive</p>
              <ConnectionLine status={status.data} loading={status.isLoading} />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {connected && (
              <Button disabled={pick.isPending} onClick={() => setAsking(true)}>
                <FolderOpen className="mr-1.5 size-4" />
                {pick.isPending ? 'Opening Drive…' : 'Choose from Drive'}
              </Button>
            )}

            {configured &&
              (connected ? (
                <Button
                  variant="outline"
                  disabled={disconnect.isPending}
                  onClick={() => disconnect.mutate()}
                >
                  Disconnect
                </Button>
              ) : (
                <Button disabled={connect.isPending} onClick={() => connect.mutate()}>
                  {connect.isPending ? 'Opening Google…' : 'Connect'}
                </Button>
              ))}
          </div>
        </CardContent>

        {/* Attached to the connector rather than floating under it: this
            explains that button, and belongs within its edges. */}
        <div className="border-t border-stroke-soft-200 bg-bg-weak-50 px-5 py-3">
          <p className="text-sm text-text-sub-600">
            {configured
              ? connected
                ? 'Pick files or whole folders in Google’s own picker. A folder brings in everything beneath it, and the files arrive in the library over the following minutes rather than all at once.'
                : 'Connect an account to import from it. eDIP asks for read-only access and never writes to your Drive.'
              : 'This server has no Google credentials, so the connector cannot be used yet.'}
          </p>
        </div>
      </Card>

      {!configured && !status.isLoading && (
        <p className="text-sm text-text-sub-600">
          Set <code>GOOGLE_CLIENT_ID</code>, <code>GOOGLE_CLIENT_SECRET</code>,{' '}
          <code>GOOGLE_API_KEY</code> and <code>ENCRYPTION_KEY</code> in the API environment, then
          restart it.
        </p>
      )}

      {pick.isError && (
        <p className="rounded-md bg-danger-light px-3 py-2 text-sm text-danger-base">
          {extractErrorMessage(pick.error, 'The import could not be started.')}
        </p>
      )}

      {outcome && <ImportSummary outcome={outcome} onDismiss={() => setOutcome(null)} />}

      {/* What an import will do, said once here rather than discovered
          afterwards. The same three promises the upload page makes, because it
          is the same pipeline on the other side of both. */}
      <Card>
        <CardContent className="grid gap-6 pt-6 sm:grid-cols-3">
          <Capability
            icon={ScanText}
            tone="bg-primary-lighter text-primary-base"
            title="Converted on the way in"
            body="Docs, Sheets and Slides become Office files, so their tables survive."
          />
          <Capability
            icon={Tags}
            tone="bg-success-light text-success-base"
            title="Read and classified"
            body="Text, tables and scans are extracted, then typed and tagged."
          />
          <Capability
            icon={Copy}
            tone="bg-warning-light text-warning-base"
            title="Imported once"
            body="A file already in the library is recognised and not fetched twice."
          />
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * The line under the connector's name: whether it is live, and as whom.
 *
 * A coloured dot with the word beside it rather than colour alone, and the
 * account only when one is actually known — "Connected as unknown account"
 * reads as a fault, when the truth is simply that the name was never read.
 */
function ConnectionLine({ status, loading }: { status?: DriveStatus; loading: boolean }) {
  if (loading) return <p className="text-sm text-text-sub-600">Checking…</p>;
  if (!status?.configured) {
    return <p className="text-sm text-text-sub-600">Not configured on this server</p>;
  }

  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-text-sub-600">
      <span className="flex items-center gap-1.5">
        <span
          className={cn(
            'size-2 shrink-0 rounded-full',
            status.connected ? 'bg-success-base' : 'bg-bg-soft-200',
          )}
        />
        {status.connected ? 'Connected' : 'Not connected'}
      </span>
      {status.connected && status.accountEmail && (
        <span className="truncate text-text-strong-950">{status.accountEmail}</span>
      )}
      {status.connected && status.createdAt && (
        <span className="text-text-soft-400">since {formatDate(status.createdAt)}</span>
      )}
    </p>
  );
}

/**
 * What the import will do, stated once and then left alone.
 *
 * A banner rather than a toast, and one that waits to be dismissed: it can
 * carry a list of files that were left behind, and a message that takes itself
 * away after four seconds is the wrong place to put something a reader may
 * need to act on.
 *
 * Deliberately not a progress bar either. The files are queued, and where each
 * one is up to is a question the library already answers per document — a
 * second, disagreeing account of the same work is worse than none.
 */
function ImportSummary({ outcome, onDismiss }: { outcome: ImportOutcome; onDismiss: () => void }) {
  const empty = outcome.queued === 0;

  return (
    <div className="overflow-hidden rounded-xl border border-stroke-soft-200 bg-bg-white-0 shadow-soft">
      {/* Tinted band across the top, white disc holding the mark. Solid tokens
          rather than an alpha of one: the palette is `hsl(var(--x))` with no
          alpha channel to modulate, so `/30` would silently do nothing. */}
      <div
        className={cn(
          'flex flex-wrap items-center gap-3 px-4 py-3.5',
          empty ? 'bg-bg-weak-50' : 'bg-success-light',
        )}
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-bg-white-0">
          {empty ? (
            <Info className="size-[18px] text-text-soft-400" />
          ) : (
            <Check className="size-[18px] text-success-base" strokeWidth={2.5} />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <p className="font-medium text-text-strong-950">
            {empty
              ? 'Nothing to import'
              : `${outcome.queued} ${outcome.queued === 1 ? 'file is' : 'files are'} on the way`}
          </p>
          <p className="mt-0.5 text-sm text-text-sub-600">
            {empty
              ? 'Everything picked was either a format eDIP cannot read or already in the library.'
              : 'Each one joins the library as it is read — you do not have to wait on this page.'}
          </p>
        </div>

        {!empty && (
          <Link to="/library" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
            Open library
            <ArrowRight className="size-3.5" />
          </Link>
        )}

        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss this summary"
          className="grid size-8 shrink-0 place-items-center rounded-lg text-text-soft-400 transition-default hover:bg-bg-white-0 hover:text-text-sub-600"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* Folded away: on a good import this is empty, and on a bad one the
          count in the summary is what matters first. */}
      {outcome.skipped.length > 0 && (
        <details className="group border-t border-stroke-soft-200">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2.5 text-sm text-text-sub-600 transition-default hover:bg-bg-weak-50">
            <ChevronRight className="size-4 shrink-0 transition-transform group-open:rotate-90" />
            {outcome.skipped.length} left behind
          </summary>
          <ul className="space-y-1 px-4 pb-3 pt-0.5">
            {outcome.skipped.map((entry) => (
              <li key={`${entry.name}-${entry.reason}`} className="flex gap-3 text-sm">
                <span className="min-w-0 flex-1 truncate text-text-sub-600">{entry.name}</span>
                <span className="shrink-0 text-xs text-text-soft-400">{entry.reason}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
