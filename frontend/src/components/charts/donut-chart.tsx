import { useState } from 'react';

export interface Slice {
  key: string;
  label: string;
  value: number;
  color: string;
}

interface Props {
  slices: Slice[];
  /** Sits in the hole: the total, and what it counts. */
  total: number;
  totalLabel: string;
}

/** Thin ring — a fat one reads as a pie and invites area comparison. */
const RADIUS = 62;
const THICKNESS = 18;
/** The 2px surface gap that separates segments without drawing a border. */
const GAP_DEGREES = 2;

/**
 * Part-to-whole at a glance, for six categories at most.
 *
 * Every slice is also listed with its own value beside the ring, which is what
 * makes this readable rather than a colour-guessing game — and what covers the
 * three palette slots that sit below 3:1 against a white surface.
 */
export function DonutChart({ slices, total, totalLabel }: Props) {
  const [hovered, setHovered] = useState<string | null>(null);
  const sum = slices.reduce((running, slice) => running + slice.value, 0);
  if (sum === 0) return null;

  let angle = -90;
  const arcs = slices.map((slice) => {
    const sweep = (slice.value / sum) * 360;
    const start = angle + GAP_DEGREES / 2;
    const end = angle + sweep - GAP_DEGREES / 2;
    angle += sweep;
    return { slice, start, end: Math.max(end, start + 0.1) };
  });

  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg viewBox="0 0 160 160" className="size-[160px] shrink-0" role="img">
        {arcs.map(({ slice, start, end }) => (
          <path
            key={slice.key}
            d={arcPath(80, 80, RADIUS, start, end)}
            fill="none"
            stroke={slice.color}
            strokeWidth={THICKNESS}
            // Only the hovered slice keeps full weight, so the eye is led
            // rather than left to find the one it wants.
            opacity={hovered === null || hovered === slice.key ? 1 : 0.35}
            className="transition-default"
            onMouseEnter={() => setHovered(slice.key)}
            onMouseLeave={() => setHovered(null)}
          >
            <title>{`${slice.label}: ${slice.value} (${percent(slice.value, sum)})`}</title>
          </path>
        ))}

        <text
          x="80"
          y="76"
          textAnchor="middle"
          className="fill-text-strong-950 text-[22px] font-semibold"
        >
          {total}
        </text>
        <text x="80" y="94" textAnchor="middle" className="fill-text-soft-400 text-[10px]">
          {totalLabel}
        </text>
      </svg>

      {/* The legend carries the numbers, so no value is reachable only by
          hovering the ring. */}
      <ul className="min-w-0 flex-1 space-y-1.5">
        {slices.map((slice) => (
          <li
            key={slice.key}
            className="flex items-center gap-2 text-sm"
            onMouseEnter={() => setHovered(slice.key)}
            onMouseLeave={() => setHovered(null)}
          >
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: slice.color }}
            />
            <span className="min-w-0 flex-1 truncate text-text-sub-600">{slice.label}</span>
            <span className="tabular-nums text-text-strong-950">{slice.value}</span>
            <span className="w-12 text-right tabular-nums text-text-soft-400">
              {percent(slice.value, sum)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function percent(value: number, sum: number): string {
  return `${((value / sum) * 100).toFixed(1)}%`;
}

/** A stroked arc, so thickness is the stroke and the hole needs no maths. */
function arcPath(cx: number, cy: number, r: number, from: number, to: number): string {
  const start = point(cx, cy, r, from);
  const end = point(cx, cy, r, to);
  const largeArc = to - from > 180 ? 1 : 0;

  // A full circle cannot be drawn as one arc — the endpoints coincide.
  if (to - from >= 359.9) {
    return `M ${cx - r} ${cy} A ${r} ${r} 0 1 1 ${cx + r} ${cy} A ${r} ${r} 0 1 1 ${cx - r} ${cy}`;
  }
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

function point(cx: number, cy: number, r: number, degrees: number) {
  const radians = (degrees * Math.PI) / 180;
  return { x: cx + r * Math.cos(radians), y: cy + r * Math.sin(radians) };
}
