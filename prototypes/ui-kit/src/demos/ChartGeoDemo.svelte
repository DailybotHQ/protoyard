<script lang="ts">
import { REGION_TILES, TileMap, WORLD_TILES } from '@protoyard/charts-ui/geo';

// Fictional numbers; tiles are equal-area so small regions stay readable.
const world: Record<string, number | null> = Object.fromEntries(
  WORLD_TILES.map((t, i) => [t.id, i % 5 === 4 ? null : ((i * 37) % 90) * 1000 + 4000])
);
const territory: Record<string, number> = Object.fromEntries(
  REGION_TILES.map((t, i) => [t.id, 120 + ((i * 53) % 400)])
);
let picked = $state('none');
</script>

<div class="grid gap-6 lg:grid-cols-2">
  <TileMap title="Active accounts by world region" data={world} unit="compact" onselect={(tile, value) => (picked = `${tile.label}: ${value ?? 'no data'}`)} />
  <TileMap title="Stores per district (fictional territory)" data={territory} layout={REGION_TILES} />
  <p class="text-sm text-muted-foreground lg:col-span-2" aria-live="polite">Selected tile: <strong>{picked}</strong></p>
</div>
