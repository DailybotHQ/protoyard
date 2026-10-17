<script lang="ts">
import type { Dexie, EntityTable } from 'dexie';
import { liveQuery } from '../../src/index.ts';

type Db = Dexie & { items: EntityTable<{ id: string; n: number }, 'id'> };
let {
  db,
  min,
  mode = 'auto',
  onQuery,
}: { db: Db; min: number; mode?: 'auto' | 'deps' | 'after-await'; onQuery?: () => void } = $props();

// svelte-ignore state_referenced_locally -- each test renders one fixed mode.
const items =
  mode === 'deps'
    ? liveQuery(() => db.items.where('n').aboveOrEqual(min).toArray(), { deps: () => min })
    : // svelte-ignore state_referenced_locally
      mode === 'after-await'
      ? liveQuery(async () => {
          await Promise.resolve();
          // Read after an await: invisible to Svelte without `deps`.
          return db.items.where('n').aboveOrEqual(min).toArray();
        })
      : liveQuery(() => {
          onQuery?.();
          return db.items.where('n').aboveOrEqual(min).toArray();
        });
</script>

{#if items.loading}<p>loading</p>{:else}<p data-testid="count">{items.current?.length}</p>{/if}
