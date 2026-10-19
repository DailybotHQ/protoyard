<script lang="ts">
import { monogram } from '../../lib/format';

/**
 * A screenshot (or the product's icon) inside a small CSS frame for its shell:
 * phone, tablet, desktop window, browser, widget on a site, extension popup or
 * plugin panel. Pure markup and CSS, so it renders at build time with no JS.
 * Frames are generic and brand-neutral, like the renderer's.
 */
let {
  shell,
  src = null,
  icon = null,
  name,
  size = 'md',
}: {
  shell: string;
  /** Base-prefixed screenshot URL. */
  src?: string | null;
  icon?: string | null;
  name: string;
  size?: 'md' | 'lg';
} = $props();

const lg = $derived(size === 'lg');
</script>

{#snippet screen(extra = '')}
  <div class={['relative grid h-full w-full place-items-center overflow-hidden bg-bg', extra]}>
    {#if src}
      <!-- Decorative: the card title is the accessible name. -->
      <img src={src} alt="" loading="lazy" decoding="async" width="640" height="400" class="h-full w-full object-cover object-top" />
    {:else}
      <span aria-hidden="true" class={['grid place-items-center rounded-xl bg-surface-2 font-semibold text-accent-fg', lg ? 'size-20 text-4xl' : 'size-12 text-2xl']}>
        {#if icon}{icon}{:else}<span class="text-sm">{monogram(name)}</span>{/if}
      </span>
    {/if}
  </div>
{/snippet}

<div
  aria-hidden="true"
  data-device-thumb={shell}
  class={['grid w-full place-items-center bg-surface-2 p-3', lg ? 'h-80 sm:h-96' : 'h-44']}
>
  {#if shell === 'phone'}
    <div class="h-full overflow-hidden rounded-[18%/9%] border-[5px] border-zinc-800 bg-zinc-800 shadow-md dark:border-zinc-950" style="aspect-ratio: 9 / 19.5">
      {@render screen('rounded-[14%/7%]')}
    </div>
  {:else if shell === 'tablet'}
    <div class="h-full overflow-hidden rounded-[8%] border-[6px] border-zinc-800 shadow-md dark:border-zinc-950" style="aspect-ratio: 3 / 4">
      {@render screen()}
    </div>
  {:else if shell === 'desktop-window'}
    <div class="flex h-full w-full max-w-[94%] flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-md">
      <div class="flex h-4 shrink-0 items-center gap-1 border-b border-line px-2">
        <span class="size-1.5 rounded-full bg-[#ff5f57]"></span><span class="size-1.5 rounded-full bg-[#febc2e]"></span><span class="size-1.5 rounded-full bg-[#28c840]"></span>
      </div>
      <div class="min-h-0 flex-1">{@render screen()}</div>
    </div>
  {:else if shell === 'browser'}
    <div class="flex h-full w-full max-w-[94%] flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-md">
      <div class="flex h-5 shrink-0 items-center gap-1.5 border-b border-line bg-surface-2 px-2">
        <span class="h-2.5 w-10 rounded-sm bg-surface"></span>
        <span class="h-2.5 flex-1 rounded-full bg-surface"></span>
      </div>
      <div class="min-h-0 flex-1">{@render screen()}</div>
    </div>
  {:else if shell === 'widget-host'}
    <div class="relative h-full w-full max-w-[94%] overflow-hidden rounded-lg border border-line bg-surface shadow-md">
      <div class="space-y-1.5 p-3">
        <span class="block h-2 w-1/3 rounded-full bg-surface-2"></span>
        <span class="block h-2 w-2/3 rounded-full bg-surface-2"></span>
        <span class="block h-2 w-1/2 rounded-full bg-surface-2"></span>
      </div>
      <div class="absolute right-2 bottom-7 h-[62%] w-[38%] overflow-hidden rounded-md border border-line shadow-lg">{@render screen()}</div>
      <span class="absolute right-2 bottom-1.5 size-4 rounded-full bg-accent"></span>
    </div>
  {:else if shell === 'extension-popup'}
    <div class="relative h-full w-full max-w-[94%] overflow-hidden rounded-lg border border-line bg-surface shadow-md">
      <div class="flex h-5 items-center justify-end gap-1 border-b border-line bg-surface-2 px-2">
        <span class="h-2.5 flex-1 rounded-full bg-surface"></span><span class="size-2.5 rounded-sm bg-accent"></span>
      </div>
      <div class="absolute top-6 right-2 h-[72%] w-[36%] overflow-hidden rounded-md border border-line shadow-lg">{@render screen()}</div>
    </div>
  {:else if shell === 'side-panel'}
    <div class="flex h-full w-full max-w-[94%] overflow-hidden rounded-lg border border-line bg-surface shadow-md">
      <div class="flex-1 space-y-1.5 bg-surface-2 p-3">
        <span class="block h-2 w-2/3 rounded-full bg-surface"></span>
        <span class="block h-2 w-1/2 rounded-full bg-surface"></span>
      </div>
      <div class="w-[42%] border-l border-line">{@render screen()}</div>
    </div>
  {:else}
    <div class="h-full w-full max-w-[94%] overflow-hidden rounded-lg border border-line shadow-md">{@render screen()}</div>
  {/if}
</div>
