<script lang="ts">
import { Locate, Minus, Plus } from '@lucide/svelte';
import { runService } from '@protoyard/renderer-svelte';
import { Button } from '@protoyard/ui';
import {
  type Basemap,
  basemapPaths,
  cluster,
  fitBounds,
  type Geofence,
  type MapSize,
  type MapView,
  PORT_MERIDIAN,
  panBy,
  project,
  type Ring,
  unproject,
  zoomAround,
} from '@protoyard/views/map';
import { onMount } from 'svelte';
import FenceEditor from './FenceEditor.svelte';
import {
  circleRadiusPx,
  linePath,
  type MapMarker,
  type MapRoute,
  PAN_STEP,
  ringProblem,
  routeProgress,
  TONE_FILL,
  TONE_STROKE,
} from './model.ts';

/**
 * An offline, simulated map: a fictional basemap drawn as SVG, markers as
 * focusable buttons (shape, glyph and color), clusters that zoom in when
 * activated, routes with progress, geofences (one editable by pointer or by
 * its corner list) and a list of the same markers that stays in sync.
 * Positions come from props: the prototype moves markers through its
 * services and the runtime clock, and the map only animates the change.
 */
let {
  markers = [],
  routes = [],
  fences = [],
  basemap = PORT_MERIDIAN,
  selected = $bindable(null),
  view = $bindable(),
  editableFenceId,
  label = 'Map',
  listLabel = 'Places on the map',
  cellPx = 56,
  onSelect,
  onFenceChange,
  class: className,
}: {
  markers?: MapMarker[];
  routes?: MapRoute[];
  fences?: Geofence[];
  basemap?: Basemap;
  selected?: string | null;
  /** Bindable center and zoom; default: the whole basemap. */
  view?: MapView;
  /** A polygon fence that can be edited (needs `onFenceChange`). */
  editableFenceId?: string;
  label?: string;
  listLabel?: string;
  /** Markers closer than this many pixels cluster. */
  cellPx?: number;
  onSelect?: (id: string | null) => void;
  /** Saves an edited fence through the prototype's service; a rejection keeps the draft. */
  onFenceChange?: (fence: Geofence) => unknown;
  class?: string;
} = $props();

let surface = $state<HTMLElement | null>(null);
let measured = $state<MapSize>({ width: 0, height: 0 });
/** Without layout (tests, first paint) assume a common size. */
const size = $derived<MapSize>(
  measured.width > 0 && measured.height > 0 ? measured : { width: 640, height: 400 }
);
// svelte-ignore state_referenced_locally
let current = $state<MapView>(view ?? fitBounds(basemap.bbox, { width: 640, height: 400 }));
let fitted = false;
$effect.pre(() => {
  if (view) current = view;
});
function setView(next: MapView) {
  current = next;
  view = next;
}
function reset() {
  setView(fitBounds(basemap.bbox, size));
}

onMount(() => {
  if (!surface || typeof ResizeObserver !== 'function') return;
  const observer = new ResizeObserver(([entry]) => {
    if (!entry) return;
    measured = { width: entry.contentRect.width, height: entry.contentRect.height };
    if (!fitted && !view) {
      fitted = true;
      reset();
    }
  });
  observer.observe(surface);
  return () => observer.disconnect();
});

const paths = $derived(basemapPaths(basemap, current, size));
const items = $derived(cluster(markers, current.zoom, cellPx));
const byId = $derived(new Map(markers.map((m) => [m.id, m])));

function select(id: string | null) {
  selected = id;
  onSelect?.(id);
}

function centerOn(id: string) {
  const marker = byId.get(id);
  if (marker)
    setView({ center: { lng: marker.lng, lat: marker.lat }, zoom: Math.max(current.zoom, 14) });
}

function expand(bbox: readonly [number, number, number, number]) {
  const [minLng, minLat, maxLng, maxLat] = bbox;
  // Members on one spot: zoom in two levels there instead of fitting a zero box.
  if (maxLng - minLng < 1e-9 && maxLat - minLat < 1e-9) {
    setView({ center: { lng: minLng, lat: minLat }, zoom: current.zoom + 2 });
  } else {
    const next = fitBounds(bbox, size, 48);
    setView({ center: next.center, zoom: Math.max(next.zoom, current.zoom + 1) });
  }
}

