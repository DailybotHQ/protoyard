<script lang="ts">
/** Adapter: Protoyard TileMap → Texuli GeoMap. */
import { GeoMap, REGION_TILES, WORLD_TILES } from '@texuli/charts/geo';
import ChartRoot from '../compat/ChartRoot.svelte';

type Props = {
  title: string;
  description?: string;
  data?: Readonly<Record<string, number | null>>;
  values?: Readonly<Record<string, number | null>>;
  shape?: 'world' | 'region' | readonly unknown[];
  emptyMessage?: string;
  [key: string]: unknown;
};

let { title, description, data, values, shape = 'world', emptyMessage }: Props = $props();

const desc = $derived(description ?? emptyMessage ?? title);
const mapData = $derived(data ?? values ?? {});
const tiles = $derived(
  shape === 'region' ? REGION_TILES : shape === 'world' ? WORLD_TILES : (shape as never)
);
</script>

<ChartRoot title={title}>
{#if Object.keys(mapData).length === 0}
  <p class="empty" data-py-chart="" role="status">{emptyMessage ?? 'No data'}</p>
{:else}
  <GeoMap {title} description={desc} data={mapData} shape={tiles} />
{/if}
</ChartRoot>

<style>
  .empty {
    margin: 0;
    font-size: 0.875rem;
    color: var(--py-muted-foreground, CanvasText);
  }
</style>

