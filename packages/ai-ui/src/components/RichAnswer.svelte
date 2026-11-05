<script lang="ts">
import { type MdBlock, type MdInline, parseMarkdown } from '@protoyard/ai';
import { Badge } from 'texuli/badge';
import { useMessages } from 'texuli/i18n';
import { Code } from 'texuli/kbd-code';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from 'texuli/table';

interface Props {
  content: string;
  /** Default: `protoyard.ai.rich-answer.label` ("Assistant response"). */
  label?: string;
}

let { content, label: labelProp }: Props = $props();
// Labels resolve through Texuli's dictionary (mountPrototype({ i18n })).
const messages = useMessages();
const R = 'protoyard.ai.rich-answer';
const label = $derived(labelProp ?? messages(`${R}.label`, 'Assistant response'));
// ```chart fences become chart blocks; their code (charts kit + zod) loads only when one appears.
const document = $derived(parseMarkdown(content, { charts: true }));

function sourceFor(id: string) {
  return document.sources.find((source) => source.id === id);
}
</script>

<div class="ai-rich-answer space-y-3 text-sm leading-7 text-foreground" aria-label={label}>
  {#snippet renderInline(nodes: MdInline[])}
    {#each nodes as node, index (`${node.type}-${index}`)}
      {#if node.type === 'text'}
        {node.text}
      {:else if node.type === 'break'}
        <br />
      {:else if node.type === 'code'}
        <Code value={node.text} />
      {:else if node.type === 'link'}
        <a class="text-primary underline decoration-primary/40 underline-offset-4 hover:decoration-primary" href={node.href} target={node.href.startsWith('http') ? '_blank' : undefined} rel={node.href.startsWith('http') ? 'noreferrer noopener' : undefined}>
          {@render renderInline(node.children)}
        </a>
      {:else if node.type === 'image'}
        {#if node.src}
          <img class="my-2 max-h-80 max-w-full rounded-lg border border-border object-contain" src={node.src} alt={node.alt} loading="lazy" referrerpolicy="no-referrer" />
        {:else}
          <span class="rounded bg-muted px-2 py-1 text-xs text-muted-foreground">{messages(`${R}.image`, 'Image: {alt}', { alt: node.alt })}</span>
        {/if}
      {:else if node.type === 'attachment'}
        <Badge variant="outline" label={node.label} />
      {:else if node.type === 'citation'}
        {@const source = sourceFor(node.id)}
        {#if source?.href}
          <a class="rounded-full bg-muted px-1.5 text-xs text-primary" href={source.href} target="_blank" rel="noreferrer noopener" aria-label={messages(`${R}.source-titled`, 'Source {index}: {title}', { index: String(node.index), title: source.title })}>{node.index}</a>
        {:else}
          <span class="rounded-full bg-muted px-1.5 text-xs" aria-label={messages(`${R}.source`, 'Source {index}', { index: String(node.index) })}>{node.index}</span>
        {/if}
      {:else}
        <svelte:element this={node.type === 'strong' ? 'strong' : node.type === 'em' ? 'em' : 'del'}>
          {@render renderInline(node.children)}
        </svelte:element>
      {/if}
    {/each}
  {/snippet}

  {#snippet renderBlocks(blocks: MdBlock[])}
    {#each blocks as block, index (`${block.type}-${index}`)}
      {#if block.type === 'paragraph'}
        <p>{@render renderInline(block.children)}</p>
      {:else if block.type === 'heading'}
        <svelte:element this={`h${block.level}`} class="font-semibold leading-tight tracking-tight">{@render renderInline(block.children)}</svelte:element>
      {:else if block.type === 'code'}
        <div class="overflow-hidden rounded-lg border border-border bg-muted/60">
          <div class="flex items-center justify-between border-b border-border px-3 py-1.5 text-xs text-muted-foreground">
            <span>{block.lang || messages(`${R}.code`, 'code')}</span>
            {#if !block.closed}<span role="status">{messages(`${R}.streaming`, 'Streaming')}</span>{/if}
          </div>
          <!-- The block code scrolls, so it takes focus and a name (WCAG 2.1.1 / axe scrollable-region-focusable). -->
          <Code
            variant="block"
            value={block.text}
            language={block.lang || undefined}
            role="region"
            tabindex={0}
            aria-label={messages(`${R}.code-label`, '{lang} code', { lang: block.lang || messages(`${R}.code`, 'code') })}
            class="overflow-x-auto rounded-none border-0 p-3 text-xs leading-5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
          />
        </div>
      {:else if block.type === 'chart'}
        {#snippet chartStatus(text: string)}<p role="status" class="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">{text}</p>{/snippet}
        {#if !block.closed}
          {@render chartStatus(messages(`${R}.chart-preparing`, 'Preparing chart…'))}
        {:else}
          {#await import('./ChartAnswer.svelte')}
            {@render chartStatus(messages(`${R}.chart-loading`, 'Loading chart…'))}
          {:then { default: ChartAnswer }}
            <ChartAnswer text={block.text} />
          {:catch}
            {@render chartStatus(messages(`${R}.chart-failed`, 'The chart did not load.'))}
          {/await}
        {/if}
      {:else if block.type === 'list'}
        <svelte:element this={block.ordered ? 'ol' : 'ul'} class="space-y-1 pl-6 marker:text-muted-foreground" start={block.ordered ? block.start : undefined}>
          {#each block.items as item, itemIndex (`${index}-${itemIndex}`)}
            <li>
              {#if item.checked !== null}<span class="mr-2" aria-label={item.checked ? messages(`${R}.complete`, 'Complete') : messages(`${R}.incomplete`, 'Incomplete')}>{item.checked ? '☑' : '☐'}</span>{/if}
              {@render renderBlocks(item.children)}
            </li>
          {/each}
        </svelte:element>
      {:else if block.type === 'quote'}
        <blockquote class="border-l-2 border-primary/40 pl-4 text-muted-foreground">{@render renderBlocks(block.children)}</blockquote>
      {:else if block.type === 'table'}
        <Table class="text-xs">
          <TableHeader>
            <TableRow>{#each block.header as cell, cellIndex (`h-${cellIndex}`)}<TableHead>{@render renderInline(cell)}</TableHead>{/each}</TableRow>
          </TableHeader>
          <TableBody>
            {#each block.rows as row, rowIndex (`r-${rowIndex}`)}<TableRow>{#each row as cell, cellIndex (`${rowIndex}-${cellIndex}`)}<TableCell>{@render renderInline(cell)}</TableCell>{/each}</TableRow>{/each}
          </TableBody>
        </Table>
      {:else}
        <hr class="border-border" />
      {/if}
    {/each}
  {/snippet}

  {@render renderBlocks(document.blocks)}
  {#if document.sources.length}
    <ol class="border-t border-border pt-2 text-xs leading-5 text-muted-foreground" aria-label={messages(`${R}.sources`, 'Sources')}>
      {#each document.sources as source (source.id)}
        <li value={source.index}>
          {#if source.href}<a class="underline underline-offset-2" href={source.href} target="_blank" rel="noreferrer noopener">{source.title}</a>{:else}{source.title}{/if}
        </li>
      {/each}
    </ol>
  {/if}
</div>
