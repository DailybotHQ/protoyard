<script lang="ts">
import { trendLabel } from './trend.ts';

type Props = {
  values: readonly (number | null)[];
  variant?: 'line' | 'area' | 'bar';
  /** Accessible text; defaults to a trend sentence such as "Trend: up 12% over 30 days". */
  label?: string;
  /** Period for the default label, e.g. "30 days". */
  period?: string;
  /** Formats values in the default label when the change has no percentage (from 0). */
  format?: (value: number) => string;
  /** CSS color (default: the theme's first chart color). */
  color?: string;
  /** Fixed width in px; by default the sparkline fills its container. */
  width?: number;
  height?: number;
  /** Mark the last value (default true). */
  showLast?: boolean;
  /** Mark the lowest and highest values. */
  showMinMax?: boolean;
  class?: string;
};

let {
  values,
  variant = 'line',
  label,
  period,
  format,
  color = 'var(--py-chart1)',
  width,
  height = 32,
  showLast = true,
  showMinMax = false,
  class: className = '',
}: Props = $props();

// A 100-unit-wide viewBox stretched to the box; strokes and dots keep their pixel size through
// `vector-effect`, so the sparkline needs no resize observer. Its own tiny path builder (straight
// segments, gaps break the line) keeps it off the shapes module.
const W = 100;

const g = $derived.by(() => {
  const n = values.length;
  const ok = values.filter((v): v is number => v !== null && Number.isFinite(v));
  const bar = variant === 'bar';
  const lo = Math.min(...ok, ...(bar ? [0] : []));
  const hi = Math.max(...ok, ...(bar ? [0] : []));
  const y = (v: number) => (hi === lo ? height / 2 : 3 + ((hi - v) / (hi - lo)) * (height - 6));
  const pts = values.map((v, i) => ({
    x: n < 2 ? W / 2 : bar ? ((i + 0.5) * W) / n : (i * W) / (n - 1),
    y: v === null || !Number.isFinite(v) ? null : y(v),
  }));
  let line = '';
  let area = '';
  let run: { x: number; y: number }[] = [];
  const flush = () => {
    if (!run.length) return;
    const d = run.map((p, i) => `${i ? 'L' : 'M'}${+p.x.toFixed(2)},${+p.y.toFixed(2)}`).join('');
    line += d;
    area += `${d}L${(run.at(-1) as { x: number }).x},${height}L${(run[0] as { x: number }).x},${height}Z`;
    run = [];
  };
  for (const p of pts) p.y === null ? flush() : run.push(p as { x: number; y: number });
  flush();
  const last = pts.findLastIndex((p) => p.y !== null);
  const marks = [
    ...(showMinMax && ok.length
      ? [
          ['min', values.indexOf(Math.min(...ok)), 'var(--py-muted-foreground)', 4],
          ['max', values.indexOf(Math.max(...ok)), 'var(--py-muted-foreground)', 4],
        ]
      : []),
    ...(showLast && last >= 0 ? [['last', last, color, 5]] : []),
  ] as [string, number, string, number][];
  return { pts, line, area, marks, last, base: y(0), bw: n ? (W / n) * 0.7 : 0 };
});

const reduced =
  typeof document !== 'undefined' &&
  (document.documentElement.dataset.pyMotion === 'reduce' ||
    (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches));
</script>

<svg
  role="img"
  aria-label={label ?? trendLabel(values, period, format)}
  class="block overflow-visible {reduced ? '' : 'py-spark-in'} {className}"
  width={width ?? '100%'}
  {height}
  viewBox="0 0 {W} {height}"
  preserveAspectRatio="none"
  data-motion={reduced ? 'reduce' : 'full'}
>
  {#if variant === 'bar'}
    {#each g.pts as p, i (i)}
      {#if p.y !== null}
        <rect
          x={p.x - g.bw / 2}
          y={Math.min(p.y, g.base)}
          width={g.bw}
          height={Math.max(0.5, Math.abs(g.base - p.y))}
          fill={color}
          opacity={i === g.last ? 1 : 0.55}
        />
      {/if}
    {/each}
  {:else}
    {#if variant === 'area'}<path d={g.area} fill={color} fill-opacity="0.15" />{/if}
    <path
      d={g.line}
      fill="none"
      stroke={color}
      stroke-width="1.75"
      stroke-linejoin="round"
      stroke-linecap="round"
      vector-effect="non-scaling-stroke"
    />
    {#each g.marks as [name, i, fill, size] (name)}
      <line
        data-marker={name}
        x1={g.pts[i]?.x}
        x2={g.pts[i]?.x}
        y1={g.pts[i]?.y}
        y2={g.pts[i]?.y}
        stroke={fill}
        stroke-width={size}
        stroke-linecap="round"
        vector-effect="non-scaling-stroke"
      />
    {/each}
  {/if}
</svg>

<style>
  /* A short fade-in; skipped entirely under reduced motion. */
  .py-spark-in {
    animation: py-spark-in var(--py-motion-slow, 400ms) var(--py-motion-easing, ease-out) both;
  }
  @keyframes py-spark-in {
    from {
      opacity: 0;
    }
  }
</style>
