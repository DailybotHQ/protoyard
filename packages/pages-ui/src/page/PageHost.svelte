<script lang="ts">
import { getBlockHost, setBlockHost } from '@protoyard/blocks-ui';
import type { PageDocument, PageSection } from '@protoyard/pages';
import MarketingLayout from '@protoyard/ui/layouts/marketing';
import { untrack } from 'svelte';
import { BlockHost } from '../block-host/index.ts';

/**
 * Marketing landing renderer for a PageDocument. Single-scroll chrome via
 * MarketingLayout: brand, hash nav, hero, body sections, footer.
 */
let {
  page,
  brandName,
  class: className = '',
}: {
  page: PageDocument;
  /** Override the brand label (defaults to the page title). */
  brandName?: string;
  class?: string;
} = $props();

// Set during init (context cannot change later), merged over the parent host so
// a kind runtime's persistent block state and mountEmbed reach the blocks.
const parentHost = getBlockHost();
setBlockHost({
  ...parentHost,
  canvasMode: 'flow',
  density: 'comfortable',
  // Read once on purpose: the host context is fixed for this component's life.
  documentId: parentHost.documentId ?? untrack(() => page.id),
});

const brandLabel = $derived(brandName?.trim() || page.title);

function sectionAnchor(section: PageSection): string {
  return section.anchor ?? section.id;
}

function sectionsByRole(role: NonNullable<PageSection['role']>): PageSection[] {
  return page.sections.filter((section) => section.role === role);
}

const heroSections = $derived(sectionsByRole('hero'));
const footerSections = $derived(sectionsByRole('footer'));
const bodySections = $derived(
  page.sections.filter((section) => section.role !== 'hero' && section.role !== 'footer')
);

const navItems = $derived(
  page.nav && page.nav.length > 0
    ? page.nav
    : page.sections.map((section) => ({
        id: `nav-${section.id}`,
        label: section.title ?? section.id,
        href: `#${sectionAnchor(section)}`,
      }))
);

const brandHref = $derived(page.sections[0] ? `#${sectionAnchor(page.sections[0])}` : '#top');

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
  const pageId = page.id;
  const sectionCount = page.sections.length;
  const onHash = (): void => {
    scrollToHash(window.location.hash);
  };
  onHash();
  window.addEventListener('hashchange', onHash);
  return () => {
    window.removeEventListener('hashchange', onHash);
    void pageId;
    void sectionCount;
  };
});
</script>

<div class={className} data-py-page-host data-page-id={page.id} data-style={page.style}>
  <MarketingLayout>
    {#snippet brand()}
      <a
        href={brandHref}
        class="font-heading text-base font-semibold tracking-tight text-foreground"
        data-py-page-brand
      >
        {brandLabel}
      </a>
    {/snippet}

    {#snippet navigation()}
      <ul class="flex flex-wrap items-center gap-1 sm:gap-3" data-py-page-nav>
        {#each navItems as item (item.id)}
          <li>
            <a
              href={item.href}
              class="rounded-md px-2 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              data-py-page-nav-link={item.href}
              onclick={(event) => onNavClick(event, item.href)}
            >
              {item.label}
            </a>
          </li>
        {/each}
      </ul>
    {/snippet}

    {#snippet hero()}
      {#if heroSections.length > 0}
        {#each heroSections as section (section.id)}
          <section
            id={sectionAnchor(section)}
            class="scroll-mt-20"
            data-py-page-section={section.id}
            data-section-role="hero"
            aria-label={section.title ?? 'Introduction'}
          >
            <div class="grid gap-6">
              {#each section.blocks as block, index (`${section.id}-${index}`)}
                <BlockHost {block} />
              {/each}
            </div>
          </section>
        {/each}
      {/if}
    {/snippet}

    {#snippet sections()}
      {#each bodySections as section (section.id)}
        <section
          id={sectionAnchor(section)}
          class="scroll-mt-20 border-t border-border/60 py-12 sm:py-16"
          data-py-page-section={section.id}
          data-section-role={section.role ?? 'body'}
          aria-label={section.title ?? section.id}
        >
          <div class="grid gap-6">
            {#each section.blocks as block, index (`${section.id}-${index}`)}
              <BlockHost {block} />
            {/each}
          </div>
        </section>
      {/each}
    {/snippet}

    {#snippet footer()}
      {#if footerSections.length > 0}
        {#each footerSections as section (section.id)}
          <div
            id={sectionAnchor(section)}
            class="scroll-mt-20 grid gap-4"
            data-py-page-section={section.id}
            data-section-role="footer"
          >
            {#each section.blocks as block, index (`${section.id}-${index}`)}
              <BlockHost {block} />
            {/each}
          </div>
        {/each}
      {:else}
        <p class="text-sm text-muted-foreground" data-py-page-footer-fallback>
          {page.title}
          {#if page.description}
            <span class="mx-2 text-border">·</span>
            {page.description}
          {/if}
        </p>
      {/if}
    {/snippet}
  </MarketingLayout>
</div>
