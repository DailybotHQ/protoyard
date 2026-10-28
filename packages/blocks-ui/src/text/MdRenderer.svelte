<script lang="ts">
import {
  type MdBlock,
  type MdInline,
  parseMarkdown,
  safeHref,
  safeImageSrc,
} from '@protoyard/ai/markdown';
import { classifyMediaSource } from '@protoyard/blocks';
import { cn } from '@protoyard/ui';
import { Checkbox } from 'texuli/choice';

let { source, class: className }: { source: string; class?: string } = $props();
const document = $derived(parseMarkdown(source));
const external = (href: string) => /^https?:/i.test(href);
/**
 * Markdown images follow the block media policy, not just the chat-safe one:
 * a relative path with an image extension and no `..`, so author Markdown
 * cannot make viewers request arbitrary same-origin URLs (`/api/…`).
 */
const imageSrc = (raw: string | null): string | null => {
  const src = raw ? safeImageSrc(raw) : null;
  if (!src) return null;
  const media = classifyMediaSource(src, 'image');
  return media.ok && media.kind === 'relative' ? src : null;
};
</script>

{#snippet inline(nodes: MdInline[])}
  {#each nodes as node, i (i)}
    {#if node.type === 'text'}{node.text}
    {:else if node.type === 'break'}<br />
    {:else if node.type === 'code'}<code class="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]">{node.text}</code>
    {:else if node.type === 'link'}
      {@const href = safeHref(node.href)}
      {#if href}<a {href} class="text-primary underline underline-offset-4" target={external(href) ? '_blank' : undefined} rel={external(href) ? 'noreferrer noopener' : undefined}>{@render inline(node.children)}</a>
      {:else}{@render inline(node.children)}{/if}
    {:else if node.type === 'image'}
      {@const src = imageSrc(node.src)}
      {#if src}<img {src} alt={node.alt} loading="lazy" decoding="async" referrerpolicy="no-referrer" class="my-2 max-w-full rounded-md border border-border" />
      {:else}<span class="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">Image: {node.alt}</span>{/if}
    {:else if node.type === 'attachment'}<span class="rounded border border-border bg-muted px-1.5 py-0.5 text-xs">{node.label}</span>
    {:else if node.type === 'citation'}<sup>[{node.index}]</sup>
    {:else}<svelte:element this={node.type === 'strong' ? 'strong' : node.type === 'em' ? 'em' : 'del'}>{@render inline(node.children)}</svelte:element>
    {/if}
  {/each}
{/snippet}

{#snippet blocks(items: MdBlock[])}
  {#each items as block, i (i)}
    {#if block.type === 'paragraph'}<p>{@render inline(block.children)}</p>
    {:else if block.type === 'heading'}<svelte:element this={`h${block.level}`} class="font-semibold">{@render inline(block.children)}</svelte:element>
    {:else if block.type === 'code'}
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -- scrollable code fences need keyboard access. -->
      <pre tabindex="0" aria-label="Code block" class="overflow-x-auto rounded-md border border-border bg-muted/60 p-3 text-xs"><code>{block.text}</code></pre>
    {:else if block.type === 'list'}
      <svelte:element this={block.ordered ? 'ol' : 'ul'} class={cn('space-y-1 pl-6', block.ordered ? 'list-decimal' : 'list-disc')} start={block.ordered ? block.start : undefined}>
        {#each block.items as item, j (j)}<li>{#if item.checked !== null}<Checkbox checked={item.checked} disabled aria-label={item.checked ? 'Done' : 'Not done'} class="mr-1.5 align-middle" />{/if}{@render blocks(item.children)}</li>{/each}
      </svelte:element>
    {:else if block.type === 'quote'}<blockquote class="border-l-2 border-border pl-3 text-muted-foreground">{@render blocks(block.children)}</blockquote>
    {:else if block.type === 'table'}
      <div class="overflow-x-auto"><table class="w-full border-collapse text-left text-sm"><thead><tr>{#each block.header as cell, j (j)}<th class="border-b border-border px-2 py-1 font-semibold">{@render inline(cell)}</th>{/each}</tr></thead><tbody>{#each block.rows as row, r (r)}<tr>{#each row as cell, j (j)}<td class="border-b border-border px-2 py-1">{@render inline(cell)}</td>{/each}</tr>{/each}</tbody></table></div>
    {:else}<hr class="border-border" />
    {/if}
  {/each}
{/snippet}

<div class={cn('space-y-3 break-words text-sm leading-6', className)}>{@render blocks(document.blocks)}</div>
