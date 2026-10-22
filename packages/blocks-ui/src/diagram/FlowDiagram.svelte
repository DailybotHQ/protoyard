<script lang="ts">
import type { FlowBlock } from '@protoyard/blocks';
import { layoutFlow } from '@protoyard/blocks/diagram';
import { DIAGRAM_PAD, toneBorder } from './tones.ts';

/**
 * A flow: steps left to right from `layoutFlow`, joined by arrows, with an
 * optional loop back to the start. The ordered list read by assistive tech
 * is the text alternative; the drawing is hidden from it.
 */
let { block }: { block: FlowBlock } = $props();

const uid = $props.id();
const arrow = `flow-arrow-${uid}`;
const layout = $derived(layoutFlow(block));
const byId = $derived(new Map(layout.positions.map((p) => [p.id, p])));
const summary = $derived(
  `Flow with ${block.nodes.length} ${block.nodes.length === 1 ? 'step' : 'steps'}${block.loopBack && block.nodes.length > 1 ? ', repeating from the last step to the first' : ''}`
);

function edgePath(from: string, to: string, kind: string): string {
  const a = byId.get(from);
  const b = byId.get(to);
  if (!a || !b) return '';
  if (kind === 'loop-back') {
    const y = a.y + a.height + 24;
    return `M ${a.x + a.width / 2} ${a.y + a.height} V ${y} H ${b.x + b.width / 2} V ${b.y + b.height + 6}`;
  }
  const y = a.y + a.height / 2;
  return `M ${a.x + a.width} ${y} H ${b.x - 6}`;
}
</script>

<figure class="grid gap-2" data-py-diagram="flow">
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -- a wide flow scrolls; keyboard users must reach it (WCAG 2.1.1). -->
  <div
    class="overflow-x-auto rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
    role="region"
    aria-label={summary}
    tabindex="0"
  >
    <ol class="sr-only">
      {#each block.nodes as node, index (node.id)}
        <li>Step {index + 1} of {block.nodes.length}: {node.label}</li>
      {/each}
      {#if block.loopBack && block.nodes.length > 1}
        <li>Then back to step 1: {block.nodes[0]?.label}</li>
      {/if}
    </ol>
    <div
      class="relative"
      aria-hidden="true"
      style:width="{layout.width + DIAGRAM_PAD * 2}px"
      style:height="{layout.height + DIAGRAM_PAD * 2}px"
    >
      <svg
        class="absolute inset-0 overflow-visible text-muted-foreground"
        width={layout.width + DIAGRAM_PAD * 2}
        height={layout.height + DIAGRAM_PAD * 2}
        viewBox="{-DIAGRAM_PAD} {-DIAGRAM_PAD} {layout.width + DIAGRAM_PAD * 2} {layout.height + DIAGRAM_PAD * 2}"
        focusable="false"
      >
        <defs>
          <marker id={arrow} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
          </marker>
        </defs>
        {#each layout.edges as edge (`${edge.from}-${edge.to}-${edge.kind}`)}
          <path
            d={edgePath(edge.from, edge.to, edge.kind)}
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-dasharray={edge.kind === 'loop-back' ? '4 4' : undefined}
            marker-end="url(#{arrow})"
            data-edge={edge.kind}
          />
        {/each}
      </svg>
      {#each layout.positions as node, index (node.id)}
        <div
          class={['absolute flex items-center gap-2 rounded-lg border border-l-4 bg-surface px-3 text-sm text-surface-foreground shadow-soft', toneBorder(node.tone)]}
          style:left="{node.x + DIAGRAM_PAD}px"
          style:top="{node.y + DIAGRAM_PAD}px"
          style:width="{node.width}px"
          style:height="{node.height}px"
          title={node.label}
          data-node={node.id}
        >
          <span class="shrink-0 font-mono text-xs text-muted-foreground">{index + 1}</span>
          <span class="line-clamp-2">{node.label}</span>
        </div>
      {/each}
    </div>
  </div>
</figure>
