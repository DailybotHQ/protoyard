<script lang="ts">
import { RefreshCw } from '@lucide/svelte';
import { formatCell } from '../format.ts';
import Btn from '../primitives/Btn.svelte';
import Confirm from '../primitives/Confirm.svelte';
import Section from '../primitives/Section.svelte';
import type { DevtoolsState } from '../state.svelte.ts';

let { dt }: { dt: DevtoolsState } = $props();
const runtime = $derived(dt.runtime);
const PAGE = 10;

let counts = $state<Record<string, number>>({});
let table = $state('');
let offset = $state(0);
let rows = $state<Record<string, unknown>[]>([]);
let loading = $state(false);
let error = $state<string | null>(null);
const tables = $derived(runtime.data.tables());
const total = $derived(table ? (counts[table] ?? 0) : 0);
const columns = $derived.by(() => {
  const keys = new Set<string>();
  for (const row of rows) for (const key of Object.keys(row)) keys.add(key);
  return [...keys].slice(0, 6);
});

async function refresh() {
  loading = true;
  error = null;
  try {
    counts = await runtime.data.counts();
    if (!table) table = tables.find((t) => !t.startsWith('py_')) ?? tables[0] ?? '';
    if (table) rows = await runtime.data.rows(table, { limit: PAGE, offset });
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  } finally {
    loading = false;
  }
}

$effect(() => {
  // Re-query when the world changes or the inspected page moves.
  dt.worldVersion;
  table;
  offset;
  void refresh();
});

const storage = $derived.by(() => {
  dt.worldVersion;
  return runtime.storage();
});
let persisted = $state<boolean | null>(null);
let usage = $state<{ usage?: number; quota?: number } | null>(null);
const supported = typeof navigator !== 'undefined' && !!navigator.storage?.persisted;

async function readStorage() {
  try {
    persisted = (await navigator.storage?.persisted?.()) ?? null;
    usage = (await navigator.storage?.estimate?.()) ?? null;
  } catch {
    persisted = null;
  }
}
$effect(() => {
  void readStorage();
});

async function askPersistence() {
  const granted = await dt.run('data:persist', () => navigator.storage.persist());
  await readStorage();
  dt.notify(
    granted ? 'success' : 'info',
    granted
      ? 'Storage is now persistent.'
      : 'The browser declined persistent storage (it decides, not the page).'
  );
}

function mb(bytes?: number) {
  return bytes === undefined ? '—' : `${(bytes / 1_048_576).toFixed(1)} MB`;
}

// Edits made in the app are picked up while the tab is open.
$effect(() => {
  const timer = setInterval(() => void refresh(), 5000);
  return () => clearInterval(timer);
});

function pick(name: string) {
  table = name;
  offset = 0;
}
</script>

<Section title="Tables">
  {#snippet actions()}
    <Btn variant="ghost" busy={loading} onclick={refresh} aria-label="Refresh counts">
      <RefreshCw class="size-3.5" aria-hidden="true" />
    </Btn>
  {/snippet}
  {#if error}<p class="mb-2 text-xs text-destructive" role="alert">{error}</p>{/if}
  <ul class="grid grid-cols-2 gap-1">
    {#each tables as name (name)}
      <li>
        <button
          type="button"
          class="flex min-h-touch w-full items-center justify-between gap-2 rounded-md border px-2 text-left text-xs focus-visible:outline-2 focus-visible:outline-ring sm:min-h-7 {table ===
          name
            ? 'border-primary/60 bg-primary/5'
            : 'border-border hover:bg-muted/60'}"
          aria-pressed={table === name}
          onclick={() => pick(name)}
        >
          <span class="truncate font-mono {name.startsWith('py_') ? 'text-muted-foreground' : ''}">{name}</span>
          <span class="font-mono tabular-nums text-muted-foreground">{counts[name] ?? '…'}</span>
        </button>
      </li>
    {/each}
  </ul>
</Section>

{#if table}
  <Section title={`Inspector · ${table}`} description="Read-only. Edit data through the app so services and permissions apply.">
    <div class="overflow-x-auto rounded-md border border-border">
      <table class="w-full text-left text-[11px]">
        <thead class="bg-muted text-muted-foreground">
          <tr>
            {#each columns as column (column)}
              <th scope="col" class="px-2 py-1 font-mono font-medium whitespace-nowrap">{column}</th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each rows as row, i (String(row.id ?? i))}
            <tr class="border-t border-border">
              {#each columns as column (column)}
                <td class="max-w-40 truncate px-2 py-1 font-mono" title={formatCell(row[column])}>{formatCell(row[column])}</td>
              {/each}
            </tr>
          {:else}
            <tr><td class="px-2 py-3 text-center text-muted-foreground" colspan={Math.max(1, columns.length)}>No rows.</td></tr>
          {/each}
        </tbody>
      </table>
    </div>
    <div class="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
      <span>{total === 0 ? 0 : offset + 1}–{Math.min(offset + PAGE, total)} of {total}</span>
      <div class="flex gap-1">
        <Btn disabled={offset === 0} onclick={() => (offset = Math.max(0, offset - PAGE))}>Previous</Btn>
        <Btn disabled={offset + PAGE >= total} onclick={() => (offset += PAGE)}>Next</Btn>
      </div>
    </div>
  </Section>
{/if}

<Section title="Storage">
  <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px]">
    <dt class="text-muted-foreground">Backend</dt>
    <dd class="font-mono">{storage.backend}{storage.persistent ? '' : ' (not saved across reloads)'}</dd>
    <dt class="text-muted-foreground">Eviction-protected</dt>
    <dd>{!supported ? 'not supported by this browser' : persisted === null ? '—' : persisted ? 'yes (persisted)' : 'no — the browser may clear it under pressure'}</dd>
    <dt class="text-muted-foreground">Origin usage</dt>
    <dd class="font-mono">{mb(usage?.usage)} of {mb(usage?.quota)}</dd>
  </dl>
  {#if storage.warning}<p class="mt-1.5 text-[11px] text-destructive">{storage.warning}</p>{/if}
  {#if supported && persisted === false && storage.backend === 'indexeddb'}
    <div class="mt-2"><Btn busy={dt.isBusy('data:persist')} onclick={askPersistence}>Request persistent storage</Btn></div>
  {/if}
</Section>

<Section title="Danger zone">
  <Confirm
    label="Reset scenario data"
    confirmLabel="Reset data"
    message="Rebuilds every table from the active scenario's seed. A safety snapshot is saved first."
    busy={dt.isBusy('data:reset')}
    onconfirm={async () => {
      await dt.run('data:reset', () => runtime.scenarios.reset({ snapshotFirst: true }), 'Data reset (safety snapshot saved).');
      dt.touchWorld();
    }}
  />
</Section>
