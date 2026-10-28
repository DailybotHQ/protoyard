<script lang="ts">
import type { Snippet } from 'svelte';
import { KpiRow as TexuliKpiRow } from 'texuli/stat';

let {
  label,
  children,
  min = '12rem',
  class: className = '',
}: { label: string; children: Snippet; min?: string; class?: string } = $props();
</script>

<TexuliKpiRow {label} minItemWidth={min} class={className}>
  {@render children()}
</TexuliKpiRow>
