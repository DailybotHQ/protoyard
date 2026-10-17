<script lang="ts">
import { type Inline, parseMarkdown } from '../lib/markdown.ts';

/** Renders the safe Markdown subset as real elements (no {@html}). */
let { text, knownHandles = [] }: { text: string; knownHandles?: readonly string[] } = $props();

const blocks = $derived(parseMarkdown(text));
</script>

{#snippet inline(nodes: Inline[])}
  {#each nodes as node, i (i)}
    {#if node.type === 'strong'}<strong class="font-semibold">{node.text}</strong>
    {:else if node.type === 'em'}<em>{node.text}</em>
    {:else if node.type === 'code'}<code class="rounded bg-background/60 px-1 py-0.5 font-mono text-[0.85em]">{node.text}</code>
    {:else if node.type === 'mention'}
      {#if knownHandles.includes(node.handle)}
        <span class="rounded bg-primary/15 px-1 font-medium text-primary">@{node.handle}</span>
      {:else}@{node.handle}{/if}
    {:else}{node.text}{/if}
  {/each}
{/snippet}

<div class="flex flex-col gap-2 break-words">
  {#each blocks as block, b (b)}
    {#if block.type === 'paragraph'}
      <p>
        {#each block.lines as line, l (l)}
          {#if l > 0}<br />{/if}{@render inline(line)}
        {/each}
      </p>
    {:else if block.type === 'list'}
      {#if block.ordered}
        <ol class="list-decimal space-y-0.5 pl-5">
          {#each block.items as item, i (i)}<li>{@render inline(item)}</li>{/each}
        </ol>
      {:else}
        <ul class="list-disc space-y-0.5 pl-5">
          {#each block.items as item, i (i)}<li>{@render inline(item)}</li>{/each}
        </ul>
      {/if}
    {:else}
      <div class="max-w-full overflow-x-auto">
        <table class="min-w-[16rem] border-collapse text-left text-[0.8125rem]">
          <thead>
            <tr>
              {#each block.header as cell, c (c)}
                <th scope="col" class="border-b border-border px-2 py-1 font-semibold">{@render inline(cell)}</th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each block.rows as row, r (r)}
              <tr>
                {#each row as cell, c (c)}
                  {#if c === 0}
                    <th scope="row" class="border-b border-border/60 px-2 py-1 font-medium">{@render inline(cell)}</th>
                  {:else}
                    <td class="border-b border-border/60 px-2 py-1">{@render inline(cell)}</td>
                  {/if}
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  {/each}
</div>
