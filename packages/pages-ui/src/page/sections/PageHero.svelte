<script lang="ts">
import type { HeadingBlock } from '@protoyard/blocks';
import { Badge } from 'texuli/badge';

/** The hero title at the display scale, with its eyebrow and lead. */
let { heading }: { heading: HeadingBlock } = $props();
const centered = $derived(heading.align !== 'start');
</script>

<header
  class="grid gap-6 {centered ? 'mx-auto max-w-4xl justify-items-center text-center' : 'max-w-3xl'}"
  data-py-page-hero-header
>
  {#if heading.eyebrow}
    <Badge variant="outline" class="gap-2 rounded-full px-3.5 py-1.5 text-xs font-semibold tracking-wide uppercase shadow-soft">
      <span class="size-1.5 rounded-full bg-primary" aria-hidden="true"></span>
      {heading.eyebrow}
    </Badge>
  {/if}
  <h1
    id={heading.id}
    class="font-heading text-4xl leading-[1.05] font-bold tracking-tight text-balance text-foreground sm:text-5xl lg:text-6xl"
    data-py-page-display
  >
    {heading.text}
  </h1>
  {#if heading.subtitle}
    <p class="max-w-2xl text-lg text-pretty text-muted-foreground sm:text-xl">{heading.subtitle}</p>
  {/if}
</header>
