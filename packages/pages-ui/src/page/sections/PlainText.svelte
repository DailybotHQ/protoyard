<script lang="ts">
import { plainParagraphs } from '../design.ts';

/** Short markdown as text paragraphs (never HTML). */
let { text, class: className = '' }: { text: string; class?: string } = $props();
const paragraphs = $derived(plainParagraphs(text));
</script>

{#if paragraphs.length > 0}
  <div class="grid gap-2 {className}">
    {#each paragraphs as paragraph, i (i)}
      <p>{paragraph}</p>
    {/each}
  </div>
{/if}
