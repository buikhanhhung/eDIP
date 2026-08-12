/**
 * The extension a reader recognises, in the colour they expect to see it in —
 * the same red for PDF and green for a spreadsheet that every file manager
 * uses. It scans far faster down a column than the filename does.
 *
 * Hex rather than Tailwind classes because the shape is drawn: the folded
 * corner needs a lighter wash of the same hue, which a class cannot supply.
 */
const PALETTE: Record<string, string> = {
  pdf: '#ef4444',
  doc: '#3b82f6',
  docx: '#3b82f6',
  xls: '#059669',
  xlsx: '#059669',
  csv: '#059669',
  ppt: '#f97316',
  pptx: '#f97316',
  png: '#8b5cf6',
  jpg: '#8b5cf6',
  jpeg: '#8b5cf6',
  webp: '#8b5cf6',
  md: '#64748b',
  markdown: '#64748b',
  txt: '#64748b',
  json: '#f59e0b',
  xml: '#f59e0b',
  html: '#f59e0b',
  log: '#64748b',
};

/** Unknown extensions get the neutral page rather than no page. */
const FALLBACK = '#94a3b8';

const WIDTH = 28;
const HEIGHT = 34;
const RADIUS = 4;
/** How far the folded corner reaches in from the top-right. */
const FOLD = 9;

export function FileTypeChip({ filename }: { filename: string }) {
  const extension = filename.split('.').pop()?.toLowerCase() ?? '';
  const label = extension.slice(0, 4).toUpperCase() || 'FILE';
  const color = PALETTE[extension] ?? FALLBACK;

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="h-[34px] w-[28px] shrink-0"
      role="img"
      aria-label={extension ? `${extension} file` : 'file'}
    >
      <title>{extension ? `.${extension}` : 'file'}</title>
      <path d={pagePath()} fill={color} />
      {/* The fold, as a lighter wash of the page's own colour rather than a
          separate hue — it reads as paper turned over, not as a second mark. */}
      <path d={`M ${WIDTH - FOLD} 0 L ${WIDTH} ${FOLD} H ${WIDTH - FOLD} Z`} fill="#fff" fillOpacity="0.42" />
      <text
        x={WIDTH / 2}
        y={HEIGHT - 8}
        textAnchor="middle"
        className="fill-white text-[9px] font-bold"
        style={{ letterSpacing: '-0.02em' }}
      >
        {label}
      </text>
    </svg>
  );
}

/** A page with three rounded corners and a cut across the fourth. */
function pagePath(): string {
  return [
    `M ${RADIUS} 0`,
    `H ${WIDTH - FOLD}`,
    `L ${WIDTH} ${FOLD}`,
    `V ${HEIGHT - RADIUS}`,
    `Q ${WIDTH} ${HEIGHT} ${WIDTH - RADIUS} ${HEIGHT}`,
    `H ${RADIUS}`,
    `Q 0 ${HEIGHT} 0 ${HEIGHT - RADIUS}`,
    `V ${RADIUS}`,
    `Q 0 0 ${RADIUS} 0`,
    'Z',
  ].join(' ');
}
