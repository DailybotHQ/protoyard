<script lang="ts">
import { Download, Trash2, Upload } from '@lucide/svelte';
import type { SnapshotImportPreview, SnapshotSummary } from '@protoyard/core';
import { downloadText, formatDateTime } from '../format.ts';
import Btn from '../primitives/Btn.svelte';
import Confirm from '../primitives/Confirm.svelte';
import Section from '../primitives/Section.svelte';
import type { DevtoolsState } from '../state.svelte.ts';

let { dt }: { dt: DevtoolsState } = $props();
const runtime = $derived(dt.runtime);

let snapshots = $state<SnapshotSummary[]>([]);
let listError = $state<string | null>(null);
let name = $state('');
let notes = $state('');
let importText = $state<string | null>(null);
let importName = $state('');
let preview = $state<SnapshotImportPreview | null>(null);
let importError = $state<string | null>(null);
let fileInput: HTMLInputElement | undefined = $state();

async function refresh() {
  try {
    snapshots = await runtime.snapshots.list();
    listError = null;
  } catch (err) {
    listError = err instanceof Error ? err.message : String(err);
  }
}

$effect(() => {
  dt.worldVersion;
  void refresh();
});

async function save(event: SubmitEvent) {
  event.preventDefault();
  const trimmed = name.trim();
  if (!trimmed) return;
  const saved = await dt.run(
    'snap:save',
    () =>
      runtime.snapshots.save({ name: trimmed, ...(notes.trim() ? { notes: notes.trim() } : {}) }),
    `Snapshot “${trimmed}” saved.`
  );
  if (saved) {
    name = '';
    notes = '';
    await refresh();
  }
}

async function restore(snapshot: SnapshotSummary) {
  await dt.run(
    'snap:restore',
    () => runtime.snapshots.restore(snapshot.id),
    `Restored “${snapshot.name}”.`
  );
  dt.touchWorld();
}

async function remove(snapshot: SnapshotSummary) {
  await dt.run(
    'snap:remove',
    () => runtime.snapshots.remove(snapshot.id),
    `Deleted “${snapshot.name}”.`
  );
  await refresh();
}

async function exportOne(id?: string) {
  const file = await dt.run(`snap:export:${id ?? 'current'}`, () =>
    runtime.snapshots.exportJson(id)
  );
  if (file) {
    downloadText(file.filename, file.json);
    dt.notify('success', `Downloaded ${file.filename}.`);
  }
}

async function onFile(event: Event) {
  const input = event.currentTarget as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  preview = null;
  importError = null;
  importText = null;
  if (!file) return;
  importName = file.name;
  try {
    const text = await file.text();
    preview = await runtime.snapshots.previewImport(text);
    importText = text;
  } catch (err) {
    importError = err instanceof Error ? err.message : String(err);
  }
}

async function confirmImport(andRestore: boolean) {
  if (!importText) return;
  const text = importText;
  const result = await dt.run(
    'snap:import',
    () => runtime.snapshots.importJson(text, { restore: andRestore }),
    andRestore ? 'Snapshot imported and restored.' : 'Snapshot imported.'
  );
  if (result) {
    importText = null;
    preview = null;
    if (andRestore) dt.touchWorld();
    await refresh();
  }
}

function rowTotal(stats: Record<string, number>): number {
  return Object.values(stats).reduce((sum, n) => sum + n, 0);
}
</script>

<Section title="Save the current world" description="Captures records, persona, clock, environment and appearance — including manual edits.">
  <form class="space-y-2" onsubmit={save}>
    <label class="block text-[11px] text-muted-foreground">
      Name
      <input
        class="mt-1 block min-h-touch w-full rounded-md border border-input bg-surface px-2 text-xs text-surface-foreground sm:min-h-7"
        maxlength="120"
        required
        placeholder="Before the demo"
        bind:value={name}
      />
    </label>
    <label class="block text-[11px] text-muted-foreground">
      Notes (optional)
      <textarea
        class="mt-1 block w-full rounded-md border border-input bg-surface px-2 py-1 text-xs text-surface-foreground"
        rows="2"
        maxlength="2000"
        bind:value={notes}
      ></textarea>
    </label>
    <div class="flex flex-wrap gap-1.5">
      <Btn type="submit" variant="primary" disabled={!name.trim()} busy={dt.isBusy('snap:save')}>Save snapshot</Btn>
      <Btn busy={dt.isBusy('snap:export:current')} onclick={() => exportOne()}>
        <Download class="size-3.5" aria-hidden="true" />Export current world
      </Btn>
    </div>
  </form>
