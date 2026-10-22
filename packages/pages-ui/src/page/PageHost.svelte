<script lang="ts">
import { getBlockHost, setBlockHost } from '@protoyard/blocks-ui';
import type { PageDocument, PageSection } from '@protoyard/pages';
import MarketingLayout from '@protoyard/ui/layouts/marketing';
import { untrack } from 'svelte';
import { BlockHost } from '../block-host/index.ts';
import {
  isPricingSection,
  leadingHeading,
  pageNavItems,
  sectionAnchor,
  sectionDesigns,
  sectionLabel,
} from './design.ts';
import PageHero from './sections/PageHero.svelte';
import SectionBlocks from './sections/SectionBlocks.svelte';
import SectionHeader from './sections/SectionHeader.svelte';

/**
 * Marketing landing renderer for a PageDocument, on MarketingLayout: a sticky
 * header with the brand and section links (human labels, the section in view
 * highlighted, smooth scroll unless reduced motion is asked for), a hero at
 * the display scale, body sections on alternating theme backgrounds, a
 * primary-colored closing band and the footer. design.ts decides which layout
 * each section gets; blocks stay the content vocabulary.
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

interface DesignedSection {
  section: PageSection;
  anchor: string;
  label: string;
  /** Body sections alternate their background (every second one is tinted). */
  tinted: boolean;
  pricing: boolean;
  band: boolean;
}

const designs = $derived(sectionDesigns(page));
const designed = $derived.by(() => {
  // Bands sit in page order among the body sections.
  const out: Record<'hero' | 'main' | 'footer', DesignedSection[]> = {
    hero: [],
    main: [],
    footer: [],
  };
  let bodyCount = 0;
  page.sections.forEach((section, index) => {
    const design = designs[index] ?? 'body';
    const entry: DesignedSection = {
      section,
      anchor: sectionAnchor(section),
      label: sectionLabel(section) ?? section.id,
      tinted: design === 'body' && bodyCount % 2 === 1,
      pricing: isPricingSection(section),
      band: design === 'band',
    };
    if (design === 'body') bodyCount += 1;
    out[design === 'band' || design === 'body' ? 'main' : design].push(entry);
  });
  return out;
});

const navItems = $derived(pageNavItems(page));
const brandHref = $derived(page.sections[0] ? `#${sectionAnchor(page.sections[0])}` : '#top');

/** The nav href of the section in view, for `aria-current` and the highlight. */
let activeHref = $state<string | null>(null);

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}

function scrollToHash(hash: string): void {
  if (typeof document === 'undefined') return;
  const id = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!id) return;
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
}

function onNavClick(event: MouseEvent, href: string): void {
  if (!href.startsWith('#')) return;
  event.preventDefault();
  if (typeof history !== 'undefined') {
    history.pushState(null, '', href);
  }
  activeHref = href;
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

// The section crossing the upper part of the viewport is the active one.
$effect(() => {
  const hrefs = navItems.map((item) => item.href);
  if (typeof document === 'undefined' || typeof IntersectionObserver === 'undefined') return;
  const targets = hrefs
    .map((href) => document.getElementById(href.slice(1)))
    .filter((el): el is HTMLElement => el !== null);
  if (targets.length === 0) return;
  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      const first = visible[0];
      if (first) activeHref = `#${first.target.id}`;
    },
    { rootMargin: '-35% 0px -60% 0px' }
  );
  for (const target of targets) observer.observe(target);
  return () => observer.disconnect();
});
</script>

<div
  class="overflow-x-clip {className}"
  data-py-page-host
  data-page-id={page.id}
  data-style={page.style}
