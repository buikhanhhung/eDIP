import cytoscape, { type Core, type ElementDefinition } from 'cytoscape';
import fcose from 'cytoscape-fcose';
import { useEffect, useRef } from 'react';

cytoscape.use(fcose);

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
  'text-valign': 'bottom' as const,
  'text-margin-y': 6,
  'text-wrap': 'ellipsis' as const,
  'text-background-color': '#ffffff',
  'text-background-opacity': 0.88,
  'text-background-padding': '2px',
  'text-background-shape': 'roundrectangle' as const,
};

const STYLESHEET: cytoscape.StylesheetJson = [
  {
    // Documents are context, not subject: they read as pale cards with a quiet
    // label so the eye lands on the entities that connect them.
    selector: 'node[kind="document"]',
    style: {
      ...LABEL_BASE,
      shape: 'round-rectangle',
      'background-color': '#eff6ff',
      'border-width': 1.5,
      'border-color': '#93b4fc',
      color: '#64748b',
      'font-size': 8,
      'font-weight': 400,
      'text-max-width': '70px',
      width: 30,
      height: 22,
    },
  },
  {
    selector: 'node[kind="entity"]',
    style: {
      ...LABEL_BASE,
      shape: 'ellipse',
      // Size follows reach: an entity tying six documents together should be
      // findable without reading a single label.
      width: 'mapData(documentCount, 1, 9, 18, 40)',
      height: 'mapData(documentCount, 1, 9, 18, 40)',
      'background-color': '#94a3b8',
      'border-width': 2.5,
      'border-color': '#ffffff',
      color: '#1e2532',
      'font-size': 10,
      'font-weight': 600,
      'text-max-width': '96px',
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
      'line-color': '#dfe4ec',
      'curve-style': 'bezier',
      opacity: 0.85,
    },
  },
  {
    // Entity → entity, extracted from a sentence. Directed and labelled,
    // because unlike a mention edge it makes a claim.
    selector: 'edge[kind="relates"]',
    style: {
      width: 1.6,
      'line-color': '#a78bfa',
      'target-arrow-color': '#a78bfa',
      'target-arrow-shape': 'triangle',
      'arrow-scale': 0.85,
      'curve-style': 'bezier',
      'control-point-step-size': 60,
    },
  },
  {
    // Relation labels are the densest ink on the canvas and mostly repeat what
    // the arrow already implies, so they wait until the reader asks for one
    // neighbourhood by hovering it.
    selector: 'edge[kind="relates"].highlighted',
    style: {
      label: 'data(label)',
      'font-size': 8,
      'font-weight': 600,
      color: '#5b21b6',
      'text-background-color': '#ffffff',
      'text-background-opacity': 0.94,
      'text-background-padding': '3px',
      'text-background-shape': 'roundrectangle',
      'text-rotation': 'autorotate',
      'line-color': '#7c3aed',
      'target-arrow-color': '#7c3aed',
      width: 2.2,
    },
  },
  {
    selector: 'node:selected',
    style: { 'border-width': 3, 'border-color': '#111827', 'overlay-opacity': 0 },
  },
  {
    // Hovering fades everything unrelated, which is the only way a reader
    // follows one thread through a graph this dense.
    selector: '.dimmed',
    style: { opacity: 0.12, 'text-opacity': 0.06 },
  },
];

/**
 * fcose rather than the built-in cose: on a graph shaped like this one — a few
 * high-degree entities joining many documents — it settles with markedly fewer
 * edge crossings, and it keeps disconnected clusters apart instead of packing
 * them into the same corner.
 */
const LAYOUT = {
  name: 'fcose',
  animate: false,
  quality: 'proof',
  randomize: true,
  padding: 45,
  nodeSeparation: 130,
  idealEdgeLength: 130,
  nodeRepulsion: 9000,
  gravity: 0.2,
  gravityRange: 3.2,
  numIter: 3500,
  // Labels sit under their node, so the box the layout avoids has to be taller
  // than the node itself or the text lands on a neighbour.
  nodeDimensionsIncludeLabels: true,
} as unknown as cytoscape.LayoutOptions;

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
      layout: LAYOUT,
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
      keep.addClass('highlighted');
    });
    cy.on('mouseout', 'node', () => cy.elements().removeClass('dimmed highlighted'));

    cyRef.current = cy;
    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, [payload, onSelect, onFocus, onSelectEdge]);

  return (
    <div ref={container} className="h-[36rem] w-full rounded-lg bg-bg-white-0" />
  );
}
