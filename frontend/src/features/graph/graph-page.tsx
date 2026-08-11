import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { apiClient } from '@/lib/api-client';
import { GraphCanvas, type GraphPayload } from './graph-canvas';
import { NodeDrawer } from './node-drawer';

const ENTITY_TYPES = ['company', 'person', 'project', 'contract', 'invoice', 'department'] as const;

const TYPE_LABELS: Record<string, string> = {
  company: 'Công ty',
  person: 'Cá nhân',
  project: 'Dự án',
  contract: 'Hợp đồng',
  invoice: 'Hoá đơn',
  department: 'Phòng ban',
};

export function GraphPage() {
  // 2 by default in the UI, while the API defaults to 1 — a graph where every
  // one-off name is a node is unreadable on a projector.
  const [minShared, setMinShared] = useState(2);
  const [types, setTypes] = useState<string[]>([...ENTITY_TYPES]);
  const [selected, setSelected] = useState<{ id: string; kind: string; label: string } | null>(null);
  const [focused, setFocused] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['graph', minShared],
    queryFn: async () =>
      (await apiClient.get<GraphPayload>('/graph', { params: { minShared } })).data,
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
          <h1 className="text-2xl font-semibold tracking-tight">Đồ thị tri thức</h1>
          <p className="text-sm text-muted-foreground">
            {visible.nodes.length} nút · {visible.edges.length} liên kết
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            Chia sẻ tối thiểu
            <input
              type="range"
              min={1}
              max={4}
              value={minShared}
              onChange={(e) => setMinShared(Number(e.target.value))}
            />
            <span className="w-4 tabular-nums">{minShared}</span>
          </label>
          {focused && (
            <Button variant="outline" size="sm" onClick={() => setFocused(null)}>
              Bỏ lọc lân cận
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {ENTITY_TYPES.map((type) => {
          const on = types.includes(type);
          return (
            <button
              key={type}
              type="button"
              onClick={() =>
                setTypes((current) =>
                  current.includes(type)
                    ? current.filter((value) => value !== type)
                    : [...current, type],
                )
              }
            >
              <Badge variant={on ? 'default' : 'outline'}>{TYPE_LABELS[type]}</Badge>
            </button>
          );
        })}
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Đang dựng đồ thị…</p>}
      {isError && <p className="text-sm text-destructive">Không tải được đồ thị.</p>}

      {data && (
        <Card>
          <CardContent className="p-0">
            {visible.nodes.length === 0 ? (
              <p className="p-10 text-center text-sm text-muted-foreground">
                Không có nút nào khớp bộ lọc. Hạ "chia sẻ tối thiểu" xuống 1 để xem toàn bộ.
              </p>
            ) : (
              <GraphCanvas
                payload={visible}
                onSelect={(node) => setSelected(node)}
                onFocus={(id) => setFocused(id)}
              />
            )}
          </CardContent>
        </Card>
      )}

      <NodeDrawer node={selected} onClose={() => setSelected(null)} onFocus={setFocused} />
    </div>
  );
}
