<script lang="ts">
import type { PrototypeRuntime } from '@protoyard/core';
import Icon from './Icon.svelte';

interface PendingLink {
  scenario: string;
  seed?: number;
  reason: string;
}

/**
 * A `?scenario=` link asked for a different world than the one stored in
 * this browser. Loading replaces local edits, so it is never automatic.
 */
let { runtime }: { runtime: PrototypeRuntime } = $props();

function readPending(): PendingLink | null {
  const scenarios = runtime.scenarios as typeof runtime.scenarios & {
    pendingLink?: () => PendingLink | null;
  };
  return typeof scenarios.pendingLink === 'function' ? scenarios.pendingLink() : null;
}

// svelte-ignore state_referenced_locally
let pending = $state(readPending());
let snapshotFirst = $state(true);
let busy = $state(false);
let error = $state<string | null>(null);
const scenarioName = $derived(
  pending ? (runtime.scenarios.get(pending.scenario)?.name ?? pending.scenario) : ''
);

async function load() {
  if (!pending) return;
  busy = true;
  error = null;
  try {
    await runtime.scenarios.load(pending.scenario, {
      ...(pending.seed !== undefined ? { seed: pending.seed } : {}),
      snapshotFirst,
    });
    pending = null;
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  } finally {
    busy = false;
  }
}
</script>

{#if pending}
  <div
    role="region"
    aria-label="Linked scenario"
    class="relative z-40 border-b border-border bg-accent px-4 py-3 text-sm text-accent-foreground"
  >
    <div class="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-center">
      <Icon name="link" class="hidden size-4 shrink-0 sm:block" />
      <div class="min-w-0 flex-1">
        <p>
          This link opens the <strong class="font-semibold">{scenarioName}</strong> scenario{pending.seed !==
          undefined
            ? ` (seed ${pending.seed})`
            : ''}, but this browser already has its own data.
        </p>
        <p class="text-xs opacity-80">{pending.reason}</p>
        {#if error}
          <p class="mt-1 text-xs font-medium text-destructive" role="alert">{error}</p>
        {/if}
      </div>
      <label class="inline-flex min-h-touch items-center gap-2 text-xs sm:min-h-0">
        <input type="checkbox" class="size-4 accent-primary" bind:checked={snapshotFirst} />
        Snapshot my data first
      </label>
      <div class="flex gap-2">
        <button
          type="button"
          class="inline-flex min-h-touch items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60 sm:min-h-8"
          disabled={busy}
          aria-busy={busy}
          onclick={load}
        >
          {busy ? 'Loading…' : 'Load linked scenario'}
        </button>
        <button
          type="button"
          class="inline-flex min-h-touch items-center rounded-md border border-border bg-surface px-3 text-sm font-medium text-surface-foreground hover:bg-muted sm:min-h-8"
          disabled={busy}
          onclick={() => (pending = null)}
        >
          Keep my data
        </button>
      </div>
    </div>
  </div>
{/if}
