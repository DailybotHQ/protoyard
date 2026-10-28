<script lang="ts">
/**
 * Adapter: Protoyard FunnelChart steps (value|count) → Texuli flow FunnelChart.
 * Hides Texuli's embedded data table so host apps can own the step table (analytics-ui).
 */

import { FunnelChart as TexuliFunnelChart } from '@texuli/charts/flow';
import ChartRoot from '../compat/ChartRoot.svelte';

type Step = { id: string; label: string; value?: number; count?: number };

type Props = {
  title: string;
  description?: string;
  steps: readonly Step[];
  emptyMessage?: string;
  height?: number;
  orientation?: 'vertical' | 'horizontal';
  onselect?: (step: Step, index: number) => void;
  [key: string]: unknown;
};

let {
  title,
  description,
  steps,
  emptyMessage,
  height = 320,
  orientation = 'vertical',
}: Props = $props();

const desc = $derived(description ?? emptyMessage ?? `${title}.`);
const mapped = $derived(
  steps.map((s) => ({
    id: s.id,
    label: s.label,
    value: s.value ?? s.count ?? 0,
  }))
);
</script>

<ChartRoot {title}>
  {#if mapped.length === 0}
    <p class="empty" data-py-chart="" role="status">{emptyMessage ?? 'No data'}</p>
  {:else}
    <div class="funnel-host">
      <TexuliFunnelChart {title} description={desc} steps={mapped} {height} {orientation} />
    </div>
  {/if}
</ChartRoot>

<style>
  .empty {
    margin: 0;
    font-size: 0.875rem;
    color: var(--tx-muted-foreground, CanvasText);
  }
  /* Host owns the step table (analytics FunnelAnalysis). */
  .funnel-host :global(details.flow-table) {
    display: none !important;
  }
</style>
