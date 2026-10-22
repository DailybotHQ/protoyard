<script lang="ts">
import type { Block } from '@protoyard/blocks';
import { ErrorState, LoadingState } from '@protoyard/ui';
import { untrack } from 'svelte';
import { type BlockHostResolution, resolvePageBlock } from './load-family.ts';
import UnknownBlock from './UnknownBlock.svelte';

/**
 * Lazy single-block host for page and doc surfaces. Dynamically imports the
 * matching `@protoyard/blocks-ui/<family>` dispatcher, shows LoadingState while
 * loading, and never injects raw HTML.
 */
let {
  block,
  class: className = '',
}: {
  /** Typed block or untrusted JSON (re-validated at the boundary). */
  block: Block | unknown;
  class?: string;
} = $props();

let resolution = $state<BlockHostResolution | null>(null);
let failed = $state(false);
let loading = $state(true);

/** Stable key so object identity churn does not reload forever. */
const blockKey = $derived(
  (() => {
    try {
      return JSON.stringify(block);
    } catch {
      return String(block);
    }
  })()
);

$effect(() => {
  const key = blockKey;
  let cancelled = false;
  loading = true;
  failed = false;
  resolution = null;

  void (async () => {
    try {
      const input = untrack(() => block);
      const next = await resolvePageBlock(input);
      if (cancelled) return;
      resolution = next;
      failed = false;
    } catch {
      if (cancelled) return;
      failed = true;
      resolution = null;
    } finally {
      if (!cancelled) loading = false;
    }
  })();

  return () => {
    cancelled = true;
    void key;
  };
});

function retry(): void {
  // Force a reload by re-running the effect dependency.
  loading = true;
  failed = false;
  resolution = null;
  void resolvePageBlock(block).then(
    (next) => {
      resolution = next;
      failed = false;
      loading = false;
    },
    () => {
      failed = true;
      resolution = null;
      loading = false;
    }
  );
}
</script>

<div class="min-w-0 {className}" data-py-block-host>
  {#if loading && !resolution}
    <LoadingState label="Loading block…" variant="skeleton" rows={3} />
  {:else if failed}
    <ErrorState
      title="Block failed to load"
      message="The renderer could not be started. You can try again."
      onRetry={() => retry()}
    />
  {:else if resolution?.kind === 'render'}
    {@const Renderer = resolution.component}
    <div data-py-block-family={resolution.family} data-block-type={resolution.block.type}>
      <Renderer block={resolution.block} />
    </div>
  {:else if resolution?.kind === 'unknown' || resolution?.kind === 'unavailable'}
    <UnknownBlock
      message={resolution.message}
      blockType={typeof block === 'object' &&
      block !== null &&
      'type' in block &&
      typeof (block as { type?: unknown }).type === 'string'
        ? (block as { type: string }).type
        : undefined}
    />
  {:else}
    <LoadingState label="Loading block…" variant="skeleton" rows={2} />
  {/if}
</div>
