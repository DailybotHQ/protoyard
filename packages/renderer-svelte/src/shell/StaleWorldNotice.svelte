<script lang="ts">
import type { PrototypeRuntime } from '@protoyard/core';
import { Button } from '@protoyard/ui';
import Icon from './Icon.svelte';

/** The fields of `@protoyard/runtime`'s `StaleWorld` this notice reads. */
export interface StaleWorldInfo {
  scenario: string;
  seed: number;
  status: 'reseeded' | 'kept';
  snapshotId?: string;
  reason: string;
}

/**
 * Shown once after boot when `scenarios.staleWorld()` reports that the stored
 * world was built by other generator versions. Without it, a rebuilt world
 * looks like lost edits. Loaded lazily by Root, so normal boots never pay for it.
 */
let {
  runtime,
  stale,
  devtools = false,
}: { runtime: PrototypeRuntime; stale: StaleWorldInfo; devtools?: boolean } = $props();

let open = $state(true);
let restored = $state(false);
let error = $state<string | null>(null);
const scenarioName = $derived(runtime.scenarios.get(stale.scenario)?.name ?? stale.scenario);
const snapshotName = $derived(`Before refreshing ${scenarioName}`);

async function restore() {
  if (!stale.snapshotId) return;
  error = null;
  try {
    await runtime.snapshots.restore(stale.snapshotId);
    restored = true;
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }
}
</script>

{#if open}
  <div
    role="region"
    aria-label={stale.status === 'kept' ? 'Prototype data kept' : 'Prototype data rebuilt'}
    data-py-stale-world={stale.status}
    class="relative z-40 border-b border-border bg-accent px-4 py-3 text-sm text-accent-foreground"
  >
    <div class="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-center">
      <Icon name="refresh" class="hidden size-4 shrink-0 sm:block" />
      <div class="min-w-0 flex-1" aria-live="polite">
        {#if restored}
          <p>Your previous data is back. It will not be rebuilt again on the next visit.</p>
        {:else if stale.status === 'kept'}
          <p>
            This prototype's generator changed, but its stored data was kept because a safety
            snapshot could not be saved. Reset the <strong class="font-semibold">{scenarioName}</strong>
            scenario to rebuild it{devtools ? ' (DevTools → Scenario, Ctrl or ⌘ + .)' : ''}.
          </p>
        {:else}
          <p>
            This prototype's generator changed, so the stored data was rebuilt from the
            <strong class="font-semibold">{scenarioName}</strong> scenario (seed {stale.seed}).
          </p>
          {#if stale.snapshotId}
            <p class="text-xs opacity-80">
              Your earlier data, edits included, was saved first as the snapshot “{snapshotName}”.
              Restore it here{devtools ? ', or later from DevTools → Snaps (Ctrl or ⌘ + .)' : ''}.
            </p>
          {:else}
            <p class="text-xs opacity-80">This sandbox is disposable, so no snapshot was saved.</p>
          {/if}
        {/if}
        {#if error}
          <p class="mt-1 text-xs font-medium text-destructive" role="alert">{error}</p>
        {/if}
      </div>
      <div class="flex gap-2">
        {#if stale.snapshotId && !restored && stale.status === 'reseeded'}
          <Button size="sm" onclick={restore}>Restore previous data</Button>
        {/if}
        <Button size="sm" variant="outline" onclick={() => (open = false)}>Dismiss</Button>
      </div>
    </div>
  </div>
{/if}
