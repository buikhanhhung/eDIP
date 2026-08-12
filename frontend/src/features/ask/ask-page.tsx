import { useMutation } from '@tanstack/react-query';
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Copy,
  FileSearch,
  FileStack,
  Lightbulb,
  MessageSquare,
  Plus,
  Scale,
  Send,
  Sparkles,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { FileTypeChip } from '@/components/file-type-chip';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { apiClient, extractErrorMessage } from '@/lib/api-client';
import { copyText } from '@/lib/clipboard';
import { cn } from '@/lib/utils';

interface Citation {
  documentId: string;
  title: string | null;
  filename: string;
  chunkId: string;
  snippet: string;
}

interface AskResponse {
  answer: string;
  citations: Citation[];
  unsourced: boolean;
}

interface Exchange extends AskResponse {
  id: string;
  question: string;
  /** ISO, so a reload can still say when this was asked. */
  askedAt: string;
}

/** Matches the server's own ceiling on a question. */
const MAX_QUESTION = 2000;

/** Past this the panel is a log, not a list of recent conversations. */
const MAX_HISTORY = 20;

const STORAGE_KEY = 'edip.ask.history';

/**
 * Openers, in Vietnamese because the corpus is.
 *
 * Each one fills the composer rather than firing straight away: they are
 * half-written questions, and the document or the clause still has to be named.
 */
const STARTERS: { icon: LucideIcon; tone: string; title: string; hint: string; prompt: string }[] =
  [
    {
      icon: FileStack,
      tone: 'bg-blue-50 text-blue-600',
      title: 'Summarize a document',
      hint: 'Get key points instantly',
      prompt: 'Tóm tắt nội dung chính của tài liệu ',
    },
    {
      icon: Scale,
      tone: 'bg-emerald-50 text-emerald-600',
      title: 'Compare documents',
      hint: 'Find differences & similarities',
      prompt: 'So sánh điểm khác nhau giữa tài liệu ',
    },
    {
      icon: FileSearch,
      tone: 'bg-amber-50 text-amber-600',
      title: 'Extract information',
      hint: 'Get specific data',
      prompt: 'Trích xuất các mốc thời gian và giá trị hợp đồng trong ',
    },
    {
      icon: Lightbulb,
      tone: 'bg-violet-50 text-violet-600',
      title: 'Ask about policies',
      hint: 'Find relevant rules',
      prompt: 'Chính sách quy định gì về ',
    },
  ];

const TIPS = [
  'Ask in natural language — “tóm tắt hợp đồng MSA và các nghĩa vụ chính”.',
  'Questions without Vietnamese diacritics still match documents that have them.',
  'Every answer cites the documents it used; open one to check it.',
];

