<script lang="ts">
import type { HeadingBlock } from '@protoyard/blocks';
import { forEachBlock } from '@protoyard/blocks';
import { getBlockHost, setBlockHost } from '@protoyard/blocks-ui';
import { allocateHeadingId, buildDocToc, type DocDocument } from '@protoyard/pages';
import { LoadingState } from '@protoyard/ui';
import { onMount, untrack } from 'svelte';
import { BlockHost } from '../block-host/index.ts';
import { getFormServices } from '../form/context.ts';

/**
 * A focused reading layout for a continuous report. It uses one disclosure
 * for both the wide-screen TOC rail and the compact phone navigation.
 */
let {
  doc,
  brandName,
  showNav = true,
  class: className = '',
}: {
  doc: DocDocument;
  /** Optional accessible name for the TOC (defaults to the document title). */
  brandName?: string;
  /** Keep the document outline visible. Retained for existing DocHost callers. */
  showNav?: boolean;
  class?: string;
} = $props();

const parentHost = getBlockHost();
setBlockHost({
  ...parentHost,
  canvasMode: 'flow',
  density: 'comfortable',
  documentId: parentHost.documentId ?? untrack(() => doc.id),
});

// Set by DocApp from the kind runtime; without it a form keeps the block preview.
const formServices = getFormServices();

const titleBlock = $derived(
  doc.blocks[0]?.type === 'heading' && doc.blocks[0].level === 1
    ? (doc.blocks[0] as HeadingBlock)
    : undefined
);
const bodyBlocks = $derived(titleBlock ? doc.blocks.slice(1) : doc.blocks);
const tocItems = $derived(showNav ? buildDocToc(bodyBlocks) : []);
const title = $derived(doc.title.trim() || titleBlock?.text || 'Untitled document');
const eyebrow = $derived(titleBlock?.eyebrow);
const subtitle = $derived(titleBlock?.subtitle || doc.description);
const tocLabel = 'On this page';

let flowRoot = $state<HTMLElement | undefined>();
let tocRoot = $state<HTMLDetailsElement | undefined>();
let tocOpen = $state(false);
let activeId = $state('');

function expectedHeadings(blocks: DocDocument['blocks']): { id: string; label: string }[] {
  const used = new Set<string>();
  const out: { id: string; label: string }[] = [];
  forEachBlock(blocks, (block) => {
    if (block.type !== 'heading') return;
    const label = block.text.replace(/\s+/g, ' ').trim();
    if (!label || (block.level ?? 2) < 2) return;
    out.push({ id: allocateHeadingId(label, used, block.id), label });
  });
  return out;
}

onMount(() => {
  if (typeof window.matchMedia !== 'function') return;
  const media = window.matchMedia('(min-width: 72rem)');
  const syncDisclosure = (): void => {
    tocOpen = media.matches;
  };
  syncDisclosure();
  media.addEventListener('change', syncDisclosure);
  return () => media.removeEventListener('change', syncDisclosure);
});

/**
 * Only heading blocks carry TOC ids (`data-py-block-heading`, set by
 * blocks-ui): headings inside other blocks (a callout's title, markdown) are
 * not TOC entries, and counting them would shift every id after them.
 */
const HEADING_BLOCKS = '[data-py-block-heading]';

