<script lang="ts">
import { arcPath } from '@protoyard/charts/shapes';

type Props = {
  /** Accessible name, e.g. "Onboarding complete". */
  label: string;
  /** Progress between 0 and `max`. */
  value: number;
  max?: number;
  size?: number;
  thickness?: number;
  color?: string;
  class?: string;
};

let {
  label,
  value,
  max = 1,
  size = 64,
  thickness = 7,
  color = 'var(--py-chart1)',
  class: className = '',
}: Props = $props();

const ratio = $derived(
  max > 0 && Number.isFinite(value) ? Math.min(1, Math.max(0, value / max)) : 0
);
const percent = $derived(Math.round(ratio * 100));
const r = $derived(size / 2);
</script>

<div
  role="progressbar"
  aria-label={label}
  aria-valuemin={0}
  aria-valuemax={100}
  aria-valuenow={percent}
  aria-valuetext="{percent}%"
  class="relative inline-grid place-items-center {className}"
  style:width="{size}px"
  style:height="{size}px"
>
  <svg width={size} height={size} viewBox="{-r} {-r} {size} {size}" aria-hidden="true" class="absolute inset-0">
    <path d={arcPath({ innerRadius: r - thickness, outerRadius: r, startAngle: 0, endAngle: Math.PI * 2 })} fill="var(--py-muted)" />
    {#if ratio > 0}
      <path
        data-progress-arc=""
        d={arcPath({
          innerRadius: r - thickness,
          outerRadius: r,
          startAngle: 0,
          endAngle: Math.PI * 2 * ratio,
          cornerRadius: ratio < 1 ? thickness / 2 : 0,
        })}
        fill={color}
      />
    {/if}
  </svg>
  <span class="relative text-xs font-semibold tabular-nums text-foreground" aria-hidden="true">{percent}%</span>
</div>
