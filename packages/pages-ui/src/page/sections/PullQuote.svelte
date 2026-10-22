<script lang="ts">
import type { QuoteBlock } from '@protoyard/blocks';
import { plainParagraphs } from '../design.ts';

/** A testimonial as a pull quote with its attribution. */
let { block }: { block: QuoteBlock } = $props();
const paragraphs = $derived(plainParagraphs(block.quote));
const initials = $derived(
  (block.cite ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('')
);
</script>

<figure class="mx-auto grid max-w-3xl justify-items-center gap-6 text-center" data-py-page-quote>
  <svg viewBox="0 0 32 24" class="h-8 w-10 fill-primary/30" aria-hidden="true">
    <path d="M0 24V14C0 6 4.5 1.3 12 0l1.4 3.2C9 4.6 7 7.3 6.8 11H12v13H0Zm19 0V14c0-8 4.5-12.7 12-14l1 3.2C27.6 4.6 25.6 7.3 25.4 11H31v13H19Z" />
  </svg>
  <blockquote
    class="grid gap-3 font-heading text-2xl leading-snug font-medium tracking-tight text-balance text-foreground sm:text-3xl"
  >
    {#each paragraphs as paragraph, i (i)}
      <p>{paragraph}</p>
    {/each}
  </blockquote>
  {#if block.cite || block.role}
    <figcaption class="flex items-center gap-3 text-start">
      {#if initials}
        <span
          class="grid size-11 shrink-0 place-items-center rounded-full bg-muted font-semibold text-foreground"
          aria-hidden="true"
        >
          {initials}
        </span>
      {/if}
      <span class="grid">
        {#if block.cite}<span class="font-semibold text-foreground">{block.cite}</span>{/if}
        {#if block.role}<span class="text-sm text-muted-foreground">{block.role}</span>{/if}
      </span>
    </figcaption>
  {/if}
</figure>