// Keyboard on the map surface: arrows pan, + / − zoom, 0 resets.
function onKeydown(event: KeyboardEvent) {
  if (event.target !== surface) return;
  const pans: Record<string, [number, number]> = {
    ArrowLeft: [PAN_STEP, 0],
    ArrowRight: [-PAN_STEP, 0],
    ArrowUp: [0, PAN_STEP],
    ArrowDown: [0, -PAN_STEP],
  };
  const pan = pans[event.key];
  if (pan) setView(panBy(current, pan[0], pan[1], size));
  else if (event.key === '+' || event.key === '=') setView(zoomAround(current, 1, size));
  else if (event.key === '-' || event.key === '_') setView(zoomAround(current, -1, size));
  else if (event.key === '0') reset();
  else if (event.key === 'Escape' && selected) select(null);
  else return;
  event.preventDefault();
}

// Pointer: drag to pan, wheel to zoom at the pointer, two fingers to pinch.
const pointers = new Map<number, { x: number; y: number }>();
let pinch: number | null = null;

function local(event: PointerEvent | WheelEvent) {
  const rect = surface?.getBoundingClientRect();
  const x = event.clientX - (rect?.left ?? 0);
  const y = event.clientY - (rect?.top ?? 0);
  // Synthetic events may lack coordinates: use the map center rather than NaN.
  return Number.isFinite(x) && Number.isFinite(y)
    ? { x, y }
    : { x: size.width / 2, y: size.height / 2 };
}

function onPointerDown(event: PointerEvent) {
  if (event.target !== event.currentTarget && !(event.target as Element).closest('svg')) return;
  if ((event.target as Element).closest('[data-vertex]')) return;
  pointers.set(event.pointerId, local(event));
  (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
}

function onPointerMove(event: PointerEvent) {
  const previous = pointers.get(event.pointerId);
  if (!previous) return;
  const now = local(event);
  pointers.set(event.pointerId, now);
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()] as [{ x: number; y: number }, { x: number; y: number }];
    const distance = Math.hypot(a.x - b.x, a.y - b.y);
    if (pinch !== null && distance > 0) {
      setView(
        zoomAround(current, Math.log2(distance / pinch), size, {
          x: (a.x + b.x) / 2,
          y: (a.y + b.y) / 2,
        })
      );
    }
    pinch = distance;
    return;
  }
  setView(panBy(current, now.x - previous.x, now.y - previous.y, size));
}

function onPointerUp(event: PointerEvent) {
  pointers.delete(event.pointerId);
  if (pointers.size < 2) pinch = null;
}

onMount(() => {
  if (!surface) return;
  const node = surface;
  const onWheel = (event: WheelEvent) => {
    event.preventDefault();
    setView(
      zoomAround(current, Math.max(-1, Math.min(1, -event.deltaY / 300)), size, local(event))
    );
  };
  node.addEventListener('wheel', onWheel, { passive: false });
  return () => node.removeEventListener('wheel', onWheel);
});

// Fence editing: a draft ring edited by corner handles or the corner list.
const editable = $derived(
  onFenceChange
    ? (fences.find((f) => f.id === editableFenceId && f.shape === 'polygon') as
        | Extract<Geofence, { shape: 'polygon' }>
        | undefined)
    : undefined
);
let draft = $state<[number, number][]>([]);
let draftOf = $state<string | null>(null);
$effect.pre(() => {
  if (editable && draftOf !== JSON.stringify(editable.ring)) {
    draft = editable.ring.map(([lng, lat]) => [lng, lat] as [number, number]);
    draftOf = JSON.stringify(editable.ring);
  }
});
const dirty = $derived(editable !== undefined && JSON.stringify(draft) !== draftOf);
let dragVertex: number | null = null;

