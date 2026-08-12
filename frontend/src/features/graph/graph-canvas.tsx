import cytoscape, { type Core, type ElementDefinition } from 'cytoscape';
import fcose from 'cytoscape-fcose';
import { Maximize2, Minus, Plus } from 'lucide-react';
import { useCallback, useEffect, useRef } from 'react';

cytoscape.use(fcose);

export type GraphLayout = 'force' | 'concentric' | 'circle';

export interface GraphNode {
  data: {
    id: string;
    label: string;
    type: string;
    documentCount: number;
    degree: number;
    description?: string;
  };
}

export interface GraphEdge {
  data: {
    id: string;
    source: string;
    target: string;
    label: string;
    evidence: string;
    documentId: string;
    confidence?: number;
  };
}

export interface GraphPayload {
  nodes: GraphNode[];
  edges: GraphEdge[];
  relationTypes: string[];
  totalNodes: number;
}

interface Props {
  payload: Pick<GraphPayload, 'nodes' | 'edges'>;
  layout: GraphLayout;
  onSelect: (node: { id: string; label: string }) => void;
  onFocus: (id: string) => void;
  onSelectEdge?: (edge: GraphEdge['data']) => void;
}

/** Colour keys the entity's type; nothing else on the canvas is coloured. */
export const ENTITY_COLORS: Record<string, string> = {
  company: '#2563eb',
  person: '#0d9488',
  project: '#7c3aed',
  contract: '#c2410c',
  invoice: '#a16207',
  department: '#0284c7',
  date: '#64748b',
  amount: '#be185d',
};

const STYLESHEET: cytoscape.StylesheetJson = [
  {
    selector: 'node',
    style: {
      label: 'data(label)',
      shape: 'ellipse',
      // Size follows reach across the corpus, so the entity that ties the most
      // documents together is findable before a single label is read.
      width: 'mapData(documentCount, 0, 8, 20, 46)',
      height: 'mapData(documentCount, 0, 8, 20, 46)',
      'background-color': '#94a3b8',
      'border-width': 2.5,
      'border-color': '#ffffff',
      color: '#1e2532',
      'font-size': 10,
      'font-weight': 600,
      'text-valign': 'bottom',
      'text-margin-y': 6,
      'text-max-width': '110px',
      'text-wrap': 'ellipsis',
      'text-background-color': '#ffffff',
      'text-background-opacity': 0.88,
      'text-background-padding': '2px',
      'text-background-shape': 'roundrectangle',
    },
  },
  ...Object.entries(ENTITY_COLORS).map(([type, color]) => ({
    selector: `node[type="${type}"]`,
    style: { 'background-color': color },
  })),
  {
    selector: 'edge',
    style: {
      width: 1.6,
      'line-color': '#c7cedb',
      'target-arrow-color': '#c7cedb',
      'target-arrow-shape': 'triangle',
      'arrow-scale': 0.85,
      'curve-style': 'bezier',
      'control-point-step-size': 60,
    },
  },
  {
    // Relation labels are the densest ink on the canvas, so they wait until the
    // reader asks for one neighbourhood by hovering it.
    selector: 'edge.highlighted',
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
      width: 2.4,
    },
  },
  {
    selector: 'node:selected',
    style: { 'border-width': 3, 'border-color': '#111827', 'overlay-opacity': 0 },
  },
  { selector: '.dimmed', style: { opacity: 0.12, 'text-opacity': 0.06 } },
];

/**
 * fcose for the force option: on a graph of a few hubs joining many leaves it
 * settles with markedly fewer crossings than the built-in cose, and it keeps
 * disconnected clusters apart rather than packing them into one corner.
 */
function layoutOptions(layout: GraphLayout): cytoscape.LayoutOptions {
  const shared = { animate: false, fit: true, padding: 45 };
  if (layout === 'concentric') {
    return {
      ...shared,
      name: 'concentric',
      // Reach decides the ring, so the hubs land in the middle.
      concentric: (node: cytoscape.NodeSingular) => node.data('documentCount') ?? 0,
      levelWidth: () => 1,
      minNodeSpacing: 45,
    } as unknown as cytoscape.LayoutOptions;
  }
  if (layout === 'circle') {
    return { ...shared, name: 'circle', spacingFactor: 1.3 } as unknown as cytoscape.LayoutOptions;
  }
  return {
    ...shared,
    name: 'fcose',
    quality: 'proof',
    randomize: true,
    nodeSeparation: 140,
    idealEdgeLength: 140,
    nodeRepulsion: 10000,
    gravity: 0.2,
    gravityRange: 3.2,
    numIter: 3500,
    // Labels sit under their node, so the box the layout routes around has to
    // include the text or it lands on a neighbour.
    nodeDimensionsIncludeLabels: true,
  } as unknown as cytoscape.LayoutOptions;
}

/**
 * Raw cytoscape rather than a React wrapper: the instance owns a canvas and an
 * animation loop, so it must be destroyed on unmount. Doing that here, in one
 * effect, is less code than the wrapper plus its cleanup workaround.
 */
export function GraphCanvas({ payload, layout, onSelect, onFocus, onSelectEdge }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);

  useEffect(() => {
    if (!container.current) return;

    const elements: ElementDefinition[] = [...payload.nodes, ...payload.edges];
    const cy = cytoscape({
      container: container.current,
      elements,
      style: STYLESHEET,
      layout: layoutOptions(layout),
      minZoom: 0.2,
      maxZoom: 3,
      wheelSensitivity: 0.2,
    });

    cy.on('tap', 'node', (event) => {
      const node = event.target;
      onSelect({ id: node.id(), label: node.data('label') });
    });
    cy.on('dbltap', 'node', (event) => onFocus(event.target.id()));
    cy.on('tap', 'edge', (event) => onSelectEdge?.(event.target.data()));

    // Hover isolates a neighbourhood without moving anything, so the reader
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
  }, [payload, layout, onSelect, onFocus, onSelectEdge]);

  // Stepped rather than continuous: a button press should land somewhere
  // predictable, and zooming about the viewport centre keeps whatever the
  // reader was looking at on screen.
  const zoomBy = useCallback((factor: number) => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.zoom({
      level: cy.zoom() * factor,
      renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 },
    });
  }, []);

  return (
    <div className="relative">
      <div ref={container} className="h-[36rem] w-full rounded-lg bg-bg-white-0" />

      <div className="absolute bottom-3 right-3 flex flex-col overflow-hidden rounded-lg border border-stroke-soft-200 bg-bg-white-0 shadow-soft">
        <ZoomButton label="Zoom in" onClick={() => zoomBy(1.3)}>
          <Plus className="size-4" />
        </ZoomButton>
        <ZoomButton label="Zoom out" onClick={() => zoomBy(1 / 1.3)}>
          <Minus className="size-4" />
        </ZoomButton>
        <ZoomButton label="Fit to view" onClick={() => cyRef.current?.fit(undefined, 45)}>
          <Maximize2 className="size-4" />
        </ZoomButton>
      </div>
    </div>
  );
}

function ZoomButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="grid size-8 place-items-center text-text-sub-600 transition-default hover:bg-bg-weak-50 hover:text-text-strong-950 [&+button]:border-t [&+button]:border-stroke-soft-200"
    >
      {children}
    </button>
  );
}
