<script lang="ts">
import { gaugeLayout } from '@protoyard/charts/layout';
import { arcPath } from '@protoyard/charts/shapes';

type Props = {
  /** Accessible name, e.g. "CPU usage". */
  label: string;
  value: number;
  min?: number;
  max?: number;
  /** Inner band edges, e.g. `[60, 85]` for three bands. */
  thresholds?: readonly number[];
  /** One name per band, e.g. `['Healthy', 'Busy', 'Critical']`; read with the value. */
  bandLabels?: readonly string[];
  /** One CSS color per band (default: success, warning, destructive, then chart colors). */
  bandColors?: readonly string[];
  format?: (value: number) => string;
  /** Diameter in px. */
  size?: number;
  thickness?: number;
  class?: string;
};

let {
  label,
  value,
  min = 0,
  max = 100,
  thresholds = [],
  bandLabels = [],
  bandColors,
  format = (v: number) => String(Math.round(v)),
  size = 140,
  thickness = 12,
  class: className = '',
}: Props = $props();

const DEFAULT_BANDS = ['var(--py-success)', 'var(--py-warning)', 'var(--py-destructive)'];
const layout = $derived(gaugeLayout(value, { min, max, thresholds }));
const r = $derived(size / 2);
/** Track radius: leaves room outside it for the threshold band ring. */
const R = $derived(r - 6);
const bandLabel = $derived(bandLabels[layout.band]);
const valueText = $derived(
  bandLabel ? `${format(layout.value)}, ${bandLabel}` : format(layout.value)
);
const colorOf = (i: number) =>
  bandColors?.[i] ?? DEFAULT_BANDS[i] ?? `var(--py-chart${(i % 8) + 1})`;
</script>

<div
  role="meter"
  aria-label={label}
  aria-valuemin={min}
  aria-valuemax={max}
  aria-valuenow={layout.value}
  aria-valuetext={valueText}
  class="inline-grid justify-items-center gap-1 {className}"
>
  <svg width={size} height={size * 0.85} viewBox="{-r} {-r} {size} {size * 0.85}" aria-hidden="true">
    <path
      d={arcPath({ innerRadius: R - thickness, outerRadius: R, ...layout.track, cornerRadius: thickness / 2 })}
      fill="var(--py-muted)"
    />
    {#if layout.bands.length > 1}
      {#each layout.bands as band (band.index)}
        <path
          data-band={band.index}
          d={arcPath({ innerRadius: R + 2, outerRadius: R + 5, startAngle: band.startAngle, endAngle: band.endAngle, padAngle: 0.02 })}
          fill={colorOf(band.index)}
        />
      {/each}
    {/if}
    <path
      data-value-arc=""
      d={arcPath({ innerRadius: R - thickness, outerRadius: R, ...layout.valueArc, cornerRadius: thickness / 2 })}
      fill={layout.bands.length > 1 ? colorOf(layout.band) : 'var(--py-chart1)'}
    />
    <text y="4" text-anchor="middle" class="fill-foreground font-heading text-2xl font-semibold tabular-nums">
      {format(layout.value)}
    </text>
    {#if bandLabel}
      <text y="24" text-anchor="middle" class="fill-muted-foreground text-xs">{bandLabel}</text>
    {/if}
  </svg>
  <span class="text-xs text-muted-foreground" aria-hidden="true">{label}</span>
</div>
