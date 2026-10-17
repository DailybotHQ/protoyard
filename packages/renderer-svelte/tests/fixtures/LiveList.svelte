<script lang="ts">
import type { Dexie, EntityTable } from 'dexie';
import { liveQuery } from '../../src/index.ts';

let {
  db,
  min,
}: { db: Dexie & { items: EntityTable<{ id: string; n: number }, 'id'> }; min: number } = $props();
const items = liveQuery(() => db.items.where('n').aboveOrEqual(min).toArray(), { deps: () => min });
</script>

{#if items.loading}<p>loading</p>{:else}<p data-testid="count">{items.current?.length}</p>{/if}
