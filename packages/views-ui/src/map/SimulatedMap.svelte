<script lang="ts">
/**
 * Host adapter over `@texuli/data/map` `MapView`.
 * MapView already provides: aria-roledescription=map, pan/zoom, data-cluster /
 * data-marker markers, and a virtualized place list.
 */
import type { Basemap } from '@protoyard/views/map';
import MapView from '../../../../node_modules/@texuli/data/src/map/MapView.svelte';
import type { LngLat, MapMarker, MapRoute } from './model.ts';

let {
  markers = [],
  routes: _routes = [],
  fences: _fences = [],
  basemap,
  selected = $bindable<string | null>(null),
  selectedId = $bindable<string | undefined>(undefined),
  view: _view = $bindable(undefined),
  editableFenceId: _editableFenceId,
  label = 'Map',
  listLabel: _listLabel = 'Places on the map',
  cellPx: _cellPx,
  direction,
  onSelect,
  onFenceChange: _onFenceChange,
  onPick: _onPick,
  class: className,
}: {
  markers?: readonly MapMarker[];
  routes?: readonly MapRoute[];
  fences?: readonly unknown[];
  basemap?: Basemap;
  selected?: string | null;
  selectedId?: string | undefined;
  view?: unknown;
  editableFenceId?: string;
  label?: string;
  /** Host label for the place list; Texuli MapView uses a fixed "Map locations". */
  listLabel?: string;
  cellPx?: number;
  direction?: 'ltr' | 'rtl';
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

<!--
  Host-only stubs kept in props for API stability (listLabel, cellPx, onPick,
  routes, fences). Texuli MapView owns pan, cluster/marker attrs, and the list.
-->
<MapView
  markers={markers as never}
  basemap={basemap as never}
  {label}
  {direction}
  bind:selectedId={id}
  onSelect={(m) => {
    const next = m?.id ?? null;
    id = next ?? undefined;
    if (onSelect) (onSelect as (arg: unknown) => void)(m ?? next);
  }}
  class={className}
/>
