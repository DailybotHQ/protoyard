<script lang="ts">
import { Check, Copy } from '@lucide/svelte';
import type { Scenario } from '@protoyard/core';
import { copyText, formatDateTime } from '../format.ts';
import { reproducibleLink } from '../link.ts';
import Btn from '../primitives/Btn.svelte';
import Confirm from '../primitives/Confirm.svelte';
import InlineError from '../primitives/InlineError.svelte';
import Section from '../primitives/Section.svelte';
import type { DevtoolsState } from '../state.svelte.ts';

let { dt }: { dt: DevtoolsState } = $props();
const runtime = $derived(dt.runtime);

const groups = $derived.by(() => {
  const map = new Map<string, Scenario[]>();
  for (const scenario of runtime.scenarios.list()) {
    const list = map.get(scenario.group) ?? [];
    list.push(scenario);
    map.set(scenario.group, list);
  }
  return [...map.entries()];
});

// svelte-ignore state_referenced_locally
let selectedId = $state(dt.active?.scenario.id ?? runtime.scenarios.list()[0]?.id ?? '');
let seedText = $state('');
let snapshotFirst = $state(true);
let copied = $state(false);
const selected = $derived(runtime.scenarios.get(selectedId));
const seedValid = $derived(seedText === '' || /^\d{1,10}$/.test(seedText));
/** A load or reset in flight (from here or any other caller): nothing else starts. */
const loading = $derived(dt.isBusy('scenario') || dt.progress !== null);

async function load() {
  if (!selected || !seedValid) return;
  await dt.run(
    'scenario:load',
    () =>
      runtime.scenarios.load(selected.id, {
        snapshotFirst,
        ...(seedText ? { seed: Number(seedText) } : {}),
      }),
    `Loaded “${selected.name}”${snapshotFirst ? ' (safety snapshot saved)' : ''}.`
  );
  dt.touchWorld();
}

async function reset() {
  await dt.run(
    'scenario:reset',
    () => runtime.scenarios.reset({ snapshotFirst }),
    'Scenario reset to its seed.'
  );
  dt.touchWorld();
}

async function copyLink() {
  copied = await copyText(reproducibleLink(runtime));
  dt.notify(
    copied ? 'success' : 'error',
    copied ? 'Reproducible link copied.' : 'Could not access the clipboard.'
  );
  setTimeout(() => (copied = false), 1500);
}
</script>

