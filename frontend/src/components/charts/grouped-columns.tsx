import { useRef, useState } from 'react';

export interface ColumnGroup {
  key: string;
  /** Short enough for the axis; `title` carries the full name. */
  label: string;
  title: string;
  /** One value per series, in the order the series are declared. */
  values: number[];
}

export interface ColumnSeries {
  label: string;
  color: string;
}

interface Props {
  groups: ColumnGroup[];
  series: ColumnSeries[];
  /** Formats a value for the axis and the tooltip. */
  format: (value: number) => string;
  /** Names the unit in the tooltip, e.g. "tokens". */
  unit: string;
}

/**
 * The viewBox is kept close to the width this actually renders at — roughly
 * 250px inside a third-width card. Scaled down from a much wider box, axis text
 * shrinks with it and an 8px label arrives at six.
 */
const WIDTH = 280;
const HEIGHT = 190;
const PAD = { top: 8, right: 4, bottom: 28, left: 32 };

/** Four bands is enough to read a value off without crowding the plot. */
const GRID_LINES = 4;

/** The 2px surface gap that separates paired columns without a border. */
const BAR_GAP = 2;
/** Space between one group and the next, as a share of the group's slot. */
const GROUP_PADDING = 0.32;
/** Rounded data-ends. The baseline end stays square. */
const CORNER = 3;

/**
 * Paired columns, one group per category.
 *
 * Columns rather than a stacked bar: input and output are two independent
 * magnitudes, not parts of a whole, so stacking them would invite the reader to
 * compare the wrong thing — and only the bottom segment of a stack starts from
 * a common baseline, which makes the top one unreadable.
 *
 * Both series share one y axis. Two scales would let any pair be made to look
 * equal, which is the single most misleading thing a chart of two measures can
 * do.
 */
export function GroupedColumns({ groups, series, format, unit }: Props) {
  const plot = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<{ group: number; series: number } | null>(null);

  if (groups.length === 0) {
    return <p className="text-sm text-text-sub-600">Nothing to show yet.</p>;
  }

  const peak = Math.max(...groups.flatMap((group) => group.values), 1);
  const ceiling = niceCeiling(peak);
  const innerWidth = WIDTH - PAD.left - PAD.right;
  const innerHeight = HEIGHT - PAD.top - PAD.bottom;
  const baseline = PAD.top + innerHeight;

  const slot = innerWidth / groups.length;
  const groupWidth = slot * (1 - GROUP_PADDING);
  const barWidth = (groupWidth - BAR_GAP * (series.length - 1)) / series.length;

  const xOf = (groupIndex: number, seriesIndex: number) =>
    PAD.left +
    groupIndex * slot +
    (slot - groupWidth) / 2 +
    seriesIndex * (barWidth + BAR_GAP);

  const heightOf = (value: number) => (value / ceiling) * innerHeight;

  return (
    <div ref={plot} className="relative">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full" role="img">
        {/* Recessive grid behind the data, with the value at the left. */}
        {Array.from({ length: GRID_LINES + 1 }, (_, band) => {
          const value = (ceiling / GRID_LINES) * band;
          const y = baseline - heightOf(value);
          return (
            <g key={band}>
              <line
                x1={PAD.left}
                x2={WIDTH - PAD.right}
                y1={y}
                y2={y}
                stroke="currentColor"
                className={band === 0 ? 'text-stroke-sub-300' : 'text-stroke-soft-200'}
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
              <text
                x={PAD.left - 5}
                y={y + 3}
                textAnchor="end"
                className="fill-text-soft-400 text-[10px] tabular-nums"
              >
                {format(value)}
              </text>
            </g>
          );
        })}

        {groups.map((group, groupIndex) => (
          <g key={group.key}>
            {group.values.map((value, seriesIndex) => {
              const barHeight = heightOf(value);
              const isActive =
                active?.group === groupIndex && active?.series === seriesIndex;

              return (
                <path
                  key={series[seriesIndex].label}
                  d={columnPath(
                    xOf(groupIndex, seriesIndex),
                    baseline - barHeight,
                    barWidth,
                    barHeight,
                  )}
                  fill={series[seriesIndex].color}
                  opacity={active === null || isActive ? 1 : 0.45}
                  className="transition-default"
                  onMouseEnter={() => setActive({ group: groupIndex, series: seriesIndex })}
                  onMouseLeave={() => setActive(null)}
                >
                  <title>{`${group.title} — ${series[seriesIndex].label}: ${format(value)} ${unit}`}</title>
                </path>
              );
            })}

            <text
              x={PAD.left + groupIndex * slot + slot / 2}
              y={HEIGHT - 8}
              textAnchor="middle"
              className="fill-text-soft-400 text-[11px]"
            >
              {group.label}
            </text>
          </g>
        ))}
      </svg>

      {active && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-lg border border-stroke-soft-200 bg-bg-white-0 px-2.5 py-1.5 text-xs shadow-raised"
          style={{
            left: `${((xOf(active.group, active.series) + barWidth / 2) / WIDTH) * 100}%`,
            top: `${((baseline - heightOf(groups[active.group].values[active.series])) / HEIGHT) * 100}%`,
          }}
        >
          <p className="whitespace-nowrap text-text-soft-400">
            {groups[active.group].title}
          </p>
          <p className="whitespace-nowrap font-medium text-text-strong-950">
            {series[active.series].label} · {format(groups[active.group].values[active.series])}{' '}
            {unit}
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * A column with rounded data-ends and a square foot.
 *
 * Rounding the baseline corners too would lift the column off the axis by a
 * pixel, which reads as a gap rather than as a style.
 */
function columnPath(x: number, y: number, width: number, height: number): string {
  if (height <= 0) return '';
  const r = Math.min(CORNER, width / 2, height);
  return [
    `M ${x} ${y + height}`,
    `V ${y + r}`,
    `Q ${x} ${y} ${x + r} ${y}`,
    `H ${x + width - r}`,
    `Q ${x + width} ${y} ${x + width} ${y + r}`,
    `V ${y + height}`,
    'Z',
  ].join(' ');
}

/** A ceiling that divides into whole gridlines, so no tick reads 6.25. */
function niceCeiling(peak: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(peak / GRID_LINES || 1));
  for (const step of [1, 2, 3, 4, 5, 6, 8, 10]) {
    const candidate = step * magnitude * GRID_LINES;
    if (candidate >= peak) return candidate;
  }
  return 10 * magnitude * GRID_LINES;
}
