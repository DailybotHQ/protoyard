<script lang="ts">
import {
  type MdBlock,
  type MdInline,
  parseMarkdown,
  safeHref,
  safeImageSrc,
} from '@protoyard/ai/markdown';
import { cn } from '@protoyard/ui';

interface Props {
  /** Markdown source. Rendered as elements and text only: never `{@html}`. */
  source: string;
  /** Accessible name of the preview region. */
  label?: string;
  /** Shown when the source is empty. */
  emptyText?: string;
  class?: string;
}

let {
  source,
  label = 'Preview',
  emptyText = 'Nothing to preview yet.',
  class: className,
}: Props = $props();

const doc = $derived(parseMarkdown(source));
const external = (href: string) => /^https?:/i.test(href);
</script>

{#snippet inline(nodes: MdInline[])}
  {#each nodes as node, i (i)}
    {#if node.type === 'text'}{node.text}
    {:else if node.type === 'break'}<br />
    {:else if node.type === 'code'}<code class="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]">{node.text}</code>
    {:else if node.type === 'link'}
      <!-- Checked again here, whatever the parser decided. -->
      {@const href = safeHref(node.href)}
      {#if href}
        <a
          {href}
          class="text-primary underline underline-offset-4"
          target={external(href) ? '_blank' : undefined}
          rel={external(href) ? 'noreferrer noopener' : undefined}>{@render inline(node.children)}</a
        >
      {:else}{@render inline(node.children)}{/if}
    {:else if node.type === 'image'}
      {@const src = node.src ? safeImageSrc(node.src) : null}
      {#if src}<img {src} alt={node.alt} class="my-2 max-h-72 max-w-full rounded-md border border-border" loading="lazy" />
      {:else}<span class="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">Image: {node.alt}</span>{/if}
    {:else if node.type === 'attachment'}<span class="rounded border border-border bg-muted px-1.5 py-0.5 text-xs">{node.label}</span>
    {:else if node.type === 'citation'}<sup>[{node.index}]</sup>
    {:else}
      <svelte:element this={node.type === 'strong' ? 'strong' : node.type === 'em' ? 'em' : 'del'}>{@render inline(node.children)}</svelte:element>
    {/if}
  {/each}
{/snippet}

{#snippet blocks(list: MdBlock[])}
  {#each list as block, i (i)}
    {#if block.type === 'paragraph'}<p>{@render inline(block.children)}</p>
    {:else if block.type === 'heading'}
      <svelte:element this={`h${Math.min(6, block.level + 1)}`} class="font-semibold">{@render inline(block.children)}</svelte:element>
    {:else if block.type === 'code'}
      <pre class="overflow-x-auto rounded-md border border-border bg-muted/60 p-3 text-xs"><code>{block.text}</code></pre>
    {:else if block.type === 'list'}
      <svelte:element this={block.ordered ? 'ol' : 'ul'} class={cn('space-y-1 pl-6', block.ordered ? 'list-decimal' : 'list-disc')} start={block.ordered ? block.start : undefined}>
        {#each block.items as item, j (j)}
          <li>
            {#if item.checked !== null}<input type="checkbox" checked={item.checked} disabled aria-label={item.checked ? 'Done' : 'Not done'} class="mr-1.5 align-middle" />{/if}
            {@render blocks(item.children)}
          </li>
        {/each}
      </svelte:element>
    {:else if block.type === 'quote'}<blockquote class="border-l-2 border-border pl-3 text-muted-foreground">{@render blocks(block.children)}</blockquote>
    {:else if block.type === 'table'}
      <div class="overflow-x-auto"><table class="w-full border-collapse text-left text-sm">
        <thead><tr>{#each block.header as cell, j (j)}<th class="border-b border-border px-2 py-1 font-semibold">{@render inline(cell)}</th>{/each}</tr></thead>
        <tbody>{#each block.rows as row, r (r)}<tr>{#each row as cell, j (j)}<td class="border-b border-border px-2 py-1">{@render inline(cell)}</td>{/each}</tr>{/each}</tbody>
      </table></div>
    {:else}<hr class="border-border" />{/if}
  {/each}
{/snippet}

<div role="region" aria-label={label} class={cn('space-y-3 text-sm leading-6 break-words', className)}>
  {#if doc.blocks.length === 0}
    <p class="text-muted-foreground">{emptyText}</p>
  {:else}
    {@render blocks(doc.blocks)}
  {/if}
</div>