export function AskPage() {
  const [question, setQuestion] = useState('');
  const [history, setHistory] = useState<Exchange[]>(readHistory);
  const composer = useRef<HTMLTextAreaElement>(null);
  const transcriptEnd = useRef<HTMLDivElement>(null);

  const ask = useMutation({
    mutationFn: async (q: string) => (await apiClient.post<AskResponse>('/ask', { q })).data,
    onSuccess: (data, q) => {
      setHistory((previous) =>
        [
          { id: crypto.randomUUID(), question: q, askedAt: new Date().toISOString(), ...data },
          ...previous,
        ].slice(0, MAX_HISTORY),
      );
      setQuestion('');
    },
  });

  // The newest exchange is prepended, so the transcript reads oldest-first.
  const transcript = [...history].reverse();

  useEffect(() => {
    writeHistory(history);
  }, [history]);

  useEffect(() => {
    transcriptEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [history.length, ask.isPending]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const q = question.trim();
    if (q && !ask.isPending) ask.mutate(q);
  }

  function startFrom(prompt: string) {
    setQuestion(prompt);
    composer.current?.focus();
  }

  const latest = history[0];

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Sparkles}
        title="Ask AI"
        description="Chat with your documents. Get instant answers."
        actions={
          history.length > 0 && (
            <Button variant="outline" onClick={() => setHistory([])}>
              <Plus className="mr-1.5 size-4" />
              New chat
            </Button>
          )
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_19rem]">
        <div className="min-w-0 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {STARTERS.map((starter) => (
              <button
                key={starter.title}
                type="button"
                onClick={() => startFrom(starter.prompt)}
                className="flex items-center gap-3 rounded-xl border border-stroke-soft-200 bg-bg-white-0 p-3 text-left shadow-soft transition-default hover:border-primary-base"
              >
                <span
                  className={cn('grid size-9 shrink-0 place-items-center rounded-lg', starter.tone)}
                >
                  <starter.icon className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-text-strong-950">
                    {starter.title}
                  </span>
                  <span className="block truncate text-xs text-text-soft-400">{starter.hint}</span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-text-soft-400" />
              </button>
            ))}
          </div>

          <Card>
            <CardContent className="space-y-6 p-5">
              {transcript.length === 0 && !ask.isPending && (
                <p className="py-8 text-center text-sm text-text-sub-600">
                  Ask a question about the document collection, or start from one of the openers
                  above.
                </p>
              )}

              {transcript.map((exchange) => (
                <Exchange key={exchange.id} exchange={exchange} />
              ))}

              {ask.isPending && (
                <p className="text-sm text-text-sub-600">Reading the documents…</p>
              )}

              {ask.isError && (
                <p className="rounded-md bg-danger-light px-3 py-2 text-sm text-danger-base">
                  {extractErrorMessage(ask.error, 'The question could not be answered.')}
                </p>
              )}

              <div ref={transcriptEnd} />
            </CardContent>
          </Card>

          <form onSubmit={submit}>
            <div className="rounded-xl border border-stroke-soft-200 bg-bg-white-0 p-3 shadow-soft focus-within:border-primary-base">
              <textarea
                ref={composer}
                rows={2}
                value={question}
                maxLength={MAX_QUESTION}
                onChange={(event) => setQuestion(event.target.value)}
                onKeyDown={(event) => {
                  // Enter sends, Shift+Enter breaks the line — a question long
                  // enough to need paragraphs is rare, sending is not.
                  if (event.key === 'Enter' && !event.shiftKey) submit(event);
                }}
                placeholder="Ask anything about your documents…"
                className="w-full resize-none bg-transparent text-sm text-text-strong-950 outline-none placeholder:text-text-soft-400"
              />
              <div className="flex items-center justify-end gap-3">
                <span className="text-xs tabular-nums text-text-soft-400">
                  {question.length}/{MAX_QUESTION}
                </span>
                <Button type="submit" disabled={ask.isPending || question.trim().length === 0}>
                  <Send className="mr-1.5 size-4" />
                  {ask.isPending ? 'Asking…' : 'Send'}
                </Button>
              </div>
            </div>
          </form>
        </div>

        <div className="space-y-4">
          <ConversationList
            history={history}
            onClear={() => setHistory([])}
            onPick={(id) => document.getElementById(`exchange-${id}`)?.scrollIntoView({
              behavior: 'smooth',
              block: 'center',
            })}
          />
          <RelatedDocuments citations={latest?.citations ?? []} />
          <QuickTips />
        </div>
      </div>
    </div>
  );
}

