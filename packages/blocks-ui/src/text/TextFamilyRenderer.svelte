<script lang="ts">
import type { Block } from '@protoyard/blocks';
import { avatarUrl } from '@protoyard/renderer-svelte';
import { Avatar } from '@protoyard/ui';
import { BLOCK_ICON_COMPONENTS } from '../lib/icons.ts';
import MdRenderer from './MdRenderer.svelte';

let { block }: { block: Block } = $props();
const alignClass = (align: 'start' | 'center' | undefined) =>
  align === 'center' ? 'text-center' : 'text-left';
</script>

{#if block.type === 'heading'}
  <header class={`space-y-2 ${alignClass(block.align)}`}>
    {#if block.eyebrow}<p class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{block.eyebrow}</p>{/if}
    <svelte:element this={`h${block.level ?? 2}`} class="text-2xl font-semibold tracking-tight text-foreground" data-py-block-heading>{block.text}</svelte:element>
    {#if block.subtitle}<p class="text-base text-muted-foreground">{block.subtitle}</p>{/if}
  </header>
{:else if block.type === 'text'}
  <MdRenderer source={block.markdown} class={`${block.size === 'lg' ? 'text-base' : block.size === 'sm' ? 'text-xs' : 'text-sm'} ${alignClass(block.align)}`} />
{:else if block.type === 'list'}
  <ul class="space-y-2 text-foreground">
    {#each block.items as item, i (i)}
      <li class="flex items-start gap-2">
        {#if block.style === 'check'}<span aria-hidden="true" class="mt-1 text-muted-foreground">{item.done ? '✓' : '○'}</span>
        {:else if block.style === 'icon' && item.icon}
          {@const Icon = BLOCK_ICON_COMPONENTS[item.icon]}
          <Icon aria-hidden="true" class="mt-1 size-4 shrink-0 text-muted-foreground" />
        {:else}<span aria-hidden="true" class="mt-1 text-muted-foreground">{block.style === 'number' ? `${i + 1}.` : '•'}</span>{/if}
        <MdRenderer source={item.text} class="min-w-0 flex-1" />
      </li>
    {/each}
  </ul>
{:else if block.type === 'quote'}
  <figure class="border-l-2 border-primary pl-4 text-foreground">
    <blockquote class="text-lg italic"><MdRenderer source={block.quote} /></blockquote>
    {#if block.cite || block.role || block.avatar}<figcaption class="mt-2 flex items-center gap-2 text-sm text-muted-foreground">{#if block.avatar}<Avatar name={block.cite ?? 'Quote author'} src={avatarUrl(block.avatar)} size="sm" decorative />{/if}<span>{#if block.cite}<cite class="not-italic font-medium">{block.cite}</cite>{/if}{#if block.role}<span>{block.cite ? ` · ${block.role}` : block.role}</span>{/if}</span></figcaption>{/if}
  </figure>
{:else if block.type === 'callout'}
  <aside class="rounded-lg border border-border bg-muted/50 p-4 text-foreground">
    {#if block.title}<h3 class="mb-1 font-semibold">{block.title}</h3>{/if}<MdRenderer source={block.body} />
  </aside>
{:else if block.type === 'divider'}
  {#if block.variant === 'space'}<div aria-hidden="true" class="h-8"></div>
  {:else}<div class="flex items-center gap-3 text-muted-foreground"><hr class="min-w-0 flex-1 border-border" />{#if block.label}<span class="text-xs">{block.label}</span><hr class="min-w-0 flex-1 border-border" />{/if}</div>{/if}
{/if}
