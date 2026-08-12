import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { apiClient } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { ENTITY_COLORS, GraphCanvas, type GraphEdge, type GraphPayload } from './graph-canvas';
import { NodeDrawer } from './node-drawer';

type GraphEdgeData = GraphEdge['data'];

const ENTITY_TYPES = ['company', 'person', 'project', 'contract', 'invoice', 'department'] as const;

const TYPE_LABELS: Record<string, string> = {
  company: 'Company',
  person: 'Person',
  project: 'Project',
  contract: 'Contract',
  invoice: 'Invoice',
  department: 'Department',
};

export function GraphPage() {
  // 2 by default in the UI, while the API defaults to 1 — a graph where every
  // one-off name is a node is unreadable on a projector.
  const [minShared, setMinShared] = useState(2);
  const [types, setTypes] = useState<string[]>([...ENTITY_TYPES]);
  const [showRelations, setShowRelations] = useState(true);
  const [selected, setSelected] = useState<{ id: string; kind: string; label: string } | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<GraphEdgeData | null>(null);
  const [focused, setFocused] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['graph', minShared, showRelations],
    queryFn: async () =>
      (
        await apiClient.get<GraphPayload>('/graph', {
          params: { minShared, relations: showRelations },
        })
      ).data,
  });

  /**
   * Type filtering and neighbourhood focus both run here, on data already in
   * the page — neither needs a round trip, because `getGraph` already returns
   * every edge touching the documents on screen.
   */
  const visible = useMemo<GraphPayload>(() => {
    if (!data) return { nodes: [], edges: [] };

    const allowed = new Set(
      data.nodes
        .filter((node) => node.data.kind === 'document' || types.includes(node.data.type ?? ''))
        .map((node) => node.data.id),
    );

    let edges = data.edges.filter(
      (edge) => allowed.has(edge.data.source) && allowed.has(edge.data.target),
    );

    if (focused) {
      const neighbours = new Set<string>([focused]);
      for (const edge of edges) {
        if (edge.data.source === focused) neighbours.add(edge.data.target);
        if (edge.data.target === focused) neighbours.add(edge.data.source);
      }
      edges = edges.filter(
        (edge) => neighbours.has(edge.data.source) && neighbours.has(edge.data.target),
      );
      return {
        nodes: data.nodes.filter((node) => neighbours.has(node.data.id)),
        edges,
      };
    }

    const connected = new Set(edges.flatMap((edge) => [edge.data.source, edge.data.target]));
    return {
      nodes: data.nodes.filter((node) => connected.has(node.data.id)),
      edges,
    };
  }, [data, types, focused]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Knowledge graph</h1>
          <p className="text-sm text-text-sub-600">
            {visible.nodes.length} nodes · {visible.edges.length} links · hover a node to isolate
            its neighbourhood, double-click to zoom into it
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-text-sub-600">
            <input
              type="checkbox"
              checked={showRelations}
              onChange={(e) => setShowRelations(e.target.checked)}
            />
            Show relations
          </label>

          <label className="flex items-center gap-2 text-sm text-text-sub-600">
            Shared documents
            <input
              type="range"
              min={1}
              max={4}
              value={minShared}
              onChange={(e) => setMinShared(Number(e.target.value))}
            />
            <span className="w-4 tabular-nums text-text-strong-950">{minShared}</span>
          </label>
          {focused && (
            <Button variant="outline" size="sm" onClick={() => setFocused(null)}>
              Clear focus
            </Button>
          )}
        </div>
      </div>

      {/* Filter and legend in one control: the swatch that turns a type off is
          the same swatch that says what its colour means on the canvas. */}
      <div className="flex flex-wrap items-center gap-1.5">
        {ENTITY_TYPES.map((type) => {
          const on = types.includes(type);
          return (
            <button
              key={type}
              type="button"
              aria-pressed={on}
              onClick={() =>
                setTypes((current) =>
                  current.includes(type)
                    ? current.filter((value) => value !== type)
                    : [...current, type],
                )
              }
              className={cn(
                'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-default',
                on
                  ? 'border-stroke-soft-200 bg-bg-white-0 text-text-strong-950 shadow-soft'
                  : 'border-transparent bg-bg-white-0/50 text-text-soft-400',
              )}
            >
              <span
                className="size-2.5 rounded-full transition-default"
                style={{ backgroundColor: on ? ENTITY_COLORS[type] : '#cbd5e1' }}
              />
              {TYPE_LABELS[type]}
            </button>
          );
        })}
        <span className="ml-1 flex items-center gap-1.5 text-xs text-text-soft-400">
          <span className="h-2.5 w-4 rounded-sm border border-primary-base bg-primary-lighter" />
          Document
        </span>
      </div>

      {isLoading && <p className="text-sm text-text-sub-600">Building the graph…</p>}
      {isError && <p className="text-sm text-danger-base">Could not load the graph.</p>}

      {data && (
        <Card>
          <CardContent className="p-0">
            {visible.nodes.length === 0 ? (
              <p className="p-10 text-center text-sm text-text-sub-600">
                No nodes match the current filters. Lower “shared documents” to 1 to see
                everything.
              </p>
            ) : (
              <GraphCanvas
                payload={visible}
                onSelect={(node) => setSelected(node)}
                onFocus={(id) => setFocused(id)}
                onSelectEdge={(edge) => setSelectedEdge(edge)}
              />
            )}
          </CardContent>
        </Card>
      )}

      {selectedEdge && (
        <Card>
          <CardContent className="space-y-2 pt-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <Badge>{selectedEdge.label}</Badge>
                <p className="mt-2 text-sm text-text-sub-600">
                  The sentence this link was read from:
                </p>
                {/* The evidence is what makes a typed edge checkable rather
                    than something the reader has to take on trust. */}
                <blockquote className="mt-1 border-l-2 border-stroke-soft-200 pl-3 text-sm italic">
                  “{selectedEdge.evidence}”
                </blockquote>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setSelectedEdge(null)}>
                  Close
                </Button>
                {selectedEdge.documentId && (
                  <Link
                    to={`/documents/${selectedEdge.documentId}`}
                    className="text-sm text-primary-base hover:underline"
                  >
                    Open source document
                  </Link>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <NodeDrawer node={selected} onClose={() => setSelected(null)} onFocus={setFocused} />
    </div>
  );
}
