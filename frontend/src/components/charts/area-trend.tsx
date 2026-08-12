import { useId, useRef, useState } from 'react';

export interface TrendPoint {
  /** `YYYY-MM-DD`. */
  date: string;
  value: number;
}

interface Props {
  points: TrendPoint[];
  /** Whether each point is a day or a month, which decides the label format. */
  bucket: 'day' | 'month';
  /** Names the series in the tooltip; the card title names it on the page. */
  unit: string;
}

/** The drawing grid. Width is nominal — the SVG scales, the strokes do not. */
const WIDTH = 720;
const HEIGHT = 190;
/** Right padding holds the last x label, which is centred on the last point. */
const PAD = { top: 12, right: 26, bottom: 24, left: 34 };

/** Horizontal guides. Four bands is enough to read a value off. */
const GRID_LINES = 4;

/** At most this many x labels, whatever the bucket count. */
const MAX_X_LABELS = 6;

/**
 * One measure over time, as a line above a faded fill.
 *
 * A line rather than bars because the x axis is continuous and every bucket is
 * present, zeros included: the slope between two points is meaningful, which is
 * the thing bars cannot show. The fill is decoration for the line, not a second
 * encoding — nothing is stacked on it.
 *
 * The hover layer is not optional. An SVG chart that cannot be interrogated
 * forces the reader to estimate values off an axis.
 */
export function AreaTrend({ points, bucket, unit }: Props) {
  const gradientId = useId();
  const plot = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<number | null>(null);

  if (points.length === 0) {
    return <p className="text-sm text-text-sub-600">No activity in this window.</p>;
  }

  const max = Math.max(...points.map((point) => point.value), 1);
  const ceiling = niceCeiling(max);
  const innerWidth = WIDTH - PAD.left - PAD.right;
  const innerHeight = HEIGHT - PAD.top - PAD.bottom;

  const x = (index: number) =>
    PAD.left + (points.length === 1 ? innerWidth / 2 : (index / (points.length - 1)) * innerWidth);
  const y = (value: number) => PAD.top + innerHeight - (value / ceiling) * innerHeight;

  const line = points.map((point, index) => `${x(index)},${y(point.value)}`).join(' ');
  const area = `${PAD.left},${PAD.top + innerHeight} ${line} ${x(points.length - 1)},${PAD.top + innerHeight}`;

  const labelEvery = Math.max(1, Math.ceil(points.length / MAX_X_LABELS));

  // Pointer x maps to the nearest bucket, so the whole plot is a hit target
  // rather than each 2px point being one.
  const track = (event: React.PointerEvent<HTMLDivElement>) => {
    const box = plot.current?.getBoundingClientRect();
    if (!box) return;
    const ratio = (event.clientX - box.left) / box.width;
    const svgX = ratio * WIDTH;
    const step = points.length === 1 ? innerWidth : innerWidth / (points.length - 1);
    const index = Math.round((svgX - PAD.left) / step);
    setActive(Math.min(Math.max(index, 0), points.length - 1));
  };

  return (
    <div
      ref={plot}
      className="relative"
      onPointerMove={track}
      onPointerLeave={() => setActive(null)}
    >
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full" role="img">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Recessive grid: hairlines behind the data, with the value at the left. */}
        {Array.from({ length: GRID_LINES + 1 }, (_, band) => {
          const value = (ceiling / GRID_LINES) * band;
          return (
            <g key={band}>
              <line
                x1={PAD.left}
                x2={WIDTH - PAD.right}
                y1={y(value)}
                y2={y(value)}
                stroke="currentColor"
                className="text-stroke-soft-200"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
              <text
                x={PAD.left - 8}
                y={y(value) + 3}
                textAnchor="end"
                className="fill-text-soft-400 text-[9px] tabular-nums"
              >
                {value}
              </text>
            </g>
          );
        })}

        <polygon points={area} fill={`url(#${gradientId})`} />
        <polyline
          points={line}
          fill="none"
          stroke="#3b82f6"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />

        {points.map((point, index) =>
          index % labelEvery === 0 || index === points.length - 1 ? (
            <text
              key={point.date}
              x={x(index)}
              y={HEIGHT - 6}
              textAnchor="middle"
              className="fill-text-soft-400 text-[9px]"
            >
              {shortLabel(point.date, bucket)}
            </text>
          ) : null,
        )}

        {active !== null && (
          <g>
            <line
              x1={x(active)}
              x2={x(active)}
              y1={PAD.top}
              y2={PAD.top + innerHeight}
              stroke="currentColor"
              className="text-stroke-sub-300"
              strokeWidth="1"
              strokeDasharray="3 3"
              vectorEffect="non-scaling-stroke"
            />
            {/* A 2px surface ring keeps the marker legible over the fill. */}
            <circle cx={x(active)} cy={y(points[active].value)} r="5" fill="#fff" />
            <circle cx={x(active)} cy={y(points[active].value)} r="3.5" fill="#3b82f6" />
          </g>
        )}
      </svg>

      {active !== null && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-lg border border-stroke-soft-200 bg-bg-white-0 px-2.5 py-1.5 text-xs shadow-raised"
          style={{
            left: `${(x(active) / WIDTH) * 100}%`,
            top: `${(y(points[active].value) / HEIGHT) * 100}%`,
          }}
        >
          <p className="whitespace-nowrap text-text-soft-400">
            {fullLabel(points[active].date, bucket)}
          </p>
          <p className="whitespace-nowrap font-medium text-text-strong-950">
            {points[active].value} {unit}
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * A ceiling that divides into whole-number gridlines.
 *
 * The steps are chosen so `ceiling / GRID_LINES` is itself a round number:
 * these are counts of documents, and an axis labelled 6.25 asks the reader to
 * believe in a quarter of a file.
 */
function niceCeiling(max: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(max / GRID_LINES || 1));
  for (const step of [1, 2, 3, 4, 5, 6, 8, 10]) {
    const candidate = step * magnitude * GRID_LINES;
    if (candidate >= max) return candidate;
  }
  return 10 * magnitude * GRID_LINES;
}

function shortLabel(date: string, bucket: 'day' | 'month'): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  return parsed.toLocaleDateString('en-GB', {
    ...(bucket === 'month' ? { month: 'short', year: '2-digit' } : { day: 'numeric', month: 'short' }),
    timeZone: 'UTC',
  });
}

function fullLabel(date: string, bucket: 'day' | 'month'): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  return parsed.toLocaleDateString('en-GB', {
    ...(bucket === 'month'
      ? { month: 'long', year: 'numeric' }
      : { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }),
    timeZone: 'UTC',
  });
}
