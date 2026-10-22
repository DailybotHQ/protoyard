<script lang="ts">
import type { TreeBlock } from '@protoyard/blocks';
import { layoutTree } from '@protoyard/blocks/diagram';
import { DIAGRAM_PAD, toneBorder } from './tones.ts';

/**
 * A tree. `file-tree` is a nested list (folders hold children). `org` is
 * drawn from `layoutTree` with elbow connectors; a nested list read by
 * assistive tech is its text alternative.
 */
let { block }: { block: TreeBlock } = $props();

const layout = $derived(layoutTree(block));
const byId = $derived(new Map(block.nodes.map((node) => [node.id, node])));
const positions = $derived(new Map(layout.positions.map((p) => [p.id, p])));
const children = $derived.by(() => {
  const map = new Map<string | null, string[]>();
  for (const node of block.nodes)
    map.set(node.parentId, [...(map.get(node.parentId) ?? []), node.id]);
  return map;
});
const roots = $derived(children.get(null) ?? []);
const summary = $derived(
  `${block.style === 'org' ? 'Organization chart' : 'File tree'} with ${block.nodes.length} ${block.nodes.length === 1 ? 'item' : 'items'}`
);

function elbow(from: string, to: string): string {
  const a = positions.get(from);
  const b = positions.get(to);
  if (!a || !b) return '';
  const mid = a.y + a.height + (b.y - a.y - a.height) / 2;
  return `M ${a.x + a.width / 2} ${a.y + a.height} V ${mid} H ${b.x + b.width / 2} V ${b.y}`;
}
</script>

{#snippet branch(id: string, visual: boolean)}
  {@const node = byId.get(id)}
  {@const kids = children.get(id) ?? []}
  {#if node}
    <li>
      {#if visual}
        <span class="inline-flex items-center gap-1.5 py-0.5">
          <!-- Inline strokes keep the diagram chunk free of the icon library (budget). -->
          <svg class={['size-4 shrink-0', kids.length > 0 ? 'text-primary' : 'text-muted-foreground']} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
            {#if kids.length > 0}
              <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
            {:else}
              <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /><path d="M14 2v4a2 2 0 0 0 2 2h4M16 13H8m8 4H8m2-8H8" />
            {/if}
          </svg>
          <span class={kids.length > 0 ? 'font-medium' : ''}>{node.label}</span>
          {#if kids.length > 0}<span class="sr-only">(folder, {kids.length} {kids.length === 1 ? 'item' : 'items'})</span>{/if}
        </span>
      {:else}
        {node.label}
      {/if}
      {#if kids.length > 0}
        <ul class={visual ? 'ml-2 border-l border-border pl-4' : ''}>
          {#each kids as kid (kid)}{@render branch(kid, visual)}{/each}
        </ul>
      {/if}
    </li>
  {/if}
{/snippet}

<figure class="grid gap-2" data-py-diagram="tree" data-style={block.style}>
  {#if block.style === 'file-tree'}
    <div class="overflow-x-auto rounded-lg border border-border bg-surface p-3 font-mono text-sm text-surface-foreground">
      <ul aria-label={summary}>
        {#each roots as root (root)}{@render branch(root, true)}{/each}
      </ul>
    </div>
  {:else}
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -- a wide chart scrolls; keyboard users must reach it (WCAG 2.1.1). -->
    <div
      class="overflow-x-auto rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
      role="region"
      aria-label={summary}
      tabindex="0"
    >
      <ul class="sr-only">
        {#each roots as root (root)}{@render branch(root, false)}{/each}
      </ul>
      <div
        class="relative"
        aria-hidden="true"
        style:width="{layout.width + DIAGRAM_PAD * 2}px"
        style:height="{layout.height + DIAGRAM_PAD * 2}px"
      >
        <svg
          class="absolute inset-0 overflow-visible text-border"
          width={layout.width + DIAGRAM_PAD * 2}
          height={layout.height + DIAGRAM_PAD * 2}
          viewBox="{-DIAGRAM_PAD} {-DIAGRAM_PAD} {layout.width + DIAGRAM_PAD * 2} {layout.height + DIAGRAM_PAD * 2}"
          focusable="false"
        >
          {#each layout.edges as edge (`${edge.from}-${edge.to}`)}
            <path d={elbow(edge.from, edge.to)} fill="none" stroke="currentColor" stroke-width="1.5" data-edge="parent" />
          {/each}
        </svg>
        {#each layout.positions as node (node.id)}
          <div
            class={['absolute flex items-center justify-center rounded-lg border border-t-4 bg-surface px-3 text-center text-sm text-surface-foreground shadow-soft', toneBorder(node.tone)]}
            style:left="{node.x + DIAGRAM_PAD}px"
            style:top="{node.y + DIAGRAM_PAD}px"
            style:width="{node.width}px"
            style:height="{node.height}px"
            title={node.label}
            data-node={node.id}
          >
            <span class="line-clamp-2">{node.label}</span>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</figure>
