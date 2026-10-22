<script lang="ts">
import type { PrototypeRuntime } from '@protoyard/core';
import { Button } from '@protoyard/ui';
import { chromeMessages, formatMessage } from '../messages.ts';
import Icon from './Icon.svelte';
import MessageText from './MessageText.svelte';

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
const messages = chromeMessages().staleWorld;
const snapshotName = $derived(formatMessage(messages.snapshotName, { scenario: scenarioName }));

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
    aria-label={stale.status === 'kept' ? messages.keptLabel : messages.rebuiltLabel}
    data-py-stale-world={stale.status}
    class="relative z-40 border-b border-border bg-accent px-4 py-3 text-sm text-accent-foreground"
  >
    <div class="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-center">
      <Icon name="refresh" class="hidden size-4 shrink-0 sm:block" />
      <div class="min-w-0 flex-1" aria-live="polite">
        {#if restored}
          <p>{messages.restored}</p>
        {:else if stale.status === 'kept'}
          <p>
            <MessageText
              template={devtools ? messages.keptWithDevtools : messages.kept}
              values={{ scenario: scenarioName }}
              strong={['scenario']}
            />
          </p>
        {:else}
          <p>
            <MessageText
              template={messages.rebuilt}
              values={{ scenario: scenarioName, seed: stale.seed }}
              strong={['scenario']}
            />
          </p>
          {#if stale.snapshotId}
            <p class="text-xs opacity-80">
              {formatMessage(devtools ? messages.snapshotSavedWithDevtools : messages.snapshotSaved, {
                snapshot: snapshotName,
              })}
            </p>
          {:else}
            <p class="text-xs opacity-80">{messages.noSnapshot}</p>
          {/if}
        {/if}
        {#if error}
          <p class="mt-1 text-xs font-medium text-destructive" role="alert">{error}</p>
        {/if}
      </div>
      <div class="flex gap-2">
        {#if stale.snapshotId && !restored && stale.status === 'reseeded'}
          <Button size="sm" onclick={restore}>{messages.restore}</Button>
        {/if}
        <Button size="sm" variant="outline" onclick={() => (open = false)}>{messages.dismiss}</Button>
      </div>
    </div>
  </div>
{/if}