$effect(() => {
  const root = flowRoot;
  const blocks = bodyBlocks;
  if (!root) return;

  const syncActiveHeading = (): void => {
    const headings = Array.from(root.querySelectorAll<HTMLElement>(HEADING_BLOCKS));
    const activationLine = window.innerHeight * 0.3;
    let candidate = headings[0]?.id ?? '';
    for (const heading of headings) {
      const rect = heading.getBoundingClientRect();
      if (rect.height === 0) continue;
      if (rect.top > activationLine) break;
      candidate = heading.id;
    }
    if (candidate) activeId = candidate;
  };

  const applyIds = (): void => {
    const expected = expectedHeadings(blocks);
    const nodes = Array.from(root.querySelectorAll<HTMLElement>(HEADING_BLOCKS));
    const count = Math.min(expected.length, nodes.length);
    for (let i = 0; i < count; i += 1) {
      const node = nodes[i];
      const item = expected[i];
      if (!node || !item) continue;
      if (node.id !== item.id) node.id = item.id;
    }

    syncActiveHeading();
  };

  applyIds();
  const mutation = new MutationObserver(applyIds);
  mutation.observe(root, { childList: true, subtree: true, characterData: true });
  window.addEventListener('scroll', syncActiveHeading, { passive: true });
  document.addEventListener('scroll', syncActiveHeading, true);
  window.addEventListener('resize', syncActiveHeading);
  window.addEventListener('hashchange', syncActiveHeading);
  return () => {
    mutation.disconnect();
    window.removeEventListener('scroll', syncActiveHeading);
    document.removeEventListener('scroll', syncActiveHeading, true);
    window.removeEventListener('resize', syncActiveHeading);
    window.removeEventListener('hashchange', syncActiveHeading);
  };
});

function onTocClick(id: string): void {
  activeId = id;
  if (
    !tocRoot ||
    typeof window.matchMedia !== 'function' ||
    !window.matchMedia('(min-width: 72rem)').matches
  ) {
    tocOpen = false;
  }
}
</script>

<div
  class={className}
  data-py-doc-host
  data-doc-id={doc.id}
  data-style={doc.style}
  data-toc-sticky={doc.toc?.sticky === false ? 'false' : 'true'}
  data-print-breaks={doc.print?.pageBreaks ?? 'none'}