<Section title="Active scenario">
  {#if dt.active}
    <div class="rounded-lg border border-border bg-surface p-3">
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <p class="truncate text-sm font-semibold">{dt.active.scenario.name}</p>
          <p class="font-mono text-[11px] text-muted-foreground">{dt.active.scenario.id}</p>
        </div>
        <span class="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
          >{dt.active.scenario.group}</span
        >
      </div>
      {#if dt.active.scenario.description}
        <p class="mt-2 text-xs text-muted-foreground">{dt.active.scenario.description}</p>
      {/if}
      <dl class="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
        <dt class="text-muted-foreground">Seed</dt>
        <dd class="font-mono">{dt.active.seed}</dd>
        <dt class="text-muted-foreground">Reference time</dt>
        <dd class="font-mono">{formatDateTime(dt.active.scenario.referenceTime)}</dd>
        <dt class="text-muted-foreground">Scenario version</dt>
        <dd class="font-mono">v{dt.active.scenario.version}</dd>
        <dt class="text-muted-foreground">Generator SDK</dt>
        <dd class="font-mono">v{dt.active.generatorVersion}</dd>
        {#if dt.active.prototypeGeneratorVersion !== undefined}
          <dt class="text-muted-foreground">Prototype generator</dt>
          <dd class="font-mono">v{dt.active.prototypeGeneratorVersion}</dd>
        {/if}
        <dt class="text-muted-foreground">Loaded</dt>
        <dd class="font-mono">{formatDateTime(dt.active.loadedAt)}</dd>
      </dl>
      <div class="mt-3 flex flex-wrap gap-1.5">
        <Confirm
          label="Reset scenario"
          confirmLabel="Reset data"
          message="Rebuilds this prototype's data from the scenario seed. Your edits are replaced."
          busy={dt.isBusy('scenario:reset')}
          disabled={loading}
          onconfirm={reset}
        />
        <Btn onclick={copyLink}>
          {#if copied}<Check class="size-3.5" aria-hidden="true" />{:else}<Copy class="size-3.5" aria-hidden="true" />{/if}
          Copy link
        </Btn>
      </div>
    </div>
  {:else}
    <p class="text-xs text-muted-foreground">No scenario loaded yet.</p>
  {/if}
</Section>

{#if dt.progress}
  {@const p = dt.progress}
  {@const fraction = p.phase === 'write' && p.total > 0 ? p.done / p.total : p.phase === 'done' ? 1 : null}
  <Section title="Loading">
    <p class="text-xs" role="status">
      {p.phase === 'generate'
        ? 'Generating the world…'
        : p.phase === 'validate'
          ? 'Checking integrity…'
          : p.phase === 'write'
            ? `Writing ${p.done.toLocaleString('en-US')} of ${p.total.toLocaleString('en-US')} rows…`
            : 'Scenario loaded.'}
      <span class="font-mono text-muted-foreground">{p.scenarioId}</span>
    </p>
    <div
      class="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
      role="progressbar"
      aria-label="Scenario load progress"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={fraction === null ? undefined : Math.round(fraction * 100)}
    >
      {#if fraction === null}
        <div class="h-full w-1/3 animate-pulse rounded-full bg-primary"></div>
      {:else}
        <div class="h-full rounded-full bg-primary transition-[width] motion-reduce:transition-none" style:width={`${Math.round(fraction * 100)}%`}></div>
      {/if}
    </div>
  </Section>
{/if}

<Section title="Load a scenario" description="Rebuilds the world from a versioned seed. Only this prototype's data changes.">
  <div class="space-y-3">
    {#each groups as [group, scenarios] (group)}
      <fieldset disabled={loading} class="disabled:opacity-60">
        <legend class="mb-1 text-[11px] font-medium text-muted-foreground">{group}</legend>
        <div class="space-y-1">
          {#each scenarios as scenario (scenario.id)}
            {@const isActive = dt.active?.scenario.id === scenario.id}
            <label
              class="flex cursor-pointer items-start gap-2.5 rounded-md border p-2 text-left transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring {selectedId ===
              scenario.id
                ? 'border-primary/60 bg-primary/5'
                : 'border-border hover:bg-muted/60'}"
            >
              <input
                type="radio"
                name="py-dt-scenario"
                class="mt-0.5 size-3.5 accent-primary"
                value={scenario.id}
                bind:group={selectedId}
              />
              <span class="min-w-0 flex-1">
                <span class="flex items-center gap-1.5 text-xs font-medium">
                  {scenario.name}
                  {#if isActive}<span class="rounded bg-success px-1 text-[10px] font-medium text-success-foreground">active</span>{/if}
                </span>
                {#if scenario.description}
                  <span class="mt-0.5 block text-[11px] leading-snug text-muted-foreground">{scenario.description}</span>
                {/if}
              </span>
            </label>
          {/each}
        </div>
      </fieldset>
    {/each}

    <div class="grid grid-cols-[1fr_auto] items-end gap-2">
      <label class="block text-[11px] text-muted-foreground">
        Seed (optional)
        <input
          type="text"
          inputmode="numeric"
          class="mt-1 block min-h-touch w-full rounded-md border border-input bg-surface px-2 font-mono text-xs text-surface-foreground sm:min-h-7"
          placeholder={String(selected?.seed ?? '')}
          aria-invalid={!seedValid}
          bind:value={seedText}
        />
      </label>
      <label class="inline-flex min-h-touch items-center gap-1.5 text-[11px] sm:min-h-7">
        <input type="checkbox" class="size-3.5 accent-primary" bind:checked={snapshotFirst} />
        Snapshot first
      </label>
    </div>
    {#if !seedValid}<p class="text-[11px] text-destructive">Seed must be a whole number.</p>{/if}

    <Confirm
      label={selected ? `Load “${selected.name}”` : 'Load'}
      confirmLabel="Replace data"
      variant="primary"
      disabled={!selected || !seedValid || loading}
      message={`Loading replaces this prototype's current data${snapshotFirst ? ' — a safety snapshot is saved first' : ''}.`}
      busy={dt.isBusy('scenario:load')}
      onconfirm={load}
    />
    <InlineError message={dt.errorFor('scenario')} />
  </div>
</Section>

<Section title="Shortcuts">
  <p class="text-[11px] text-muted-foreground">
    <kbd class="rounded border border-border bg-muted px-1 font-mono">Ctrl</kbd>/<kbd
      class="rounded border border-border bg-muted px-1 font-mono">⌘</kbd
    >
    + <kbd class="rounded border border-border bg-muted px-1 font-mono">.</kbd> toggles this panel.
  </p>
</Section>
