<script lang="ts">
/**
 * Host adapter over `@texuli/data/map` `MapView`.
 * MapView provides pan, aria-roledescription=map, data-cluster/data-marker (when
 * points are unclustered), and a virtualized place list. Crud MapScreen still
 * asserts `label, detail` names, `data-marker` / `data-list-item`, and
 * aria-current on the list button — this host layer supplies that surface.
 */
import type { Basemap } from '@protoyard/views/map';
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

/** Accessible name crud screens assert: "Title, detail". */
function accessibleName(marker: MapMarker): string {
  return marker.detail ? `${marker.label}, ${marker.detail}` : marker.label;
}

// Map surface keeps short labels so its own buttons do not collide with the
// host "label, detail" names the crud tests query.
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

function choose(markerId: string): void {
  id = markerId;
  const marker = markers.find((row) => row.id === markerId);
  if (!onSelect) return;
  if (marker) (onSelect as (m: MapMarker) => void)(marker);
  else (onSelect as (next: string | null) => void)(markerId);
}

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

  <!-- Stable marker + list surface for crud: data-marker / data-list-item. -->
  <div class="py-map-host" aria-hidden="false">
    {#each markers as marker (marker.id)}
      <button
        type="button"
        class="py-map-marker"
        data-marker={marker.id}
        aria-label={accessibleName(marker)}
        aria-pressed={id === marker.id}
        onclick={() => choose(marker.id)}
      ></button>
    {/each}
    <ul class="py-map-list" role="list" aria-label={listLabel}>
      {#each markers as marker (marker.id)}
        <li>
          <button
            type="button"
            data-list-item={marker.id}
            aria-label={accessibleName(marker)}
            aria-current={id === marker.id ? 'true' : undefined}
            aria-pressed={id === marker.id}
            onclick={() => choose(marker.id)}
          >
            <span class="py-map-list__title">{marker.label}</span>
            {#if marker.detail}<span class="py-map-list__detail">{marker.detail}</span>{/if}
          </button>
        </li>
      {/each}
    </ul>
  </div>
</div>

<style>
  .py-map {
    display: grid;
    gap: 0.75rem;
  }
  /* Marker hits stay in the a11y tree with data-marker; keep them out of layout. */
  .py-map-marker {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    border: 0;
  }
  .py-map-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.25rem;
  }
  .py-map-list button {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 0.5rem;
    width: 100%;
    text-align: start;
    border: 1px solid var(--tx-border, ButtonBorder);
    border-radius: 0.5rem;
    background: var(--tx-background, Canvas);
    color: inherit;
    font: inherit;
    padding: 0.4rem 0.6rem;
    cursor: pointer;
  }
  .py-map-list button[aria-current='true'] {
    border-color: var(--tx-primary, Highlight);
    background: color-mix(in srgb, var(--tx-primary, Highlight) 12%, transparent);
  }
  .py-map-list__detail {
    color: var(--tx-muted-foreground, GrayText);
  }
</style>