>
  <div class="doc-reading" data-py-doc-reading>
    {#if tocItems.length > 0}
      <details
        bind:this={tocRoot}
        bind:open={tocOpen}
        class="doc-reading__toc"
        data-py-doc-toc
        data-brand-name={brandName?.trim() || undefined}
      >
        <summary class="doc-reading__toc-summary">{tocLabel}</summary>
        <nav aria-label={tocLabel}>
          <ol class="doc-reading__toc-list">
            {#each tocItems as item (item.id)}
              <li data-level={item.level}>
                <a
                  href={`#${item.id}`}
                  aria-current={activeId === item.id ? 'location' : undefined}
                  data-py-doc-toc-link={item.id}
                  onclick={() => onTocClick(item.id)}
                >
                  {item.label}
                </a>
              </li>
            {/each}
          </ol>
        </nav>
      </details>
    {/if}

    <main class="doc-reading__article" aria-label="Document content">
      <header class="doc-reading__header" data-py-doc-header>
        {#if eyebrow}
          <p class="doc-reading__eyebrow" data-py-doc-eyebrow>{eyebrow}</p>
        {/if}
        <h1 data-py-doc-title>{title}</h1>
        {#if subtitle}
          <p class="doc-reading__subtitle" data-py-doc-subtitle>{subtitle}</p>
        {/if}
      </header>

      <div bind:this={flowRoot} class="doc-reading__flow" data-py-doc-flow>
        {#each bodyBlocks as block, index (block.id ?? `${block.type}-${index}`)}
          <div class="doc-reading__block" data-py-doc-block={block.type} data-block-index={index}>
            {#if block.type === 'form' && formServices}
              <div class="mx-auto w-full max-w-xl" data-py-doc-block-form>
                {#await import('../form/FormBlock.svelte')}
                  <LoadingState label="Loading the form" class="py-8" />
                {:then { default: FormBlock }}
                  <FormBlock form={block} services={formServices} />
                {:catch}
                  <BlockHost {block} />
                {/await}
              </div>
            {:else}
              <BlockHost {block} />
            {/if}
          </div>
        {/each}
      </div>
    </main>
  </div>
</div>

<style>
  .doc-reading {
    color: var(--tx-foreground);
    display: grid;
    font-family: var(--tx-font-sans, system-ui, sans-serif);
    grid-template-columns: minmax(0, 1fr);
    gap: 2rem;
    margin-inline: auto;
    max-width: 76rem;
    min-width: 0;
    padding: clamp(1.25rem, 4vw, 3.5rem) clamp(1rem, 4vw, 2rem);
  }

  .doc-reading__article {
    margin-inline: auto;
    max-width: 72ch;
    min-width: 0;
    width: 100%;
  }

  .doc-reading__header {
    border-bottom: 1px solid var(--tx-border);
    margin-bottom: clamp(2rem, 5vw, 3.5rem);
    padding-bottom: clamp(1.5rem, 4vw, 2.5rem);
  }

  .doc-reading__eyebrow {
    color: var(--tx-primary);
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    margin: 0 0 0.9rem;
    text-transform: uppercase;
  }

  .doc-reading__header h1 {
    color: var(--tx-foreground);
    font-family: var(--tx-font-heading, var(--tx-font-sans, system-ui, sans-serif));
    font-size: clamp(2.25rem, 5vw, 4rem);
    font-weight: 700;
    letter-spacing: -0.04em;
    line-height: 1.08;
    margin: 0;
    max-width: 18ch;
    text-wrap: balance;
  }

  .doc-reading__subtitle {
    color: var(--tx-muted-foreground);
    font-size: clamp(1rem, 1.5vw, 1.2rem);
    line-height: 1.65;
    margin: 1rem 0 0;
    max-width: 58ch;
  }

  .doc-reading__flow {
    display: grid;
    gap: clamp(1.75rem, 4vw, 3rem);
    line-height: 1.75;
    min-width: 0;
  }

  .doc-reading__block {
    min-width: 0;
    scroll-margin-top: 1.5rem;
  }

  .doc-reading__flow :global([data-py-block]),
  .doc-reading__flow :global([data-block-type]) {
    box-sizing: border-box;
    max-width: 100%;
    min-width: 0;
  }

  .doc-reading__block[data-py-doc-block='heading'] :global(h2),
  .doc-reading__block[data-py-doc-block='heading'] :global(h3),
  .doc-reading__block[data-py-doc-block='heading'] :global(h4) {
    color: var(--tx-foreground);
    font-family: var(--tx-font-heading, var(--tx-font-sans, sans-serif));
    font-weight: 650;
    letter-spacing: -0.025em;
    line-height: 1.2;
    margin: 0;
    text-wrap: balance;
  }

  .doc-reading__block[data-py-doc-block='heading'] :global(h2) {
    font-size: clamp(1.35rem, 2.5vw, 1.75rem);
  }

  .doc-reading__block[data-py-doc-block='heading'] :global(h3) {
    font-size: 1.2rem;
  }

  .doc-reading__block[data-py-doc-block='heading'] :global(h4) {
    font-size: 1.05rem;
  }

  .doc-reading__flow :global([data-py-block='stat'] dl) {
    display: grid;
    gap: 0.75rem;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 11rem), 1fr));
  }

  .doc-reading__flow :global([data-py-block='stat'] dl > div) {
    background: var(--tx-surface, #fff);
    border: 1px solid var(--tx-border);
    border-radius: 0.75rem;
    padding: 1rem;
  }

  .doc-reading__flow :global([data-py-block='stat'] dt) {
    color: var(--tx-muted-foreground);
    font-size: 0.85rem;
  }

  .doc-reading__flow :global([data-py-block='stat'] dd) {
    color: var(--tx-foreground);
    font-size: clamp(1.5rem, 3vw, 2rem);
    font-variant-numeric: tabular-nums;
    font-weight: 650;
    margin: 0.35rem 0 0;
  }

  .doc-reading__block[data-py-doc-block='callout'] :global(aside) {
    background: color-mix(in srgb, var(--tx-primary) 5%, var(--tx-surface, #fff));
    border: 1px solid var(--tx-border);
    border-left: 3px solid var(--tx-primary);
    border-radius: 0.65rem;
    color: var(--tx-foreground);
    padding: 1rem 1.25rem;
  }

  .doc-reading__flow :global([data-py-block='chart'] svg) {
    display: block;
    height: auto;
    max-width: 100%;
  }

  .doc-reading__flow :global([data-py-block='table']) {
    border: 1px solid var(--tx-border);
    border-radius: 0.65rem;
    max-width: 100%;
    overflow-x: auto;
  }

  .doc-reading__flow :global([data-py-block='table'] table) {
    border-collapse: collapse;
    font-size: 0.9rem;
    min-width: 100%;
    text-align: left;
  }

  .doc-reading__flow :global([data-py-block='table'] th),
  .doc-reading__flow :global([data-py-block='table'] td) {
    border-bottom: 1px solid var(--tx-border);
    padding: 0.65rem 0.8rem;
  }

  .doc-reading__flow :global([data-py-block='table'] thead) {
    background: var(--tx-muted);
  }

  .doc-reading__flow :global([data-block-type='timeline'] ol) {
    border-left: 2px solid var(--tx-border);
    display: grid;
    gap: 1.4rem;
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .doc-reading__flow :global([data-py-timeline-event]) {
    column-gap: 0.75rem;
    display: grid;
    grid-template-columns: 20px minmax(0, 1fr);
    margin-left: -11px;
    row-gap: 0.25rem;
  }

  .doc-reading__flow :global([data-py-timeline-marker]) {
    align-items: center;
    background: var(--tx-primary);
    border: 2px solid var(--tx-background, #fff);
    border-radius: 50%;
    color: var(--tx-primary-foreground, #fff);
    display: grid;
    grid-column: 1;
    grid-row: span 3;
    height: 20px;
    justify-items: center;
    margin-top: 2px;
    place-items: center;
    width: 20px;
  }

  .doc-reading__flow :global([data-py-timeline-time]),
  .doc-reading__flow :global([data-py-timeline-event] > p:not([data-py-timeline-time])),
  .doc-reading__flow :global([data-py-timeline-event] > div) {
    grid-column: 2;
    margin: 0;
  }

  .doc-reading__toc {
    align-self: start;
    background: color-mix(in srgb, var(--tx-background) 96%, transparent);
    border: 1px solid var(--tx-border);
    border-radius: 0.8rem;
    color: var(--tx-muted-foreground);
    min-width: 0;
    padding: 0.9rem 1rem;
  }

  .doc-reading__toc-summary {
    color: var(--tx-foreground);
    cursor: pointer;
    font-size: 0.875rem;
    font-weight: 650;
  }

  .doc-reading__toc-list {
    display: grid;
    gap: 0.3rem;
    list-style: none;
    margin: 0.75rem 0 0;
    padding: 0;
  }

  .doc-reading__toc-list li[data-level='3'],
  .doc-reading__toc-list li[data-level='4'] {
    padding-left: 0.75rem;
  }

  .doc-reading__toc-list a {
    border-radius: 0.35rem;
    display: block;
    font-size: 0.8125rem;
    line-height: 1.45;
    padding: 0.35rem 0.45rem;
    text-decoration: none;
  }

  .doc-reading__toc-list a:hover,
  .doc-reading__toc-list a:focus-visible {
    background: var(--tx-muted);
    color: var(--tx-foreground);
    outline-color: var(--tx-ring);
  }

  .doc-reading__toc-list a[aria-current='location'] {
    background: color-mix(in srgb, var(--tx-primary) 10%, transparent);
    color: var(--tx-primary);
    font-weight: 650;
  }

  @media (min-width: 72rem) {
    .doc-reading {
      align-items: start;
      grid-template-columns: minmax(12rem, 15rem) minmax(0, 72ch);
      justify-content: center;
    }

    .doc-reading__toc {
      border: 0;
      border-left: 1px solid var(--tx-border);
      border-radius: 0;
      position: sticky;
      top: 1.5rem;
      padding: 0 0 0 1rem;
    }

    .doc-reading__toc-summary {
      display: none;
    }

    .doc-reading__toc:not([open]) nav {
      display: block;
    }
  }

  @media (prefers-reduced-motion: no-preference) {
    .doc-reading__toc-list a {
      transition: background-color 120ms ease, color 120ms ease;
    }
  }

  @media print {
    .doc-reading {
      display: block;
      max-width: none;
      padding: 0;
    }

    .doc-reading__toc {
      display: none !important;
    }

    .doc-reading__article {
      max-width: none;
    }
  }
</style>
