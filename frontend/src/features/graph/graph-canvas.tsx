import cytoscape, { type Core, type ElementDefinition } from 'cytoscape';
import { useEffect, useRef } from 'react';

export interface GraphNode {
  data: {
    id: string;
    label: string;
    kind: 'document' | 'entity';
    type?: string;
    documentCount?: number;
  };
}

export interface GraphEdge {
  data: {
    id: string;
    source: string;
    target: string;
    kind: 'mentions' | 'relates';
    label?: string;
    evidence?: string;
    documentId?: string;
    confidence?: number;
  };
}

export interface GraphPayload {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

interface Props {
  payload: GraphPayload;
  onSelect: (node: { id: string; kind: string; label: string }) => void;
  onFocus: (id: string) => void;
  /** Clicking a typed edge surfaces the sentence it was read from. */
  onSelectEdge?: (edge: GraphEdge['data']) => void;
}

const STYLESHEET: cytoscape.StylesheetJson = [
  {
    selector: 'node[kind="document"]',
    style: {
      shape: 'round-rectangle',
      'background-color': '#2563eb',
      label: 'data(label)',
      color: '#0f172a',
      'font-size': 9,
      'text-valign': 'bottom',
      'text-margin-y': 4,
      'text-max-width': '90px',
      'text-wrap': 'ellipsis',
      width: 22,
      height: 16,
    },
  },
  {
    selector: 'node[kind="entity"]',
    style: {
      shape: 'ellipse',
      'background-color': '#f59e0b',
      label: 'data(label)',
      color: '#0f172a',
      'font-size': 9,
      'text-valign': 'bottom',
      'text-margin-y': 4,
      'text-max-width': '90px',
      'text-wrap': 'ellipsis',
      width: 14,
      height: 14,
    },
  },
  {
    // Document → entity. Kept visually quiet: it says only "mentioned here".
    selector: 'edge[kind="mentions"]',
    style: { width: 1, 'line-color': '#cbd5e1', 'curve-style': 'bezier' },
  },
  {
    // Entity → entity, extracted from a sentence. Directed and labelled,
    // because unlike a mention edge it makes a claim.
    selector: 'edge[kind="relates"]',
    style: {
      width: 2,
      'line-color': '#6366f1',
      'target-arrow-color': '#6366f1',
      'target-arrow-shape': 'triangle',
      'arrow-scale': 0.8,
      'curve-style': 'bezier',
      label: 'data(label)',
      'font-size': 7,
      color: '#4338ca',
      'text-background-color': '#ffffff',
      'text-background-opacity': 0.85,
      'text-background-padding': '2px',
      'text-rotation': 'autorotate',
    },
  },
  {
    selector: 'node:selected',
    style: { 'border-width': 3, 'border-color': '#0f172a' },
  },
];

/**
 * Raw cytoscape rather than a React wrapper: the instance owns a canvas and an
 * animation loop, so it must be destroyed on unmount. Doing that here, in one
 * effect, is less code than the wrapper plus its cleanup workaround — and the
 * failure it prevents (a leaked instance still animating after navigation) is
 * invisible until the tab has been open a while.
 */
export function GraphCanvas({ payload, onSelect, onFocus, onSelectEdge }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);

  useEffect(() => {
    if (!container.current) return;

    const elements: ElementDefinition[] = [...payload.nodes, ...payload.edges];
    const cy = cytoscape({
      container: container.current,
      elements,
      style: STYLESHEET,
      layout: { name: 'cose', animate: false, padding: 30, nodeRepulsion: () => 8000 },
      minZoom: 0.2,
      maxZoom: 3,
    });

    cy.on('tap', 'node', (event) => {
      const node = event.target;
      onSelect({ id: node.id(), kind: node.data('kind'), label: node.data('label') });
    });
    cy.on('dbltap', 'node', (event) => onFocus(event.target.id()));
    cy.on('tap', 'edge[kind="relates"]', (event) => onSelectEdge?.(event.target.data()));

    cyRef.current = cy;
    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, [payload, onSelect, onFocus, onSelectEdge]);

  return <div ref={container} className="h-[32rem] w-full" />;
}
