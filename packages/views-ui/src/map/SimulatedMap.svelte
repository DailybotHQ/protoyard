<script lang="ts">
/**
 * Host adapter over `@texuli/data/map` `MapView`.
 * Markers + select are the shared surface. Host props for routes, fences,
 * basemap, listLabel, and pick mode are accepted for prototype compatibility.
 */
import MapView from '../../../../node_modules/@texuli/data/src/map/MapView.svelte';
import type { LngLat, MapMarker, MapRoute } from './model.ts';

let {
  markers = [],
  routes: _routes = [],
  fences: _fences = [],
  basemap: _basemap,
  selected = $bindable<string | null>(null),
  selectedId = $bindable<string | undefined>(undefined),
  view: _view = $bindable(undefined),
  editableFenceId: _editableFenceId,
  label = 'Map',
  listLabel: _listLabel = 'Places on the map',
  cellPx: _cellPx,
  onSelect,
  onFenceChange: _onFenceChange,
  onPick: _onPick,
  class: className,
}: {
  markers?: readonly MapMarker[];
  routes?: readonly MapRoute[];
  fences?: readonly unknown[];
  basemap?: unknown;
  selected?: string | null;
  selectedId?: string | undefined;
  view?: unknown;
  editableFenceId?: string;
  label?: string;
  listLabel?: string;
  cellPx?: number;
  /** Host used either a marker or an id callback. */
  onSelect?: ((marker: MapMarker) => void) | ((id: string | null) => void);
  onFenceChange?: (fence: unknown) => unknown;
  onPick?: (point: LngLat) => void;
  class?: string;
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
  onSelect={(m) => {
    const next = m?.id ?? null;
    id = next ?? undefined;
    if (onSelect) (onSelect as (arg: unknown) => void)(m ?? next);
  }}
  class={className}
/>
