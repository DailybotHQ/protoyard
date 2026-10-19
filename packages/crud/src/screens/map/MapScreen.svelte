<script lang="ts">
import type { Blueprint, EntityServices } from '@protoyard/blueprint';
import type { PrototypeRuntime, Row } from '@protoyard/core';
import { liveQuery, navigate, usePrincipal } from '@protoyard/renderer-svelte';
import { Button } from '@protoyard/ui';
import { fitBounds, type MapView } from '@protoyard/views/map';
import { SimulatedMap } from '@protoyard/views-ui/map';
import { QueryState } from '@protoyard/views-ui/states';
import { formatEntityHeading } from '../../format.ts';
import {
  clusterCellSize,
  type MapScreenSpec,
  markersBbox,
  rowsToMarkers,
  styleFor,
} from './model.ts';

/**
 * A blueprint `map` screen: the entity's records with a location, on the
 * offline simulated map (no tiles, no network). Markers cluster above 200
 * records; a list under the map mirrors them, and selecting either shows the
 * record with a link to its detail.
 */
let {
  runtime,
  blueprint,
  services,
  screen,
  title,
  onOpenRecord,
}: {
  runtime: PrototypeRuntime;
  blueprint: Blueprint;
  services: EntityServices;
  screen: MapScreenSpec;
  title?: string;
  /** Default: the record's detail route, `#/<plural>/<id>`. */
  onOpenRecord?: (row: Row) => void;
} = $props();

// svelte-ignore state_referenced_locally
const entity = blueprint.entities.find((e) => e.name === screen.entity);
// svelte-ignore state_referenced_locally
if (!entity) throw new RangeError(`map screen: unknown entity "${screen.entity}"`);
// svelte-ignore state_referenced_locally
const service = services[screen.entity];
// svelte-ignore state_referenced_locally
if (!service) throw new RangeError(`map screen: no service for "${screen.entity}"`);

// svelte-ignore state_referenced_locally
const principal = usePrincipal(runtime);
let attempt = $state(0);
const rows = liveQuery(() => service.list(), {
  initial: undefined,
  deps: () => [attempt, principal.current?.persona.id],
});
const markers = $derived(rowsToMarkers(rows.current ?? [], entity, screen));
const rowsById = $derived(new Map((rows.current ?? []).map((row) => [String(row.id), row])));
const unplaced = $derived((rows.current?.length ?? 0) - markers.length);
const colorField = $derived(entity.fields.find((f) => f.name === screen.colorBy));
const label = $derived(title ?? `${formatEntityHeading(entity)} map`);

let selected = $state<string | null>(null);
let view = $state<MapView | undefined>(undefined);
// Fit the records once, when they first arrive.
$effect(() => {
  if (view || markers.length === 0) return;
  const bbox = markersBbox(markers);
  if (bbox) view = fitBounds(bbox, { width: 640, height: 400 }, 40);
});
const chosen = $derived(selected ? rowsById.get(selected) : undefined);

function open(row: Row) {
  if (onOpenRecord) onOpenRecord(row);
  else navigate(`/${entity?.plural}/${encodeURIComponent(String(row.id))}`);
}
</script>

<div class="grid gap-3" data-map-screen={entity.name}>
  <QueryState
    query={rows}
    label={`Loading ${label.toLowerCase()}`}
    isEmpty={() => false}
    onRetry={() => {
      attempt += 1;
    }}
  >
    {#snippet children()}
      <SimulatedMap
        {markers}
        {label}
        listLabel={`${formatEntityHeading(entity)} on the map`}
        cellPx={clusterCellSize(markers.length)}
        bind:selected
        bind:view
      />
    {/snippet}
  </QueryState>

  {#if chosen}
    {@const style = styleFor(colorField, screen.colorBy ? chosen[screen.colorBy] : undefined)}
    <section class="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface p-3" aria-label="Selected record" data-selected-record={String(chosen.id)}>
      <div class="min-w-0 flex-1">
        <p class="truncate font-medium">{String(chosen[entity.titleField] ?? 'Untitled')}</p>
        {#if style.label}<p class="text-sm text-muted-foreground">{style.label}</p>{/if}
      </div>
      <Button size="sm" onclick={() => open(chosen)}>Open record</Button>
      <Button size="sm" variant="outline" onclick={() => (selected = null)}>Close</Button>
    </section>
  {/if}

  {#if unplaced > 0}
    <p class="text-sm text-muted-foreground" data-unplaced>
      {unplaced} {unplaced === 1 ? 'record has' : 'records have'} no {screen.geoField} yet and {unplaced === 1 ? 'is' : 'are'} not on the map.
    </p>
  {/if}

  {#if colorField?.kind === 'enum'}
    <ul class="flex flex-wrap gap-3 text-xs text-muted-foreground" aria-label={`Markers by ${colorField.label ?? colorField.name}`}>
      {#each colorField.values as value (value)}
        {@const style = styleFor(colorField, value)}
        <li class="flex items-center gap-1.5" data-legend={value}>
          <span class="font-semibold" aria-hidden="true">{style.glyph}</span>
          <span>{style.label}</span>
          <span class="text-muted-foreground">({style.shape})</span>
        </li>
      {/each}
    </ul>
  {/if}
</div>