>
  <MarketingLayout>
    {#snippet brand()}
      <a
        href={brandHref}
        class="block max-w-[11rem] truncate font-heading text-base font-semibold tracking-tight text-foreground sm:max-w-xs"
        data-py-page-brand
      >
        {brandLabel}
      </a>
    {/snippet}

    {#snippet navigation()}
      <ul
        class="-mx-1 flex items-center gap-1 overflow-x-auto px-1 py-1 [scrollbar-width:none] md:justify-end"
        data-py-page-nav
      >
        {#each navItems as item (item.id)}
          {@const active = activeHref === item.href}
          <li class="shrink-0">
            <a
              href={item.href}
              class="block max-w-[14rem] truncate rounded-full px-3 py-1.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none {active
                ? 'bg-muted text-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'}"
              title={item.label}
              aria-current={active ? 'location' : undefined}
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
      {#each designed.hero as entry (entry.section.id)}
        {@const heading = leadingHeading(entry.section)}
        <section
          id={entry.anchor}
          class="relative isolate scroll-mt-24 sm:pt-4"
          data-py-page-section={entry.section.id}
          data-section-role="hero"
          aria-label={entry.section.title ?? heading?.text ?? 'Introduction'}
        >
          <div
            class="pointer-events-none absolute inset-x-0 -top-24 -z-10 h-[32rem] bg-[radial-gradient(55%_60%_at_50%_0%,color-mix(in_oklab,var(--color-primary)_16%,transparent),transparent)]"
            aria-hidden="true"
          ></div>
          <div class="grid gap-10">
            {#if heading}<PageHero {heading} />{/if}
            <SectionBlocks
              blocks={heading ? entry.section.blocks.slice(1) : entry.section.blocks}
              sectionId={entry.section.id}
              context="hero"
            />
          </div>
        </section>
      {/each}
    {/snippet}

    {#snippet sections()}
      {#each designed.main as entry (entry.section.id)}
        {@const heading = leadingHeading(entry.section)}
        {#if entry.band}
          <section
            id={entry.anchor}
            class="scroll-mt-24 py-16 sm:py-24"
            data-py-page-section={entry.section.id}
            data-section-role={entry.section.role ?? 'cta'}
            aria-label={entry.label}
          >
            <div
              class="relative isolate grid gap-8 overflow-hidden rounded-3xl bg-primary px-6 py-14 text-center text-primary-foreground shadow-lg sm:px-12 sm:py-20"
              data-py-page-band
            >
              <div
                class="pointer-events-none absolute -top-1/2 left-1/2 -z-10 size-[40rem] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--color-primary-foreground)_14%,transparent),transparent)]"
                aria-hidden="true"
              ></div>
              <SectionBlocks
                blocks={entry.section.blocks}
                sectionId={entry.section.id}
                context="band"
              />
            </div>
          </section>
        {:else}
        <section
          id={entry.anchor}
          class="relative isolate scroll-mt-24 {heading ? 'py-16 sm:py-24' : 'py-10 sm:py-14'} {entry.tinted
            ? "before:absolute before:inset-y-0 before:left-1/2 before:-z-10 before:w-screen before:-translate-x-1/2 before:bg-muted/50 before:content-['']"
            : ''}"
          data-py-page-section={entry.section.id}
          data-section-role={entry.section.role ?? 'body'}
          data-tinted={entry.tinted ? 'true' : undefined}
          aria-label={entry.label}
        >
          <div class="grid gap-12">
            {#if heading}<SectionHeader {heading} />{/if}
            <SectionBlocks
              blocks={heading ? entry.section.blocks.slice(1) : entry.section.blocks}
              sectionId={entry.section.id}
              pricing={entry.pricing}
            />
          </div>
        </section>
        {/if}
      {/each}
    {/snippet}

    {#snippet footer()}
      {#if designed.footer.length > 0}
        {#each designed.footer as entry (entry.section.id)}
          <div
            id={entry.anchor}
            class="scroll-mt-24 grid gap-4"
            data-py-page-section={entry.section.id}
            data-section-role="footer"
          >
            {#each entry.section.blocks as block, index (`${entry.section.id}-${index}`)}
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

<style>
  /* The landing header stays reachable while the page scrolls. */
  :global([data-py-page-host] > [data-py-marketing-layout] > header) {
    position: sticky;
    top: 0;
    z-index: 30;
  }
</style>
