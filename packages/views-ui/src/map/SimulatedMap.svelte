<script lang="ts">
/**
 * Host adapter over `@texuli/data/map` `MapView`.
 * Forwards routes, fences, cellPx, onPick, listPlacement, marker shape/glyph,
 * and strong tones. MapView owns pan, fluid surface sizing, clustering,
 * data-marker / data-cluster / data-list-item, and legend names.
 * `editableFenceId` / `onFenceChange` are pass-through seams (editing deferred).
 */
import type { Basemap } from '@protoyard/views/map';
import { MapView } from '@texuli/data/map';
import type { LngLat, MapMarker, MapRoute, MapTone, MarkerShape } from './model.ts';

let {
  markers = [],
  routes = [],
  fences = [],
  basemap,
  selected = $bindable<string | null>(null),
  selectedId = $bindable<string | undefined>(undefined),
  view = $bindable<unknown>(undefined),
  editableFenceId,
  label = 'Map',
  listLabel = 'Places on the map',
  listPlacement = 'below' as 'side' | 'below',
  cellPx,
  direction,
  onSelect,
  onFenceChange,
  onPick,
  class: className,
}: {
  markers?: readonly MapMarker[];
  routes?: readonly MapRoute[];
  fences?: readonly unknown[];
  basemap?: Basemap;
  selected?: string | null;
  selectedId?: string | undefined;
  /** Host camera state (MapScreen bind); Texuli owns internal view after fit. */
  view?: unknown;
  editableFenceId?: string;
  label?: string;
  listLabel?: string;
  /** Place list beside the map (`side`) or under it (`below`, Protoyard default). */
  listPlacement?: 'side' | 'below';
  /** Cluster cell size in projected px. `1` keeps nearby markers separate. */
  cellPx?: number;
  direction?: 'ltr' | 'rtl';
  onSelect?: ((marker: MapMarker) => void) | ((id: string | null) => void);
  /** Deferred fence-edit seam (Texuli accepts; vertex handles not drawn yet). */
  onFenceChange?: (fence: unknown) => unknown;
  onPick?: (point: LngLat) => void;
  class?: string;
} = $props();

let id = $state<string | undefined>(selectedId ?? selected ?? undefined);
$effect(() => {
  selectedId = id;
  selected = id ?? null;
});

/** Strong tones: primary→primary, info→info (no soft accent alias). */
function texuliTone(
  tone: MapTone | undefined
): 'primary' | 'info' | 'success' | 'warning' | 'danger' | 'neutral' {
  switch (tone) {
    case 'info':
      return 'info';
    case 'success':
      return 'success';
    case 'warning':
      return 'warning';
    case 'danger':
      return 'danger';
    case 'neutral':
      return 'neutral';
    default:
      return 'primary';
  }
}

/** Protoyard `triangle` maps to Texuli `pin`. */
function texuliShape(
  shape: MarkerShape | undefined
): 'circle' | 'square' | 'diamond' | 'pin' | undefined {
  if (!shape) return undefined;
  if (shape === 'triangle') return 'pin';
  return shape;
}

const texuliMarkers = $derived(
  markers.map((marker) => ({
    id: marker.id,
    lng: marker.lng,
    lat: marker.lat,
    label: marker.label,
    detail: marker.detail,
    tone: texuliTone(marker.tone),
    shape: texuliShape(marker.shape),
    glyph: marker.glyph,
  }))
);

const texuliRoutes = $derived(
  routes.map((route) => ({
    id: route.id,
    label: route.label,
    stops: route.stops,
    progress: route.progress,
    tone: texuliTone(route.tone),
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

function handlePick(point: LngLat): void {
  onPick?.(point);
}

function handleFenceChange(fence: unknown): void {
  onFenceChange?.(fence);
}

// Keep host view bindable stable for MapScreen; MapView owns its camera after fit.
$effect(() => {
  void view;
});

let hostRoot = $state<HTMLElement | null>(null);

// Texuli's location panel ships as "Map locations"; host screens pass listLabel
// (logistics/iot E2E assert those region names).
$effect(() => {
  const root = hostRoot;
  if (!root) return;
  const apply = () => {
    const panel = root.querySelector('.location-panel');
    if (panel) panel.setAttribute('aria-label', listLabel);
    const places = root.querySelector('[data-map-place-list]');
    if (places) places.setAttribute('aria-label', listLabel);
  };
  apply();
  const obs = new MutationObserver(apply);
  obs.observe(root, { childList: true, subtree: true });
  return () => obs.disconnect();
});
</script>

<div bind:this={hostRoot} class="py-map" data-map={label} data-list-label={listLabel} role="region" aria-label={listLabel}>
  <MapView
    markers={texuliMarkers as never}
    routes={texuliRoutes as never}
    fences={fences as never}
    basemap={basemap as never}
    {label}
    {direction}
    {cellPx}
    {listPlacement}
    bind:selectedId={id}
    onSelect={onMapSelect}
    onPick={onPick ? handlePick : undefined}
    editableFenceId={editableFenceId}
    onFenceChange={onFenceChange ? handleFenceChange : undefined}
    class={className}
  />
</div>

<style>
  /* Fill the host card so logistics/iot/harbor maps are full-size in their slot. */
  .py-map {
    display: block;
    inline-size: 100%;
    min-block-size: 24rem;
    block-size: 100%;
  }
  .py-map :global(.map-view) {
    inline-size: 100%;
    min-block-size: 24rem;
    block-size: 100%;
  }
</style>
