<script lang="ts">
import { Button } from '@protoyard/ui';
import type { ActivitySegment } from '@protoyard/views/activity';

/** A tokenized body as plain text: mentions and references are styled text, never HTML. */
let {
  segments,
  onOpenReference,
}: { segments: readonly ActivitySegment[]; onOpenReference?: (id: string) => void } = $props();
</script>

{#each segments as segment, i (i)}
  {#if segment.type === 'text'}{segment.text}{:else if segment.type === 'mention'}<span
      class="rounded bg-primary/10 px-0.5 font-medium text-foreground"
      class:line-through={segment.missing}>@{segment.label}</span
    >{:else if onOpenReference && !segment.missing}<Button
      type="button"
      class="rounded px-0.5 font-medium text-primary underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      onclick={() => onOpenReference(segment.id)}>#{segment.label}</Button
    >{:else}<span class="font-medium">#{segment.label}</span>{/if}
{/each}
