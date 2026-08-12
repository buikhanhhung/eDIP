import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select } from '@/components/ui/input';
import { apiClient } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import {
  ENTITY_COLORS,
  GraphCanvas,
  type GraphEdge,
  type GraphLayout,
  type GraphPayload,
} from './graph-canvas';
import { NodeDrawer } from './node-drawer';

type GraphEdgeData = GraphEdge['data'];

const ENTITY_TYPES = [
  'company',
  'person',
  'project',
  'contract',
  'invoice',
  'department',
  'date',
  'amount',
] as const;

const TYPE_LABELS: Record<string, string> = {
  company: 'Company',
  person: 'Person',
  project: 'Project',
  contract: 'Contract',
  invoice: 'Invoice',
  department: 'Department',
  date: 'Date',
  amount: 'Amount',
};

const LAYOUT_LABELS: Record<GraphLayout, string> = {
  force: 'Force-directed',
  concentric: 'Concentric',
  circle: 'Circle',
};

export function GraphPage() {
  const [types, setTypes] = useState<string[]>([...ENTITY_TYPES]);
  const [relationType, setRelationType] = useState('');
  // Reach, not confidence: the model scores everything 1, so a confidence
  // slider would move without filtering anything. Most entities occur in a
  // single document, so this one actually cuts.
  const [minDocuments, setMinDocuments] = useState(1);
  const [layout, setLayout] = useState<GraphLayout>('force');
  const [selected, setSelected] = useState<{ id: string; label: string } | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<GraphEdgeData | null>(null);
  const [focused, setFocused] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['graph', relationType, minDocuments],
    queryFn: async () =>
      (
        await apiClient.get<GraphPayload>('/graph', {
          params: {
            ...(relationType ? { relationTypes: relationType } : {}),
            ...(minDocuments > 1 ? { minDocuments } : {}),
          },
        })
      ).data,
  });

  /**
   * Type filtering and neighbourhood focus both run on data already in the
   * page — neither needs a round trip, because the payload already carries
   * every relation among the entities on screen.
   */
  const visible = useMemo(() => {
    if (!data) return { nodes: [], edges: [] };

    const allowed = new Set(
      data.nodes.filter((node) => types.includes(node.data.type)).map((node) => node.data.id),
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
      return { nodes: data.nodes.filter((node) => neighbours.has(node.data.id)), edges };
    }

    // An entity whose every relation was filtered out has nothing left to say
    // on a canvas that draws only relations.
    const connected = new Set(edges.flatMap((edge) => [edge.data.source, edge.data.target]));
    return { nodes: data.nodes.filter((node) => connected.has(node.data.id)), edges };
  }, [data, types, focused]);

  const truncated = data ? data.totalNodes > data.nodes.length : false;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Knowledge graph</h1>
          <p className="text-sm text-text-sub-600">
            {visible.nodes.length} entities · {visible.edges.length} relations
            {truncated && ` · showing the ${data!.nodes.length} best-connected of ${data!.totalNodes}`}
            {' · '}hover to isolate a neighbourhood, double-click to zoom into it
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select
            className="w-52"
            value={relationType}
            onChange={(e) => setRelationType(e.target.value)}
          >
            <option value="">All relations</option>
            {(data?.relationTypes ?? []).map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </Select>
          <Select
            className="w-40"
            value={layout}
            onChange={(e) => setLayout(e.target.value as GraphLayout)}
          >
            {Object.entries(LAYOUT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          <label className="flex items-center gap-2 text-sm text-text-sub-600">
            In at least
            <input
              type="range"
              min={1}
              max={4}
              value={minDocuments}
              onChange={(e) => setMinDocuments(Number(e.target.value))}
            />
            <span className="w-16 tabular-nums text-text-strong-950">
              {minDocuments} doc{minDocuments > 1 ? 's' : ''}
            </span>
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
      </div>

      {isLoading && <p className="text-sm text-text-sub-600">Building the graph…</p>}
      {isError && <p className="text-sm text-danger-base">Could not load the graph.</p>}

      {data && (
        <Card>
          <CardContent className="p-0">
            {visible.nodes.length === 0 ? (
              <div className="space-y-1 p-10 text-center">
                <p className="text-sm font-medium text-text-strong-950">No relations to show</p>
                <p className="text-sm text-text-sub-600">
                  {data.totalNodes === 0
                    ? 'No relationships have been extracted yet. Upload a document to populate the graph.'
                    : 'Every relation is filtered out. Turn an entity type back on, or clear the relation filter.'}
                </p>
              </div>
            ) : (
              <GraphCanvas
                payload={visible}
                layout={layout}
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
                  The sentence this relation was read from:
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
