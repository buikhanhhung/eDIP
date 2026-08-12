import { useMutation } from '@tanstack/react-query';
import { Search as SearchIcon, Sparkles } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { FileTypeChip } from '@/components/file-type-chip';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { apiClient, extractErrorMessage } from '@/lib/api-client';
import { typeLabel } from '@/features/documents/document-types';

interface Snippet {
  text: string;
  matchStart: number | null;
  matchEnd: number | null;
}

interface SearchHit {
  id: string;
  title: string | null;
  filename: string;
  documentType: string | null;
  score: number;
  snippet: Snippet;
  lanes: string[];
}

// Left in Vietnamese on purpose: they run against a Vietnamese corpus, and the
// middle one is unaccented to show that a query without diacritics still finds
// documents that have them.
const SUGGESTIONS = ['hợp đồng với Saigon Retail', 'hop dong', 'chính sách lưu trữ dữ liệu'];

export function SearchPage() {
  const [query, setQuery] = useState('');

  const search = useMutation({
    mutationFn: async (q: string) =>
      (await apiClient.post<{ hits: SearchHit[]; degraded: boolean }>('/search', { q })).data,
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    const q = query.trim();
    if (q) search.mutate(q);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={SearchIcon}
        title="Search"
        description="Hybrid search across meaning and keywords. Queries without Vietnamese diacritics still match documents that have them."
        actions={
          <Link to="/ask" className={buttonVariants({ variant: 'outline' })}>
            <Sparkles className="size-4" />
            Ask AI instead
          </Link>
        }
      />

      <form className="flex gap-2" onSubmit={submit}>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Enter a keyword or describe what you are looking for"
        />
        <Button type="submit" disabled={search.isPending}>
          {search.isPending ? 'Searching…' : 'Search'}
        </Button>
      </form>

      <div className="flex flex-wrap gap-2">
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            className="rounded-full border border-stroke-soft-200 bg-bg-white-0 px-3 py-1 text-xs text-text-sub-600 transition-default hover:border-primary-base hover:text-primary-base"
            onClick={() => {
              setQuery(suggestion);
              search.mutate(suggestion);
            }}
          >
            {suggestion}
          </button>
        ))}
      </div>

      {search.isError && (
        <p className="rounded-md bg-danger-light px-3 py-2 text-sm text-danger-base">
          {extractErrorMessage(search.error, 'The query could not be run.')}
        </p>
      )}

      {!search.data && !search.isPending && (
        <p className="text-sm text-text-sub-600">
          Enter a query, or pick one of the suggestions above to get started.
        </p>
      )}

      {search.data && <SearchResults data={search.data} />}
    </div>
  );
}

function SearchResults({ data }: { data: { hits: SearchHit[]; degraded: boolean } }) {
  return (
    <div className="space-y-3">
      {data.degraded && (
        <p className="rounded-md bg-warning-light px-3 py-2 text-sm text-warning-base">
          One search lane did not respond — these results come from the other lane only.
        </p>
      )}

      {data.hits.length === 0 && (
        <p className="text-sm text-text-sub-600">No documents matched.</p>
      )}

      {data.hits.map((hit) => (
        <Card key={hit.id}>
          <CardContent className="space-y-2 pt-6">
            <div className="flex flex-wrap items-center gap-2">
              <FileTypeChip filename={hit.filename} />
              <Link to={`/documents/${hit.id}`} className="font-medium hover:underline">
                {hit.title ?? hit.filename}
              </Link>
              {hit.documentType && <Badge variant="secondary">{typeLabel(hit.documentType)}</Badge>}
              <span className="ml-auto text-xs tabular-nums text-text-sub-600">
                {hit.lanes.join(' + ')} · {hit.score.toFixed(3)}
              </span>
            </div>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-text-sub-600">
              <HighlightedSnippet snippet={hit.snippet} />
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/**
 * Marks the matched range by slicing at the offsets the API returned. Document
 * text is attacker-controlled, so it is never handed to dangerouslySetInnerHTML.
 */
function HighlightedSnippet({ snippet }: { snippet: Snippet }) {
  if (snippet.matchStart === null || snippet.matchEnd === null) return <>{snippet.text}</>;

  return (
    <>
      {snippet.text.slice(0, snippet.matchStart)}
      <mark className="rounded bg-warning-light px-0.5 text-text-strong-950">
        {snippet.text.slice(snippet.matchStart, snippet.matchEnd)}
      </mark>
      {snippet.text.slice(snippet.matchEnd)}
    </>
  );
}
