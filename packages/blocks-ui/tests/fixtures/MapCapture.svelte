<script lang="ts">
/** Stands in for the lazy SimulatedMap: lists the markers it receives with their tone. */
let { markers = [] }: { markers?: { id: string; label: string; tone?: string }[] } = $props();
</script>

<ul data-map-capture>
  {#each markers as marker (marker.id)}
    <li data-marker={marker.id} data-tone={marker.tone}>{marker.label}</li>
  {/each}
</ul>
