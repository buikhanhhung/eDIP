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

/**
 * Colour carries meaning, not decoration: documents share the interface accent,
 * entities are keyed by their own type, and everything else — edges, labels,
 * the canvas — stays quiet so the two node families read at a glance.
 */
export const ENTITY_COLORS: Record<string, string> = {
  company: '#2563eb',
  person: '#0d9488',
  project: '#7c3aed',
  contract: '#c2410c',
  invoice: '#a16207',
  department: '#0284c7',
};

const LABEL_BASE = {
  label: 'data(label)',
  color: '#3d4657',
  'font-size': 10,
  'font-weight': 500,
  'text-valign': 'bottom' as const,
  'text-margin-y': 7,
  'text-max-width': '92px',
  'text-wrap': 'ellipsis' as const,
  'text-background-color': '#ffffff',
  'text-background-opacity': 0.9,
  'text-background-padding': '2px',
  'text-background-shape': 'roundrectangle' as const,
};

const STYLESHEET: cytoscape.StylesheetJson = [
  {
    // Documents read as pages: a tall rounded card, filled softly with a firm
    // border, so they never compete with the entity dots for attention.
    selector: 'node[kind="document"]',
    style: {
      ...LABEL_BASE,
      shape: 'round-rectangle',
      'background-color': '#eff6ff',
      'border-width': 1.5,
      'border-color': '#2563eb',
      color: '#1e3a8a',
      'font-weight': 600,
      width: 34,
      height: 26,
    },
  },
  {
    selector: 'node[kind="entity"]',
    style: {
      ...LABEL_BASE,
      shape: 'ellipse',
      // Size follows reach: an entity tying six documents together should be
      // findable without reading a single label.
      width: 'mapData(documentCount, 1, 9, 16, 34)',
      height: 'mapData(documentCount, 1, 9, 16, 34)',
      'background-color': '#94a3b8',
      'border-width': 2,
      'border-color': '#ffffff',
    },
  },
  ...Object.entries(ENTITY_COLORS).map(([type, color]) => ({
    selector: `node[kind="entity"][type="${type}"]`,
    style: { 'background-color': color },
  })),
  {
    // Document → entity. Kept visually quiet: it says only "mentioned here".
    selector: 'edge[kind="mentions"]',
    style: {
      width: 1,
      'line-color': '#dbe1ea',
      'curve-style': 'bezier',
      opacity: 0.9,
    },
  },
  {
    // Entity → entity, extracted from a sentence. Directed and labelled,
    // because unlike a mention edge it makes a claim.
    selector: 'edge[kind="relates"]',
    style: {
      width: 1.8,
      'line-color': '#7c3aed',
      'target-arrow-color': '#7c3aed',
      'target-arrow-shape': 'triangle',
      'arrow-scale': 0.9,
      'curve-style': 'bezier',
      'control-point-step-size': 50,
      label: 'data(label)',
      'font-size': 8,
      'font-weight': 600,
      color: '#5b21b6',
      'text-background-color': '#ffffff',
      'text-background-opacity': 0.94,
      'text-background-padding': '3px',
      'text-background-shape': 'roundrectangle',
      'text-rotation': 'autorotate',
    },
  },
  {
    selector: 'node:selected',
    style: { 'border-width': 3, 'border-color': '#111827', 'overlay-opacity': 0 },
  },
  {
    // Hovering fades everything unrelated, which is the only way a reader
    // follows one thread through a hairball this dense.
    selector: '.dimmed',
    style: { opacity: 0.15, 'text-opacity': 0.1 },
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
      layout: {
        name: 'cose',
        animate: false,
        padding: 40,
        // Spread further than the default: labels sit under the nodes, and at
        // tighter spacing they overlap into an unreadable mat.
        nodeRepulsion: () => 45000,
        idealEdgeLength: () => 150,
        nodeOverlap: 40,
        gravity: 0.35,
        componentSpacing: 120,
        numIter: 1500,
      } as cytoscape.LayoutOptions,
      minZoom: 0.2,
      maxZoom: 3,
      wheelSensitivity: 0.2,
    });

    cy.on('tap', 'node', (event) => {
      const node = event.target;
      onSelect({ id: node.id(), kind: node.data('kind'), label: node.data('label') });
    });
    cy.on('dbltap', 'node', (event) => onFocus(event.target.id()));
    cy.on('tap', 'edge[kind="relates"]', (event) => onSelectEdge?.(event.target.data()));

    // Hover isolates a neighbourhood without changing the layout, so the reader
    // keeps their mental map of where things are.
    cy.on('mouseover', 'node', (event) => {
      const keep = event.target.closedNeighborhood();
      cy.elements().difference(keep).addClass('dimmed');
    });
    cy.on('mouseout', 'node', () => cy.elements().removeClass('dimmed'));

    cyRef.current = cy;
    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, [payload, onSelect, onFocus, onSelectEdge]);

  return <div ref={container} className="h-[34rem] w-full rounded-lg bg-bg-white-0" />;
}
