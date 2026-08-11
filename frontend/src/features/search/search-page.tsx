import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { apiClient, extractErrorMessage } from '@/lib/api-client';
import { cn } from '@/lib/utils';
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

interface Citation {
  documentId: string;
  title: string | null;
  filename: string;
  chunkId: string;
  snippet: string;
}

const SUGGESTIONS = ['hợp đồng với Saigon Retail', 'hop dong', 'chính sách lưu trữ dữ liệu'];

export function SearchPage() {
  const [mode, setMode] = useState<'search' | 'ask'>('search');
  const [query, setQuery] = useState('');

  const search = useMutation({
    mutationFn: async (q: string) =>
      (await apiClient.post<{ hits: SearchHit[]; degraded: boolean }>('/search', { q })).data,
  });

  const ask = useMutation({
    mutationFn: async (q: string) =>
      (await apiClient.post<{ answer: string; citations: Citation[]; unsourced: boolean }>('/ask', {
        q,
      })).data,
  });

  const active = mode === 'search' ? search : ask;

  function submit(event: FormEvent) {
    event.preventDefault();
    const q = query.trim();
    if (!q) return;
    if (mode === 'search') search.mutate(q);
    else ask.mutate(q);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Tìm kiếm & Hỏi đáp</h1>
        <p className="text-sm text-muted-foreground">
          Tìm kiếm lai ghép giữa ngữ nghĩa và từ khoá. Gõ không dấu vẫn ra tài liệu có dấu.
        </p>
      </div>

      <div className="flex gap-1 rounded-lg bg-secondary p-1">
        {(['search', 'ask'] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setMode(value)}
            className={cn(
              'flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              mode === value ? 'bg-background shadow-sm' : 'text-muted-foreground',
            )}
          >
            {value === 'search' ? 'Tìm kiếm' : 'Hỏi AI'}
          </button>
        ))}
      </div>

      <form className="flex gap-2" onSubmit={submit}>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={
            mode === 'search' ? 'Nhập từ khoá hoặc câu mô tả' : 'Hỏi một câu về kho tài liệu'
          }
        />
        <Button type="submit" disabled={active.isPending}>
          {active.isPending ? 'Đang xử lý…' : mode === 'search' ? 'Tìm' : 'Hỏi'}
        </Button>
      </form>

      <div className="flex flex-wrap gap-2">
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            className="rounded-full border px-3 py-1 text-xs text-muted-foreground hover:bg-accent"
            onClick={() => {
              setQuery(suggestion);
              if (mode === 'search') search.mutate(suggestion);
              else ask.mutate(suggestion);
            }}
          >
            {suggestion}
          </button>
        ))}
      </div>

      {active.isError && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {extractErrorMessage(active.error, 'Không thực hiện được truy vấn.')}
        </p>
      )}

      {mode === 'search' && !search.data && !search.isPending && (
        <p className="text-sm text-muted-foreground">
          Nhập một truy vấn, hoặc bấm một gợi ý ở trên để bắt đầu.
        </p>
      )}

      {mode === 'search' && search.data && <SearchResults data={search.data} />}

      {mode === 'ask' && ask.data && <AskAnswer data={ask.data} />}
    </div>
  );
}

function SearchResults({ data }: { data: { hits: SearchHit[]; degraded: boolean } }) {
  return (
    <div className="space-y-3">
      {data.degraded && (
        <p className="rounded-md bg-amber-100 px-3 py-2 text-sm text-amber-900">
          Một nhánh tìm kiếm không phản hồi — kết quả chỉ đến từ nhánh còn lại.
        </p>
      )}

      {data.hits.length === 0 && (
        <p className="text-sm text-muted-foreground">Không tìm thấy tài liệu nào khớp.</p>
      )}

      {data.hits.map((hit) => (
        <Card key={hit.id}>
          <CardContent className="space-y-2 pt-6">
            <div className="flex flex-wrap items-center gap-2">
              <Link to={`/documents/${hit.id}`} className="font-medium hover:underline">
                {hit.title ?? hit.filename}
              </Link>
              {hit.documentType && <Badge variant="secondary">{typeLabel(hit.documentType)}</Badge>}
              <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                {hit.lanes.join(' + ')} · {hit.score.toFixed(3)}
              </span>
            </div>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
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
      <mark className="rounded bg-amber-200 px-0.5 text-foreground">
        {snippet.text.slice(snippet.matchStart, snippet.matchEnd)}
      </mark>
      {snippet.text.slice(snippet.matchEnd)}
    </>
  );
}

function AskAnswer({
  data,
}: {
  data: { answer: string; citations: Citation[]; unsourced: boolean };
}) {
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="whitespace-pre-wrap pt-6 text-sm leading-relaxed">
          {data.answer}
        </CardContent>
      </Card>

      {data.unsourced && (
        <p className="rounded-md bg-amber-100 px-3 py-2 text-sm text-amber-900">
          Câu trả lời này không trích dẫn nguồn nào. Hãy đối chiếu lại với tài liệu gốc.
        </p>
      )}

      {data.citations.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">
            Nguồn ({data.citations.length})
          </h2>
          {data.citations.map((citation) => (
            <Card key={`${citation.documentId}-${citation.chunkId}`}>
              <CardContent className="space-y-1 pt-6">
                <Link
                  to={`/documents/${citation.documentId}`}
                  className="text-sm font-medium hover:underline"
                >
                  {citation.title ?? citation.filename}
                </Link>
                <p className="text-sm text-muted-foreground">{citation.snippet}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
