<script lang="ts">
import { forEachBlock } from '@protoyard/blocks';
import { setBlockHost } from '@protoyard/blocks-ui';
import { allocateHeadingId, buildDocToc, type DocDocument } from '@protoyard/pages';
import DocsLayout from '../../../ui/src/layouts/DocsLayout.svelte';
import { BlockHost } from '../block-host/index.ts';

/**
 * Continuous doc flow inside DocsLayout: optional left nav, BlockHost list,
 * sticky TOC (buildDocToc + live active heading via DocsLayout). Heading
 * blocks get ids that match the TOC. Root attribute: `data-py-doc-host`.
 */
let {
  doc,
  brandName,
  showNav = true,
  class: className = '',
}: {
  doc: DocDocument;
  /** Optional left-rail brand label (defaults to the doc title). */
  brandName?: string;
  /**
   * When true (default), show a left nav of level-2 TOC entries for deep links.
   * Set false for a content+TOC-only chrome.
   */
  showNav?: boolean;
  class?: string;
} = $props();

$effect(() => {
  setBlockHost({
    canvasMode: 'flow',
    density: 'comfortable',
    documentId: doc.id,
  });
});

const brandLabel = $derived(brandName?.trim() || doc.title);
const tocItems = $derived(buildDocToc(doc));
const navItems = $derived(tocItems.filter((item) => item.level === 2));

let flowRoot = $state<HTMLElement | undefined>();

/**
 * Heading blocks must expose the same ids `buildDocToc` assigned so TOC
 * links and DocsLayout's live observer stay aligned. Blocks-ui headings do
 * not always paint `id`; we stamp them after the family renderers mount.
 */
function expectedHeadings(
  blocks: DocDocument['blocks']
): { id: string; label: string; level: number }[] {
  const used = new Set<string>();
  const out: { id: string; label: string; level: number }[] = [];
  forEachBlock(blocks, (block) => {
    if (block.type !== 'heading') return;
    const label = block.text.replace(/\s+/g, ' ').trim();
    if (!label) return;
    const level = block.level ?? 2;
    const id = allocateHeadingId(label, used, block.id);
    out.push({ id, label, level });
  });
  return out;
}

$effect(() => {
  const root = flowRoot;
  const blocks = doc.blocks;
  if (!root || typeof MutationObserver === 'undefined') return;

  const applyIds = (): void => {
    const expected = expectedHeadings(blocks);
    const nodes = Array.from(root.querySelectorAll<HTMLElement>('h1, h2, h3, h4'));
    const count = Math.min(expected.length, nodes.length);
    for (let i = 0; i < count; i += 1) {
      const node = nodes[i];
      const item = expected[i];
      if (!node || !item) continue;
      if (node.id !== item.id) node.id = item.id;
    }
  };

  applyIds();
  const mutation = new MutationObserver(() => {
    applyIds();
  });
  mutation.observe(root, { childList: true, subtree: true, characterData: true });
  return () => mutation.disconnect();
});

function scrollToHash(hash: string): void {
  if (typeof document === 'undefined') return;
  const id = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!id) return;
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function onNavClick(event: MouseEvent, href: string): void {
  if (!href.startsWith('#')) return;
  event.preventDefault();
  if (typeof history !== 'undefined') {
    history.pushState(null, '', href);
  }
  scrollToHash(href);
}

$effect(() => {
  if (typeof window === 'undefined') return;
  const docId = doc.id;
  const blockCount = doc.blocks.length;
  const onHash = (): void => {
    scrollToHash(window.location.hash);
  };
  onHash();
  window.addEventListener('hashchange', onHash);
  return () => {
    window.removeEventListener('hashchange', onHash);
    void docId;
    void blockCount;
  };
});
</script>

<div
  class={className}
  data-py-doc-host
  data-doc-id={doc.id}
  data-style={doc.style}
  data-toc-sticky={doc.toc?.sticky === false ? 'false' : 'true'}
  data-print-breaks={doc.print?.pageBreaks ?? 'none'}
>
  <DocsLayout
    navigationLabel="Document sections"
    contentLabel="Document content"
    tocLabel="On this page"
  >
    {#snippet navigation()}
      {#if showNav}
        <div class="space-y-3" data-py-doc-nav>
          <p class="text-sm font-semibold tracking-tight text-foreground" data-py-doc-brand>
            {brandLabel}
          </p>
          {#if navItems.length > 0}
            <ul class="space-y-0.5" data-py-doc-nav-list>
              {#each navItems as item (item.id)}
                <li>
                  <a
                    href={`#${item.id}`}
                    class="block rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    data-py-doc-nav-link={item.id}
                    onclick={(event) => onNavClick(event, `#${item.id}`)}
                  >
                    {item.label}
                  </a>
                </li>
              {/each}
            </ul>
          {:else}
            <p class="text-xs text-muted-foreground">No section headings.</p>
          {/if}
        </div>
      {/if}
    {/snippet}

    <div bind:this={flowRoot} class="space-y-6" data-py-doc-flow>
      <header class="space-y-1 border-b border-border pb-4" data-py-doc-header>
        <h1 class="font-heading text-2xl font-semibold tracking-tight text-foreground">
          {doc.title}
        </h1>
        {#if doc.description}
          <p class="text-sm text-muted-foreground">{doc.description}</p>
        {/if}
      </header>

      {#each doc.blocks as block, index (block.id ?? `${block.type}-${index}`)}
        <div data-py-doc-block={block.type} data-block-index={index}>
          <BlockHost {block} />
        </div>
      {/each}
    </div>
  </DocsLayout>
</div>
