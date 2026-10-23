<script lang="ts">
import type { MapBlock as MapBlockType } from '@protoyard/blocks';
import type { Component } from 'svelte';
import { DECK_INTERACTIVE_ATTRIBUTE } from '../lib/deck-interactive.ts';
import { mapTone } from './tones.ts';

let { block }: { block: MapBlockType } = $props();

const markers = $derived(
  block.points.map((point) => ({
    id: point.id,
    lng: point.lng,
    lat: point.lat,
    label: point.label,
    description: point.description,
    tone: mapTone(point.tone),
  }))
);

const routes = $derived(
  block.route && block.route.length >= 2
    ? [
        {
          id: `route-${block.id}`,
          label: block.title ?? block.label,
          stops: block.route
            .map((id) => block.points.find((p) => p.id === id))
            .filter((p): p is (typeof block.points)[number] => p !== undefined)
            .map((p) => ({ lng: p.lng, lat: p.lat })),
        },
      ]
    : []
);
</script>

<section
  class="grid gap-2 rounded-lg border border-border bg-card p-3"
  data-py-block="map"
  {...{ [DECK_INTERACTIVE_ATTRIBUTE]: '' }}
  data-block-id={block.id}
>
  {#if block.title}
    <h3 class="text-sm font-semibold text-foreground">{block.title}</h3>
  {/if}
  {#await import('@protoyard/views-ui/map') then mod}
    {@const Map = mod.SimulatedMap as Component<Record<string, unknown>>}
    <Map
      markers={markers}
      routes={routes}
      label={block.label}
      class="min-h-64 overflow-hidden rounded-md border border-border"
    />
  {:catch}
    <p class="text-sm text-muted-foreground" role="note">
      The simulated map could not be loaded.
    </p>
  {/await}
  <p class="text-xs text-muted-foreground" role="note">
    Offline simulated map — no tiles, no geocoding, no network.
  </p>
</section>