function onVertexDown(event: PointerEvent, index: number) {
  event.stopPropagation();
  dragVertex = index;
  (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
}
function onVertexMove(event: PointerEvent) {
  if (dragVertex === null) return;
  const { x, y } = local(event);
  const point = unproject(x, y, current, size);
  const round = (n: number) => Math.round(n * 1e5) / 1e5;
  draft = draft.map((corner, i) =>
    i === dragVertex ? [round(point.lng), round(point.lat)] : corner
  );
}

async function saveFence() {
  if (!editable || !onFenceChange || ringProblem(draft as Ring)) return;
  const result = await runService(() => onFenceChange({ ...editable, ring: draft }), {
    success: `${editable.name} saved`,
  });
  if (result.ok) draftOf = JSON.stringify(draft);
}
</script>

<div class={['flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-surface', className]} data-simulated-map>
  <div class="relative">
    <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
    <div
      bind:this={surface}
      class="relative h-[min(28rem,60vh)] touch-none overflow-hidden bg-muted outline-none select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      role="region"
      tabindex="0"
      aria-label={`${label}. Arrow keys pan, plus and minus zoom, 0 shows everything.`}
      aria-roledescription="map"
      data-zoom={current.zoom.toFixed(2)}
      data-center={`${current.center.lng.toFixed(5)},${current.center.lat.toFixed(5)}`}
      onkeydown={onKeydown}
      onpointerdown={onPointerDown}
      onpointermove={(e) => {
        onVertexMove(e);
        onPointerMove(e);
      }}
      onpointerup={(e) => {
        dragVertex = null;
        onPointerUp(e);
      }}
      onpointercancel={onPointerUp}
    >
      <svg class="absolute inset-0 size-full" aria-hidden="true" viewBox={`0 0 ${size.width} ${size.height}`}>
        {#each paths as path (path.id)}
          <path
            d={path.d}
            class={{
              land: 'fill-surface stroke-border',
              water: 'fill-info/20 stroke-none',
              park: 'fill-success/20 stroke-none',
              district: 'fill-none stroke-border [stroke-dasharray:4_4]',
              road: 'fill-none stroke-muted-foreground/50 [stroke-width:2]',
              rail: 'fill-none stroke-muted-foreground [stroke-dasharray:6_4]',
            }[path.kind]}
          />
        {/each}
        {#each fences as fence (fence.id)}
          {#if fence.shape === 'polygon'}
            <path
              d={linePath(
                (fence.id === editable?.id ? draft : fence.ring).map(([lng, lat]) => ({ lng, lat })),
                current,
                size,
                true
              )}
              class="fill-warning/15 stroke-warning [stroke-width:2] [stroke-dasharray:6_3]"
              data-fence={fence.id}
            />
          {:else}
            {@const c = project({ lng: fence.center[0], lat: fence.center[1] }, current, size)}
            <circle
              cx={c.x}
              cy={c.y}
              r={circleRadiusPx(fence, current)}
              class="fill-warning/15 stroke-warning [stroke-width:2] [stroke-dasharray:6_3]"
              data-fence={fence.id}
            />
          {/if}
        {/each}
        {#each routes as route (route.id)}
          {@const progress = routeProgress(route)}
          <path d={linePath(route.stops, current, size)} class="fill-none stroke-muted-foreground [stroke-width:3] [stroke-dasharray:4_4]" data-route={route.id} />
          <path d={linePath(progress.travelled, current, size)} class={['fill-none [stroke-width:4]', TONE_STROKE[route.tone ?? 'primary']]} data-route-travelled={route.id} />
        {/each}
      </svg>

      {#if editable}
        <svg class="absolute inset-0 size-full" aria-hidden="true">
          {#each draft as corner, i (i)}
            {@const p = project({ lng: corner[0], lat: corner[1] }, current, size)}
            <!-- Pointer handle; keyboard users edit the same corner in the list below. -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <circle
              cx={p.x}
              cy={p.y}
              r="7"
              class="cursor-grab fill-background stroke-warning [stroke-width:3]"
              data-vertex={i}
              onpointerdown={(e) => onVertexDown(e, i)}
            />
          {/each}
        </svg>
      {/if}

      {#each items as item (item.kind === 'point' ? item.point.id : item.id)}
        {#if item.kind === 'cluster'}
          {@const p = project(item.center, current, size)}
          <button
            type="button"
            class="absolute grid size-10 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-background bg-foreground text-sm font-semibold text-background shadow transition-[left,top] duration-300 outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
            style={`left: ${p.x}px; top: ${p.y}px`}
            aria-label={`${item.count} places. Zoom in to see them`}
            data-cluster={item.id}
            onclick={() => expand(item.bbox)}
          >
            {item.count}
          </button>
        {:else}
          {@const m = item.point}
          {@const p = project(m, current, size)}
          <button
            type="button"
            class={[
              'absolute grid size-7 -translate-x-1/2 -translate-y-1/2 place-items-center border-2 border-background text-xs font-bold shadow transition-[left,top] duration-300 outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none',
              TONE_FILL[m.tone ?? 'primary'],
              { circle: 'rounded-full', square: 'rounded-sm', diamond: 'rotate-45 rounded-sm', triangle: '[clip-path:polygon(50%_0,100%_100%,0_100%)]' }[m.shape ?? 'circle'],
              selected === m.id && 'z-10 scale-125 ring-2 ring-ring',
            ]}
            style={`left: ${p.x}px; top: ${p.y}px`}
            aria-label={m.detail ? `${m.label}, ${m.detail}` : m.label}
            aria-pressed={selected === m.id}
            data-marker={m.id}
            onclick={() => select(selected === m.id ? null : m.id)}
          >
            <span class={m.shape === 'diamond' ? '-rotate-45' : ''} aria-hidden="true">{m.glyph ?? ''}</span>
          </button>
        {/if}
      {/each}

      {#each routes as route (route.id)}
        {@const at = routeProgress(route).at}
        {#if at && (route.progress ?? 0) > 0}
          {@const p = project(at, current, size)}
          <span
            class="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-foreground transition-[left,top] duration-300 motion-reduce:transition-none"
            style={`left: ${p.x}px; top: ${p.y}px`}
            data-route-position={route.id}
            aria-hidden="true"
          ></span>
        {/if}
      {/each}

      <p class="absolute bottom-2 left-2 rounded-md bg-background/90 px-2 py-1 text-[0.7rem] text-foreground shadow-sm" title={basemap.attribution} data-map-attribution>
        Simulated map. Fictional city, not real geography.
      </p>
    </div>
    <div class="absolute top-2 right-2 flex flex-col gap-1">
      <Button variant="outline" size="sm" class="bg-background" aria-label="Zoom in" onclick={() => setView(zoomAround(current, 1, size))}><Plus aria-hidden="true" /></Button>
      <Button variant="outline" size="sm" class="bg-background" aria-label="Zoom out" onclick={() => setView(zoomAround(current, -1, size))}><Minus aria-hidden="true" /></Button>
      <Button variant="outline" size="sm" class="bg-background" aria-label="Show everything" onclick={reset}><Locate aria-hidden="true" /></Button>
    </div>
  </div>

  {#if editable}
    <FenceEditor
      name={editable.name}
      bind:ring={draft}
      {dirty}
      onSave={saveFence}
      onReset={() => (draft = editable.ring.map(([lng, lat]) => [lng, lat] as [number, number]))}
    />
  {/if}

  <section class="border-t border-border" aria-label={listLabel} data-map-list>
    {#if markers.length === 0 && routes.length === 0}
      <p class="p-3 text-sm text-muted-foreground">Nothing on the map yet.</p>
    {:else}
      <ul class="grid max-h-56 overflow-y-auto">
        {#each markers as m (m.id)}
          <li>
            <button
              type="button"
              class={[
                'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm outline-none hover:bg-muted focus-visible:bg-muted',
                selected === m.id && 'bg-primary/10 font-medium',
              ]}
              aria-current={selected === m.id ? 'true' : undefined}
              data-list-item={m.id}
              onclick={() => {
                select(m.id);
                centerOn(m.id);
              }}
            >
              <span class={['size-2.5 shrink-0 rounded-full', TONE_FILL[m.tone ?? 'primary']]} aria-hidden="true"></span>
              <span class="min-w-0 flex-1 truncate">{m.label}</span>
              {#if m.detail}<span class="truncate text-xs text-muted-foreground">{m.detail}</span>{/if}
            </button>
          </li>
        {/each}
        {#each routes as route (route.id)}
          <li class="px-3 py-1.5 text-sm text-muted-foreground" data-route-item={route.id}>
            {route.label}: {Math.round((route.progress ?? 0) * 100)}% done
          </li>
        {/each}
      </ul>
    {/if}
  </section>
</div>
