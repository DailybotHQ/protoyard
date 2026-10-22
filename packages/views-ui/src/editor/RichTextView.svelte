<script lang="ts">
import { cn } from '@protoyard/ui';
import {
  type EditorBlock,
  type EditorDocument,
  type EditorInline,
  parseEditorDocument,
  safeHref,
} from '@protoyard/views/editor';

/**
 * RichTextView — read-only renderer for the safe editor document model.
 * Accepts Markdown source or a validated EditorDocument. Renders Svelte
 * elements and text only — never `{@html}`. Unsafe link schemes become plain
 * text. Does not write database tables.
 */
interface Props {
  /** Markdown source, or a parsed EditorDocument. */
  value: string | EditorDocument;
  /** Accessible name of the region. */
  label?: string;
  emptyText?: string;
  /** Host may intercept safe links (return true to prevent navigation). */
  onLinkClick?: (href: string) => boolean;
  /** Called when a mention chip is activated. */
  onMentionClick?: (mention: { id: string; label: string }) => void;
  class?: string;
}

let {
  value,
  label = 'Rich text',
  emptyText = 'Nothing to show yet.',
  onLinkClick,
  onMentionClick,
  class: className,
}: Props = $props();

const doc = $derived.by((): EditorDocument => {
  if (typeof value === 'string') {
    try {
      return parseEditorDocument(value);
    } catch {
      return { version: 1, blocks: [] };
    }
  }
  return value;
});

const external = (href: string) => /^https?:/i.test(href);
</script>

{#snippet marks(text: string, list: readonly ('bold' | 'italic' | 'strike')[])}
  {@const [mark, ...rest] = list}
  {#if mark === 'bold'}<strong>{@render marks(text, rest)}</strong>
  {:else if mark === 'italic'}<em>{@render marks(text, rest)}</em>
  {:else if mark === 'strike'}<s>{@render marks(text, rest)}</s>
  {:else}{text}{/if}
{/snippet}

{#snippet inline(nodes: readonly EditorInline[])}
  {#each nodes as node, i (i)}
    {#if node.type === 'text'}
      {@render marks(node.text, node.marks)}
    {:else if node.type === 'code'}
      <code class="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]">{node.text}</code>
    {:else if node.type === 'mention'}
      {#if onMentionClick}
        <button
          type="button"
          class="rounded-md bg-muted px-1.5 py-0.5 text-sm font-medium text-foreground hover:bg-muted/80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          onclick={() => onMentionClick({ id: node.id, label: node.label })}
        >
          @{node.label}
        </button>
      {:else}
        <span class="rounded-md bg-muted px-1.5 py-0.5 text-sm font-medium">@{node.label}</span>
      {/if}
    {:else if node.type === 'link'}
      {@const href = safeHref(node.href)}
      {#if href}
        <a
          {href}
          class="text-primary underline underline-offset-4"
          target={external(href) ? '_blank' : undefined}
          rel={external(href) ? 'noreferrer noopener' : undefined}
          onclick={(event) => {
            if (onLinkClick?.(href)) event.preventDefault();
          }}>{@render inline(node.children)}</a
        >
      {:else}
        {@render inline(node.children)}
      {/if}
    {/if}
  {/each}
{/snippet}

{#snippet blocks(list: readonly EditorBlock[])}
  {#each list as block, i (i)}
    {#if block.type === 'paragraph'}
      <p class="my-1">{@render inline(block.children)}</p>
    {:else if block.type === 'heading'}
      <svelte:element
        this={`h${Math.min(6, block.level + 1)}`}
        class="my-1 font-semibold"
      >{@render inline(block.children)}</svelte:element>
    {:else if block.type === 'quote'}
      <blockquote class="my-1 border-l-2 border-border pl-3 text-muted-foreground">
        {@render inline(block.children)}
      </blockquote>
    {:else if block.type === 'codeBlock'}
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <pre
        tabindex="0"
        aria-label={block.language ? `Code block (${block.language})` : 'Code block'}
        class="my-1 overflow-x-auto rounded-md border border-border bg-muted/60 p-3 font-mono text-xs focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
      ><code>{block.text}</code></pre>
    {:else if block.type === 'list'}
      <svelte:element
        this={block.ordered ? 'ol' : 'ul'}
        class={cn('my-1 space-y-1 pl-6', block.ordered ? 'list-decimal' : 'list-disc')}
        start={block.ordered ? block.start : undefined}
      >
        {#each block.items as item, j (j)}
          <li>
            {#if item.checked !== null}
              <input
                type="checkbox"
                checked={item.checked}
                disabled
                aria-label={item.checked ? 'Done' : 'Not done'}
                class="mr-1.5 align-middle"
              />
            {/if}
            {@render inline(item.children)}
          </li>
        {/each}
      </svelte:element>
    {/if}
  {/each}
{/snippet}

<div
  role="region"
  aria-label={label}
  class={cn('space-y-1 text-sm leading-6 break-words text-foreground', className)}
>
  {#if doc.blocks.length === 0}
    <p class="text-muted-foreground">{emptyText}</p>
  {:else}
    {@render blocks(doc.blocks)}
  {/if}
</div>
