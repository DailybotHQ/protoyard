<script lang="ts">
/**
 * Host adapter over `@texuli/data/map` `MapView`.
 * Forwards basemap, markers, selection, pan (built into Texuli), and host
 * hooks (listLabel, cellPx, onPick, fences/routes) for FIX-map-view-parity.
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

/** Extra hooks for a richer MapView (listLabel, cellPx, onPick) when Texuli adds them. */
const mapExtras = $derived.by(() => {
  const extra: Record<string, unknown> = {};
  if (_listLabel) extra.listLabel = _listLabel;
  if (_cellPx !== undefined) extra.cellPx = _cellPx;
  if (_onPick) extra.onPick = _onPick;
  if (_routes.length) extra.routes = _routes;
  if (_fences.length) extra.fences = _fences;
  if (_onFenceChange) extra.onFenceChange = _onFenceChange;
  if (_editableFenceId) extra.editableFenceId = _editableFenceId;
  return extra;
});
</script>

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
  {...(mapExtras as object)}
/>
