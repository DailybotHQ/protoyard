<script lang="ts">
import { type Snippet, untrack } from 'svelte';

interface Props {
  navigation: Snippet;
  children: Snippet;
  navigationLabel?: string;
  contentLabel?: string;
  tocLabel?: string;
  class?: string;
}

interface TocItem {
  id: string;
  label: string;
  level: 2 | 3;
}

let {
  navigation,
  children,
  navigationLabel = 'Documentation sections',
  contentLabel = 'Documentation content',
  tocLabel = 'On this page',
  class: className,
}: Props = $props();

let contentRoot = $state<HTMLElement | undefined>();
let tocItems = $state<TocItem[]>([]);
let activeId = $state('');

function headingId(label: string): string {
  return (
    label
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'section'
  );
}

$effect(() => {
  const root = contentRoot;
  if (!root || typeof MutationObserver === 'undefined') return;

  let intersection: IntersectionObserver | undefined;
  const refresh = () => {
    const used = new Set<string>();
    const next = Array.from(root.querySelectorAll<HTMLElement>('h2, h3')).flatMap((heading) => {
      const label = heading.textContent?.replace(/\s+/g, ' ').trim() ?? '';
      if (!label) return [];
      let id = heading.id.trim();
      if (!id || used.has(id)) {
        const base = headingId(label);
        id = base;
        let suffix = 2;
        while (
          used.has(id) ||
          (document.getElementById(id) !== null && document.getElementById(id) !== heading)
        ) {
          id = `${base}-${suffix}`;
          suffix += 1;
        }
        heading.id = id;
      }
      used.add(id);
      const level: TocItem['level'] = heading.tagName === 'H2' ? 2 : 3;
      return [{ id, label, level } satisfies TocItem];
    });
    tocItems = next;
    if (!next.some(({ id }) => id === untrack(() => activeId))) activeId = next[0]?.id ?? '';
    if (intersection) {
      intersection.disconnect();
      for (const heading of root.querySelectorAll<HTMLElement>('h2[id], h3[id]')) {
        intersection.observe(heading);
      }
    }
  };

  if (typeof IntersectionObserver !== 'undefined') {
    intersection = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((left, right) => left.boundingClientRect.top - right.boundingClientRect.top);
        const first = visible[0]?.target as HTMLElement | undefined;
        if (first?.id) activeId = first.id;
      },
      { rootMargin: '-10% 0px -75% 0px', threshold: 0 }
    );
  }

  refresh();
  const mutation = new MutationObserver(refresh);
  mutation.observe(root, { childList: true, characterData: true, subtree: true });
  return () => {
    mutation.disconnect();
    intersection?.disconnect();
  };
});
</script>

<div class="docs-layout @container min-w-0 {className ?? ''}" data-py-docs-layout>
  <div class="docs-layout__grid">
    <main bind:this={contentRoot} class="docs-layout__content" aria-label={contentLabel}>
      {@render children()}
    </main>

    <nav class="docs-layout__navigation" aria-label={navigationLabel}>
      {@render navigation()}
    </nav>

    <aside class="docs-layout__toc" aria-label={tocLabel}>
      <p class="docs-layout__toc-title">{tocLabel}</p>
      {#if tocItems.length > 0}
        <ol>
          {#each tocItems as item (item.id)}
            <li class:docs-layout__toc-subitem={item.level === 3}>
              <a href={`#${item.id}`} aria-current={activeId === item.id ? 'location' : undefined}>
                {item.label}
              </a>
            </li>
          {/each}
        </ol>
      {:else}
        <p class="docs-layout__empty">No section headings.</p>
      {/if}
    </aside>
  </div>
</div>

<style>
  .docs-layout {
    min-width: 0;
    container-type: inline-size;
  }

  .docs-layout__grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas:
      'content'
      'navigation'
      'toc';
    gap: 1.5rem;
    min-width: 0;
  }

  .docs-layout__content {
    grid-area: content;
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .docs-layout__navigation {
    grid-area: navigation;
    min-width: 0;
  }

  .docs-layout__toc {
    grid-area: toc;
    min-width: 0;
  }

  .docs-layout__toc-title {
    margin: 0 0 0.5rem;
    color: var(--py-foreground, #18181b);
    font-size: 0.75rem;
    font-weight: 600;
  }

  .docs-layout__toc ol {
    display: grid;
    gap: 0.25rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .docs-layout__toc a {
    display: block;
    min-height: 32px;
    padding: 0.35rem 0.5rem;
    border-radius: 0.375rem;
    color: var(--py-muted-foreground, #52525b);
    font-size: 0.75rem;
    line-height: 1.4;
    text-decoration: none;
  }

  .docs-layout__toc a:hover,
  .docs-layout__toc a:focus-visible,
  .docs-layout__toc a[aria-current='location'] {
    background: var(--py-muted, #f4f4f5);
    color: var(--py-foreground, #18181b);
  }

  .docs-layout__toc a:focus-visible {
    outline: 2px solid var(--py-ring, #7c3aed);
    outline-offset: 2px;
  }

  .docs-layout__toc-subitem a {
    padding-inline-start: 1rem;
  }

  .docs-layout__empty {
    color: var(--py-muted-foreground, #52525b);
    font-size: 0.75rem;
  }

  @container (min-width: 48rem) {
    .docs-layout__grid {
      grid-template-columns: minmax(12rem, 15rem) minmax(0, 1fr);
      grid-template-areas:
        'navigation content'
        'navigation toc';
    }
  }

  @container (min-width: 72rem) {
    .docs-layout__grid {
      grid-template-columns: minmax(12rem, 15rem) minmax(0, 1fr) minmax(10rem, 13rem);
      grid-template-areas: 'navigation content toc';
      gap: 2rem;
    }

    .docs-layout__navigation,
    .docs-layout__toc {
      position: sticky;
      top: 1rem;
      align-self: start;
      max-height: calc(var(--py-app-height, 100vh) - 2rem);
      overflow: auto;
    }
  }
</style>