</Section>

<Section title={`Saved snapshots (${snapshots.length})`}>
  {#if listError}<p class="text-xs text-destructive" role="alert">{listError}</p>{/if}
  <ul class="space-y-1.5">
    {#each snapshots as snapshot (snapshot.id)}
      <li class="rounded-md border border-border bg-surface p-2.5">
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <p class="truncate text-xs font-medium">{snapshot.name}</p>
            <p class="text-[11px] text-muted-foreground">
              {formatDateTime(snapshot.createdAt)} · {snapshot.scenarioId ?? 'no scenario'} · {rowTotal(snapshot.stats)} rows
            </p>
            {#if snapshot.notes}<p class="mt-1 text-[11px] text-muted-foreground">{snapshot.notes}</p>{/if}
          </div>
          <div class="flex shrink-0 gap-0.5">
            <Btn variant="ghost" aria-label={`Download ${snapshot.name}`} onclick={() => exportOne(snapshot.id)}>
              <Download class="size-3.5" aria-hidden="true" />
            </Btn>
          </div>
        </div>
        <div class="mt-2 flex flex-wrap gap-1.5">
          <Confirm
            label="Restore"
            confirmLabel="Restore"
            message={`Replaces the current data with “${snapshot.name}”. Save a snapshot first if you want to keep it.`}
            busy={dt.isBusy('snap:restore')}
            onconfirm={() => restore(snapshot)}
          />
          <Confirm
            label="Delete"
            confirmLabel="Delete snapshot"
            variant="ghost"
            message={`Deletes “${snapshot.name}” from this browser. The current data is not affected.`}
            busy={dt.isBusy('snap:remove')}
            onconfirm={() => remove(snapshot)}
          />
        </div>
      </li>
    {:else}
      <li class="text-[11px] text-muted-foreground">No snapshots yet. Scenario loads with “snapshot first” also appear here.</li>
    {/each}
  </ul>
</Section>

<Section title="Import" description="Snapshot files are validated as data and never executed.">
  <input bind:this={fileInput} type="file" accept=".json,application/json" class="sr-only" tabindex="-1" aria-hidden="true" onchange={onFile} />
  <Btn onclick={() => fileInput?.click()}><Upload class="size-3.5" aria-hidden="true" />Choose snapshot file…</Btn>
  {#if importError}
    <p class="mt-2 text-xs text-destructive" role="alert">{importError}</p>
  {/if}
  {#if preview}
    <div class="mt-2.5 rounded-md border border-border bg-surface p-2.5 text-[11px]">
      <p class="text-xs font-medium">{preview.snapshot.name}</p>
      <p class="text-muted-foreground">
        {importName} · {preview.snapshot.prototypeId} v{preview.snapshot.prototypeVersion} · schema v{preview.snapshot.schemaVersion}
      </p>
      <p class="mt-1 text-muted-foreground">
        {Object.entries(preview.rowCounts).map(([t, n]) => `${t}: ${n}`).join(' · ') || 'No rows'}
      </p>
      {#if preview.warnings.length}
        <ul class="mt-1.5 list-disc space-y-0.5 pl-4 text-foreground">
          {#each preview.warnings as warning, i (i)}<li>{warning}</li>{/each}
        </ul>
      {/if}
      <div class="mt-2 flex flex-wrap gap-1.5">
        <Btn busy={dt.isBusy('snap:import')} onclick={() => confirmImport(false)}>Import only</Btn>
        <Confirm
          label="Import & restore"
          confirmLabel="Replace data"
          variant="primary"
          message="Stores the snapshot and replaces the current data with it."
          busy={dt.isBusy('snap:import')}
          onconfirm={() => confirmImport(true)}
        />
        <Btn variant="ghost" onclick={() => { preview = null; importText = null; }}>
          <Trash2 class="size-3.5" aria-hidden="true" />Discard
        </Btn>
      </div>
    </div>
  {/if}
</Section>
