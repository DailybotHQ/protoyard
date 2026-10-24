<script lang="ts">
/**
 * Host adapter over `@texuli/data/map` `MapView`.
 * MapView owns pan, aria-roledescription=map, data-cluster / data-marker,
 * virtualized place list with data-list-item, "label, detail" names, and
 * aria-current. Fits the basemap bbox to markers so nearby points stay
 * unclustered at first paint (crud MapScreen expects data-marker per record).
 */
import type { Basemap } from '@protoyard/views/map';
// Default basemap when the host does not pass one (same as Texuli MapView).
import { PORT_MERIDIAN } from '../../../../node_modules/@texuli/data/src/engines/map/port-meridian.ts';
import MapView from '../../../../node_modules/@texuli/data/src/map/MapView.svelte';
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

/**
 * Zoom the initial view around markers that already sit in the basemap box.
 * Fitting every marker (including generator seeds on the far side of the globe)
 * collapses the zoom and clusters nearby harbor points.
 */
const fittedBasemap = $derived.by((): Basemap => {
  const base = (basemap ?? PORT_MERIDIAN) as Basemap;
  if (markers.length === 0) return base;
  const [west, south, east, north] = base.bbox;
  const local = markers.filter(
    (marker) =>
      marker.lng >= west && marker.lng <= east && marker.lat >= south && marker.lat <= north
  );
  const focus = local.length > 0 ? local : markers;
  let minLng = 180;
  let minLat = 90;
  let maxLng = -180;
  let maxLat = -90;
  for (const marker of focus) {
    minLng = Math.min(minLng, marker.lng);
    minLat = Math.min(minLat, marker.lat);
    maxLng = Math.max(maxLng, marker.lng);
    maxLat = Math.max(maxLat, marker.lat);
  }
  const pad = Math.max(0.05, (maxLng - minLng) * 0.4, (maxLat - minLat) * 0.4);
  return {
    ...base,
    bbox: [minLng - pad, minLat - pad, maxLng + pad, maxLat + pad],
  };
});

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

<!-- Remount when the fitted bbox changes so MapView re-seeds its view zoom. -->
{#key fittedBasemap.bbox.join(',')}
  <MapView
    markers={texuliMarkers as never}
    basemap={fittedBasemap as never}
    {label}
    {direction}
    bind:selectedId={id}
    onSelect={onMapSelect}
    class={className}
  />
{/key}
