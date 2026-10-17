<script lang="ts">
import type { Dexie, EntityTable } from 'dexie';
import { liveQuery } from '../../src/index.ts';

type Db = Dexie & { items: EntityTable<{ id: string; n: number }, 'id'> };
let { db, selected }: { db: Db; selected: { id: string } | undefined } = $props();
// Throws synchronously until `selected` is loaded (a common pattern with `!`).
const item = liveQuery(() => db.items.get((selected as { id: string }).id));
</script>

{#if item.error}<p data-testid="state">error</p>{:else if item.loading}<p data-testid="state">loading</p>{:else}<p data-testid="state">{item.current?.n}</p>{/if}
