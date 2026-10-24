<script lang="ts">
/**
 * Host adapter over `@texuli/data/map` `MapView`.
 * Markers + select are the shared surface; routes/fences remain a documented gap.
 */
import MapView from '../../../../node_modules/@texuli/data/src/map/MapView.svelte';
import type { MapMarker, MapRoute } from './model.ts';

let {
  markers = [],
  routes: _routes = [],
  label,
  selected = $bindable<string | null>(null),
  selectedId = $bindable<string | undefined>(undefined),
  onSelect,
  basemap: _basemap,
  class: className,
  ..._rest
}: {
  markers?: readonly MapMarker[];
  routes?: readonly MapRoute[];
  label?: string;
  selected?: string | null;
  selectedId?: string | undefined;
  onSelect?: (marker: MapMarker) => void;
  basemap?: unknown;
  class?: string;
  [key: string]: unknown;
} = $props();

let id = $state<string | undefined>(selectedId ?? selected ?? undefined);
$effect(() => {
  selectedId = id;
  selected = id ?? null;
});
</script>

<MapView
  markers={markers as never}
  {label}
  bind:selectedId={id}
  onSelect={onSelect as never}
  class={className}
/>
