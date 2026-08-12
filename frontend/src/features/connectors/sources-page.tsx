import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Cloud, FileText, Folder, Home } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { apiClient, extractErrorMessage } from '@/lib/api-client';
import { cn, formatDate } from '@/lib/utils';

/** Matches the server's cap, so the button says no before the API does. */
const MAX_PER_IMPORT = 20;

type ImportPlan =
  | { action: 'download'; filename: string }
  | { action: 'export'; filename: string; exportMimeType: string }
  | { action: 'skip'; reason: string };

interface DriveEntry {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  plan: ImportPlan;
}

interface ImportResult {
  driveId: string;
  name: string;
  status: 'queued' | 'duplicate' | 'failed';
  error?: string;
}

const FOLDER_MIME = 'application/vnd.google-apps.folder';

export function SourcesPage() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  // A breadcrumb rather than a single id: Drive gives no parent chain back, so
  // the way out of a folder is the trail taken into it.
  const [trail, setTrail] = useState<{ id: string; name: string }[]>([
    { id: 'root', name: 'My Drive' },
  ]);
  const [selected, setSelected] = useState<Record<string, DriveEntry>>({});
  const [results, setResults] = useState<ImportResult[]>([]);

  const folder = trail[trail.length - 1];
  const callbackError = searchParams.get('error');

  const status = useQuery({
    queryKey: ['drive-status'],
    queryFn: async () =>
      (
        await apiClient.get<{ configured: boolean; connected: boolean; accountEmail?: string }>(
          '/connectors/google/status',
        )
      ).data,
  });

  const listing = useQuery({
    queryKey: ['drive-files', folder.id],
    queryFn: async () =>
      (
        await apiClient.get<{ files: DriveEntry[] }>('/connectors/google/files', {
          params: { folderId: folder.id },
        })
      ).data,
    enabled: status.data?.connected === true,
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
      setSelected({});
      await queryClient.invalidateQueries({ queryKey: ['drive-status'] });
    },
  });

  const runImport = useMutation({
    mutationFn: async () =>
      (
        await apiClient.post<{ results: ImportResult[] }>('/connectors/google/import', {
          files: Object.values(selected).map((entry) => ({
            id: entry.id,
            name: entry.name,
            mimeType: entry.mimeType,
          })),
        })
      ).data,
    onSuccess: async ({ results: imported }) => {
      setResults(imported);
      setSelected({});
      await queryClient.invalidateQueries({ queryKey: ['documents'] });
      await queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
  });

  const chosen = Object.values(selected);

  function toggle(entry: DriveEntry) {
    setSelected((current) => {
      const next = { ...current };
      if (next[entry.id]) delete next[entry.id];
      else next[entry.id] = entry;
      return next;
    });
  }

  function openFolder(entry: DriveEntry) {
    setTrail((current) => [...current, { id: entry.id, name: entry.name }]);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Cloud}
        title="Sources"
        description="Import documents straight from a connected account. Google Docs, Sheets and Slides are converted to Office formats on the way in, so their tables survive."
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

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-6">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-lg bg-primary-lighter">
              <Cloud className="size-5 text-primary-base" />
            </span>
            <div>
              <p className="font-medium text-text-strong-950">Google Drive</p>
              <p className="text-sm text-text-sub-600">
                {status.isLoading
                  ? 'Checking…'
                  : !status.data?.configured
                    ? 'Not configured on this server'
                    : status.data.connected
                      ? `Connected as ${status.data.accountEmail ?? 'unknown account'}`
                      : 'Not connected'}
              </p>
            </div>
          </div>

          {status.data?.configured &&
            (status.data.connected ? (
              <Button variant="outline" size="sm" onClick={() => disconnect.mutate()}>
                Disconnect
              </Button>
            ) : (
              <Button size="sm" disabled={connect.isPending} onClick={() => connect.mutate()}>
                {connect.isPending ? 'Opening Google…' : 'Connect'}
              </Button>
            ))}
        </CardContent>
      </Card>

      {status.data?.configured === false && (
        <p className="text-sm text-text-sub-600">
          Set <code>GOOGLE_CLIENT_ID</code>, <code>GOOGLE_CLIENT_SECRET</code> and{' '}
          <code>ENCRYPTION_KEY</code> in the API environment, then reload this page.
        </p>
      )}

      {status.data?.connected && (
        <>
          <nav className="flex flex-wrap items-center gap-1 text-sm">
            {trail.map((step, index) => (
              <span key={step.id} className="flex items-center gap-1">
                {index > 0 && <ChevronRight className="size-3.5 text-text-soft-400" />}
                <button
                  type="button"
                  className={cn(
                    'rounded px-1.5 py-0.5 transition-default',
                    index === trail.length - 1
                      ? 'font-medium text-text-strong-950'
                      : 'text-text-sub-600 hover:text-primary-base',
                  )}
                  onClick={() => setTrail((current) => current.slice(0, index + 1))}
                >
                  {index === 0 ? <Home className="inline size-3.5" /> : step.name}
                </button>
              </span>
            ))}
          </nav>

          <Card>
            <CardContent className="p-0">
              {listing.isLoading && (
                <p className="p-6 text-sm text-text-sub-600">Reading the folder…</p>
              )}
              {listing.isError && (
                <p className="p-6 text-sm text-danger-base">
                  {extractErrorMessage(listing.error, 'Could not read this folder.')}
                </p>
              )}
              {listing.data?.files.length === 0 && (
                <p className="p-6 text-sm text-text-sub-600">This folder is empty.</p>
              )}

              <div className="divide-y divide-stroke-soft-200">
                {listing.data?.files.map((entry) => {
                  const isFolder = entry.mimeType === FOLDER_MIME;
                  const skipped = entry.plan.action === 'skip';

                  return (
                    <div key={entry.id} className="flex items-center gap-3 px-4 py-2.5">
                      {isFolder ? (
                        <Folder className="size-4 shrink-0 text-primary-base" />
                      ) : (
                        <input
                          type="checkbox"
                          className="size-4 shrink-0"
                          disabled={skipped}
                          checked={Boolean(selected[entry.id])}
                          onChange={() => toggle(entry)}
                        />
                      )}

                      {isFolder ? (
                        <button
                          type="button"
                          className="min-w-0 flex-1 truncate text-left text-sm font-medium hover:text-primary-base"
                          onClick={() => openFolder(entry)}
                        >
                          {entry.name}
                        </button>
                      ) : (
                        <span
                          className={cn(
                            'min-w-0 flex-1 truncate text-sm',
                            skipped ? 'text-text-soft-400' : 'text-text-strong-950',
                          )}
                        >
                          {entry.name}
                        </span>
                      )}

                      {/* Says what will happen before it happens, so a
                          selection is never a guess. */}
                      {entry.plan.action === 'export' && (
                        <Badge variant="secondary">
                          → {entry.plan.filename.split('.').pop()}
                        </Badge>
                      )}
                      {entry.plan.action === 'skip' && !isFolder && (
                        <span className="text-xs text-text-soft-400">{entry.plan.reason}</span>
                      )}
                      <span className="w-24 shrink-0 text-right text-xs tabular-nums text-text-soft-400">
                        {entry.modifiedTime ? formatDate(entry.modifiedTime) : ''}
                      </span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              disabled={chosen.length === 0 || chosen.length > MAX_PER_IMPORT || runImport.isPending}
              onClick={() => runImport.mutate()}
            >
              <FileText className="mr-1.5 size-4" />
              {runImport.isPending ? 'Importing…' : `Import ${chosen.length || ''}`.trim()}
            </Button>
            {chosen.length > MAX_PER_IMPORT && (
              <span className="text-sm text-danger-base">
                Select at most {MAX_PER_IMPORT} files at a time.
              </span>
            )}
            {runImport.isError && (
              <span className="text-sm text-danger-base">
                {extractErrorMessage(runImport.error, 'The import failed.')}
              </span>
            )}
          </div>
        </>
      )}

      {results.length > 0 && (
        <Card>
          <CardContent className="divide-y divide-stroke-soft-200 pt-6">
            {results.map((result) => (
              <div key={result.driveId} className="flex items-center gap-3 py-2.5">
                <span className="min-w-0 flex-1 truncate text-sm">{result.name}</span>
                <Badge
                  variant={
                    result.status === 'queued'
                      ? 'success'
                      : result.status === 'duplicate'
                        ? 'secondary'
                        : 'destructive'
                  }
                >
                  {result.status === 'queued'
                    ? 'Queued'
                    : result.status === 'duplicate'
                      ? 'Already in library'
                      : 'Failed'}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
