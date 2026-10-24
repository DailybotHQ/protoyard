<script lang="ts">
/**
 * Host adapter over `@texuli/data/map` `MapView`.
 * MapView renders the markers (`data-marker`, or `data-cluster` when points
 * cluster), the place list (`data-list-item`, `aria-current`) and their
 * "label, detail" names; this adapter maps Protoyard's marker model and
 * selection onto it.
 */
import type { Basemap } from '@protoyard/views/map';
import { MapView } from '@texuli/data/map';
import type { LngLat, MapMarker, MapRoute, MapTone } from './model.ts';

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
  listLabel = 'Places on the map',
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

function texuliTone(
  tone: MapTone | undefined
): 'default' | 'accent' | 'success' | 'warning' | 'danger' {
  switch (tone) {
    case 'success':
      return 'success';
    case 'warning':
      return 'warning';
    case 'danger':
      return 'danger';
    case 'primary':
    case 'info':
      return 'accent';
    default:
      return 'default';
  }
}

const texuliMarkers = $derived(
  markers.map((marker) => ({
    id: marker.id,
    lng: marker.lng,
    lat: marker.lat,
    label: marker.label,
    detail: marker.detail,
    tone: texuliTone(marker.tone),
  }))
);

function onMapSelect(marker: { id: string } | null | undefined): void {
  const next = marker?.id ?? null;
  id = next ?? undefined;
  if (!onSelect) return;
  if (marker) {
    const host = markers.find((row) => row.id === marker.id);
    if (host) (onSelect as (m: MapMarker) => void)(host);
    else (onSelect as (next: string | null) => void)(marker.id);
  } else {
    (onSelect as (next: string | null) => void)(null);
  }
}
</script>

<div class="py-map" data-map={label}>
  <MapView
    markers={texuliMarkers as never}
    basemap={basemap as never}
    {label}
    {direction}
    bind:selectedId={id}
    onSelect={onMapSelect}
    class={className}
  />

</div>