function Exchange({ exchange }: { exchange: Exchange }) {
  return (
    <div id={`exchange-${exchange.id}`} className="space-y-4">
      <div className="flex justify-end gap-3">
        <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-bg-weak-50 px-4 py-3">
          <p className="whitespace-pre-wrap text-sm text-text-strong-950">{exchange.question}</p>
          <p className="mt-1 text-right text-[11px] text-text-soft-400">
            {formatTime(exchange.askedAt)}
          </p>
        </div>
      </div>

      <div className="flex gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-violet-50">
          <Sparkles className="size-4 text-violet-600" />
        </span>

        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-text-strong-950">
              {withoutMarkers(exchange.answer)}
            </p>
            <CopyAnswer text={exchange.answer} />
          </div>

          {exchange.unsourced && (
            <p className="flex items-start gap-2 rounded-lg bg-warning-light px-3 py-2 text-sm text-warning-base">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              This answer cites no source. Check it against the original documents before relying
              on it.
            </p>
          )}

          {exchange.citations.length > 0 && (
            <div className="space-y-2 border-t border-stroke-soft-200 pt-3">
              <p className="text-subheading-xs uppercase text-text-soft-400">
                Sources ({exchange.citations.length})
              </p>
              {exchange.citations.map((citation) => (
                <Link
                  key={`${citation.documentId}-${citation.chunkId}`}
                  to={`/documents/${citation.documentId}`}
                  className="block rounded-lg border border-stroke-soft-200 p-3 transition-default hover:border-primary-base"
                >
                  <span className="block truncate text-sm font-medium text-text-strong-950">
                    {citation.title ?? citation.filename}
                  </span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-text-sub-600">
                    {citation.snippet}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CopyAnswer({ text }: { text: string }) {
  const [result, setResult] = useState<'idle' | 'copied' | 'failed'>('idle');

  return (
    <button
      type="button"
      title={result === 'failed' ? 'The browser refused the copy' : 'Copy this answer'}
      onClick={async () => {
        setResult((await copyText(text)) ? 'copied' : 'failed');
        setTimeout(() => setResult('idle'), 1500);
      }}
      className="shrink-0 rounded-md p-1.5 text-text-soft-400 transition-default hover:bg-bg-weak-50 hover:text-text-sub-600"
    >
      {result === 'copied' ? (
        <Check className="size-4 text-success-base" />
      ) : (
        <Copy className={cn('size-4', result === 'failed' && 'text-danger-base')} />
      )}
    </button>
  );
}

/**
 * The questions asked so far, kept in this browser.
 *
 * Nothing on the server records a conversation — `/ask` answers one question at
 * a time and forgets it — so this list is local by construction. It says so,
 * rather than implying an account-wide history that would vanish on another
 * machine.
 */
function ConversationList({
  history,
  onClear,
  onPick,
}: {
  history: Exchange[];
  onClear: () => void;
  onPick: (id: string) => void;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary-base" />
            <h2 className="text-sm font-semibold text-text-strong-950">Conversation</h2>
          </div>
          {history.length > 0 && (
            <button
              type="button"
              onClick={onClear}
              title="Clear this browser's history"
              className="rounded-md p-1 text-text-soft-400 transition-default hover:bg-bg-weak-50 hover:text-danger-base"
            >
              <Trash2 className="size-4" />
            </button>
          )}
        </div>

        {history.length === 0 ? (
          <p className="text-sm text-text-sub-600">No questions yet.</p>
        ) : (
          <>
            <ul className="space-y-0.5">
              {history.map((exchange) => (
                <li key={exchange.id}>
                  <button
                    type="button"
                    onClick={() => onPick(exchange.id)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-default hover:bg-bg-weak-50"
                  >
                    <MessageSquare className="size-3.5 shrink-0 text-text-soft-400" />
                    <span className="min-w-0 flex-1 truncate text-sm text-text-sub-600">
                      {exchange.question}
                    </span>
                    <span className="shrink-0 text-xs text-text-soft-400">
                      {formatWhen(exchange.askedAt)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-3 border-t border-stroke-soft-200 pt-2 text-xs text-text-soft-400">
              Kept in this browser only.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** The documents the last answer actually leaned on. */
function RelatedDocuments({ citations }: { citations: Citation[] }) {
  const unique = citations.filter(
    (citation, index) =>
      citations.findIndex((other) => other.documentId === citation.documentId) === index,
  );

  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-text-strong-950">Related documents</h2>
          <Link to="/library" className="text-xs text-primary-base hover:underline">
            View all
          </Link>
        </div>

        {unique.length === 0 ? (
          <p className="text-sm text-text-sub-600">
            The documents an answer cites will appear here.
          </p>
        ) : (
          <ul className="space-y-2">
            {unique.map((citation) => (
              <li key={citation.documentId}>
                <Link
                  to={`/documents/${citation.documentId}`}
                  className="flex items-center gap-2.5 rounded-lg p-1.5 transition-default hover:bg-bg-weak-50"
                >
                  <FileTypeChip filename={citation.filename} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-text-strong-950">
                      {citation.filename}
                    </span>
                    <span className="block truncate text-xs text-text-soft-400">
                      {citation.title ?? '—'}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function QuickTips() {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <Lightbulb className="size-4 text-amber-500" />
          <h2 className="text-sm font-semibold text-text-strong-950">Quick tips</h2>
        </div>
        <ul className="space-y-2">
          {TIPS.map((tip) => (
            <li key={tip} className="flex gap-2 text-xs leading-relaxed text-text-sub-600">
              <span className="mt-1.5 size-1 shrink-0 rounded-full bg-primary-base" />
              {tip}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function readHistory(): Exchange[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    // Anything could be sitting under this key — another version of the page,
    // or a hand-edited value. Shape it or drop it.
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is Exchange => typeof entry?.question === 'string')
      : [];
  } catch {
    return [];
  }
}

function writeHistory(history: Exchange[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch {
    // A full or blocked storage costs the history, not the answer on screen.
  }
}

/**
 * Hides the citation markers the model was told to insert.
 *
 * `[a043-1]` is machinery: the server hands each retrieved chunk a nonce-prefixed
 * label so it can tell which ones an answer actually used, and reads them back
 * out to build the source list below. Having done its job it is noise on the
 * page — and it reads as a defect, since nothing on screen explains it.
 *
 * The same shape the server matches: four hex digits, a dash, a number.
 */
function withoutMarkers(answer: string): string {
  return answer.replace(/\s*\[[a-f0-9]{4}-\d+\]/g, '');
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

/** Today shows a clock; anything older shows the day it was asked. */
function formatWhen(iso: string): string {
  const asked = new Date(iso);
  const today = new Date();
  const sameDay = asked.toDateString() === today.toDateString();
  if (sameDay) return formatTime(iso);

  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (asked.toDateString() === yesterday.toDateString()) return 'Yesterday';

  return asked.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
