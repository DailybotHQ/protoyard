<script lang="ts">
import { Button } from '@protoyard/ui';
import { onMount } from 'svelte';
import type { SourceIssue, SourceKind } from './resolve.ts';

/**
 * Shown when a blueprint cannot be opened: what was tried, every issue with
 * its location and fix, and a way forward. Issue text comes from the
 * untrusted loader (already stripped of control and bidi characters) and is
 * rendered as text, never as HTML.
 */
let {
  source,
  label,
  issues,
  onPick,
}: {
  source: SourceKind;
  label: string;
  issues: readonly SourceIssue[];
  onPick: () => void | Promise<void>;
} = $props();

const MAX_SHOWN = 20;
const what = $derived(
  source === 'share'
    ? 'This share link'
    : source === 'embedded'
      ? 'The blueprint in this page'
      : source === 'src'
        ? `The file ${label}`
        : `The file ${label}`
);
let heading = $state<HTMLHeadingElement | null>(null);
onMount(() => heading?.focus());
</script>

<main class="flex min-h-dvh items-center justify-center bg-background px-4 py-10 text-foreground">
  <section
    class="w-full max-w-lg rounded-xl border border-border bg-surface p-6 shadow-float"
    aria-labelledby="py-source-error-title"
    data-testid="player-source-error"
  >
    <h1 id="py-source-error-title" class="text-lg font-semibold" tabindex="-1" bind:this={heading}>
      {what} could not be opened
    </h1>
    <p class="mt-2 text-sm text-muted-foreground">
      The player checks every blueprint before running it. Nothing was saved and nothing ran.
    </p>
    <ul class="mt-4 space-y-3" aria-label="Problems found">
      {#each issues.slice(0, MAX_SHOWN) as item, i (i)}
        <li class="rounded-lg border border-border p-3 text-sm">
          <p class="font-medium text-surface-foreground">{item.message}</p>
          {#if item.path.length > 0}
            <p class="mt-1 font-mono text-xs text-muted-foreground">at {item.path.join('.')}</p>
          {/if}
          <p class="mt-1 text-muted-foreground">{item.fix}</p>
          <p class="mt-1 font-mono text-xs text-muted-foreground">{item.code}</p>
        </li>
      {/each}
    </ul>
    {#if issues.length > MAX_SHOWN}
      <p class="mt-3 text-sm text-muted-foreground">
        {issues.length - MAX_SHOWN} more problems are not shown. Fix these first, then try again.
      </p>
    {/if}
    <div class="mt-6 flex flex-wrap gap-2">
      <Button onclick={() => onPick()}>Open a blueprint file</Button>
      <Button variant="outline" onclick={() => location.reload()}>Reload</Button>
    </div>
  </section>
</main>
