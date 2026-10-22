<script lang="ts">
import { getRuntime, liveQuery, usePrincipal } from '@protoyard/renderer-svelte';
import { Button } from '@protoyard/ui';
import type { Component } from 'svelte';
import { ENTRIES, GROUPS } from './catalog/entries.ts';
import { demoLoader, demoProps } from './catalog/registry.ts';
import type { DesignKitDatabase, ReviewEntry } from './database/schema.ts';
import { reviewService } from './lib/services.ts';

const runtime = getRuntime<DesignKitDatabase>();
const principal = usePrincipal();
const personaId = $derived(principal.current?.persona.id ?? '');
const reviews = liveQuery(() => runtime.db.reviews.where('personaId').equals(personaId).toArray(), {
  initial: [] as ReviewEntry[],
  deps: () => personaId,
});

let section = $state('Foundations');
let foundation = $state('Color');
let search = $state('');
let selectedId = $state('button');
let Demo = $state<Component | undefined>();
let loadingDemo = $state(false);
let status = $state<ReviewEntry['status']>('todo');
let note = $state('');
let error = $state('');
let copied = $state(false);
let copying = $state(false);
let copyError = $state('');

const selected = $derived(
  ENTRIES.find((entry) => entry.id === selectedId) ?? {
    id: 'button',
    name: 'Button',
    group: 'Actions',
    summary: 'Primary, quiet and destructive actions.',
    demo: 'ButtonDemo',
  }
);
const review = $derived((reviews.current ?? []).find((row) => row.entryId === selectedId));
const filtered = $derived(
  ENTRIES.filter((entry) =>
    `${entry.name} ${entry.group} ${entry.summary}`
      .toLowerCase()
      .includes(search.toLowerCase().trim())
  )
);
const props = $derived(demoProps(selected.demo));

async function selectEntry(id: string) {
  const entry = ENTRIES.find((item) => item.id === id);
  if (!entry) return;
  selectedId = id;
  status = review?.status ?? 'todo';
  note = review?.note ?? '';
  loadingDemo = true;
  error = '';
  try {
    Demo = await demoLoader(entry.demo)();
  } finally {
    loadingDemo = false;
  }
}

/** Returns the save promise so `@protoyard/ui` Button can drive pending state. */
function saveReview(): Promise<unknown> {
  error = '';
  return reviewService()
    .save({ entryId: selectedId, status, note })
    .catch((cause: unknown) => {
      error = cause instanceof Error ? cause.message : 'Review could not be saved.';
      throw cause;
    });
}

async function copySnippet() {
  copying = true;
  copied = false;
  copyError = '';
  const examples: Record<string, string> = {
    button: '<button type="button" class="button button-primary">Save changes</button>',
    badge: '<span class="badge badge-success">Approved</span>',
    card: '<article class="card"><h2>Product health</h2><p>Activation is steady.</p></article>',
    field:
      '<label for="email">Work email</label>\n<input id="email" type="email" autocomplete="email" />',
  };
  try {
    await navigator.clipboard.writeText(examples[selectedId] ?? '');
    copied = true;
    window.setTimeout(() => {
      copied = false;
    }, 1600);
  } catch {
    copyError = 'Clipboard access is unavailable in this browser context.';
  } finally {
    copying = false;
  }
}

$effect(() => {
  if (!review) {
    status = 'todo';
    note = '';
  } else {
    status = review.status;
    note = review.note;
  }
});

void selectEntry('button');

const foundations = ['Color', 'Type', 'Shape', 'Motion', 'Icons', 'Brand', 'Adaptive'];
const colors = [
  { name: 'Canvas', value: '#f6f5f2' },
  { name: 'Ink', value: '#22252a' },
  { name: 'Accent', value: '#5b45d6' },
  { name: 'Success', value: '#247a55' },
  { name: 'Warning', value: '#a35c09' },
  { name: 'Surface', value: '#ffffff' },
];
function contrastInk(hex: string) {
  const rgb = hex
    .match(/[0-9a-f]{2}/gi)
    ?.slice(0, 3)
    .map((part) => Number.parseInt(part, 16) / 255) ?? [1, 1, 1];
  const linear = rgb.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  );
  return 0.2126 * (linear[0] ?? 1) + 0.7152 * (linear[1] ?? 1) + 0.0722 * (linear[2] ?? 1) > 0.42
    ? '#22252a'
    : '#ffffff';
}
</script>

<svelte:head><title>Studio Kit · Design system</title><meta name="description" content="Explore design foundations, component demos and review notes." /></svelte:head>

<div class="app-shell">
  <aside class="sidebar">
    <a href="#/" class="brand"><span class="brand-mark">✳</span><span><strong>Studio Kit</strong><small>Design system</small></span></a>
    <p class="nav-label">LIBRARY</p>
    <button class:active={section === 'Foundations'} class="nav-item" onclick={() => section = 'Foundations'}><span>◈</span> Foundations</button>
    <button class:active={section === 'Catalog'} class="nav-item" onclick={() => section = 'Catalog'}><span>▦</span> Components <span class="count">{ENTRIES.length}</span></button>
    <p class="nav-label">FOUNDATIONS</p>
    {#each foundations as item}
      <button class:sub-active={foundation === item} class="nav-sub" onclick={() => { section = 'Foundations'; foundation = item; }}>{item}</button>
    {/each}
    <div class="sidebar-footer"><span class="avatar">AC</span><span><strong>Avery Chen</strong><small>Design owner</small></span><span class="online-dot"></span></div>
  </aside>

  <main class="main">
    <header class="topbar"><div><span class="crumb">Workspace</span><span class="slash">/</span><strong>{section === 'Foundations' ? foundation : 'Component catalog'}</strong></div><div class="top-actions"><span class="local-tag">● Local preview</span><button class="avatar small" aria-label="Current persona">AC</button></div></header>
    {#if section === 'Foundations'}
      <section class="content">
        <div class="page-heading"><div><p class="eyebrow">FOUNDATION / {foundation.toUpperCase()}</p><h1>{foundation} foundations</h1><p class="lede">A practical starting point for a coherent, accessible product language.</p></div><span class="version-pill">v1.0 · Draft</span></div>
        {#if foundation === 'Color'}
          <div class="foundation-intro"><div><span class="tiny-label">COLOR SYSTEM</span><h2>Clear meaning. Measured contrast.</h2><p>Each swatch includes an automatically selected ink color for legible labels. Use semantic roles before adding new hues.</p></div><div class="contrast-chip"><span>AA</span><small>Contrast-aware<br />foreground pairing</small></div></div>
          <div class="swatch-grid">{#each colors as color}<article class="swatch-card"><div class="swatch" style={`--swatch:${color.value};--swatch-ink:${contrastInk(color.value)}`}><span>{color.name}</span><code>{color.value}</code></div><div class="swatch-meta"><strong>{color.name}</strong><small>{color.value.toUpperCase()}</small></div></article>{/each}</div>
          <section class="guideline"><span class="guideline-icon">✓</span><div><strong>Contrast is part of the token</strong><p>Always pair text with the ink shown on each color. Check real text sizes and states when you replace a palette.</p></div></section>
        {:else if foundation === 'Type'}
          <section class="type-panel"><span class="tiny-label">TYPE SCALE · INTER</span><div class="type-row display"><span>Display</span><strong>Make space<br />for good ideas.</strong><code>48 / 1.05</code></div><div class="type-row heading"><span>Heading</span><strong>Thoughtful interfaces</strong><code>28 / 1.2</code></div><div class="type-row body"><span>Body</span><strong>Good typography makes information easier to scan and actions easier to understand.</strong><code>16 / 1.55</code></div><div class="type-row caption"><span>Caption</span><strong>Updated just now · visible to your team</strong><code>12 / 1.4</code></div></section>
        {:else if foundation === 'Shape'}
          <div class="shape-grid">{#each [{ name: 'Tight', radius: '6px' }, { name: 'Default', radius: '12px' }, { name: 'Soft', radius: '20px' }, { name: 'Pill', radius: '999px' }] as shape}<article class="shape-card"><div style={`border-radius:${shape.radius}`}></div><strong>{shape.name}</strong><code>{shape.radius}</code></article>{/each}</div>
        {:else if foundation === 'Motion'}
          <section class="motion-panel"><span class="tiny-label">MOTION PRINCIPLES</span><h2>Small cues, calm pace.</h2><p>Use motion to clarify a state change. Respect the operating system's reduced-motion preference.</p><div class="motion-demo"><span class="motion-dot"></span><span>Hover or focus to preview</span></div><ul><li>Fast feedback: 120–180 ms</li><li>Natural movement: ease-out</li><li>Reduced motion: remove transforms and loops</li></ul></section>
        {:else if foundation === 'Icons'}
          <div class="icon-grid">{#each [['⌂','Home'],['＋','Add'],['⌕','Search'],['♡','Favorite'],['✓','Complete'],['⋯','More'],['↗','External'],['⚙','Settings']] as [symbol, label]}<article><span aria-hidden="true">{symbol}</span><small>{label}</small></article>{/each}</div><p class="hint">Prefer a consistent 1.75 px stroke icon set. Decorative icons are hidden from assistive technology; icon-only actions need a visible or accessible label.</p>
        {:else if foundation === 'Brand'}
          <section class="brand-panel"><div class="brand-orb">✳</div><div><span class="tiny-label">BRAND MARK</span><h2>Studio North</h2><p>A flexible identity built from a simple mark, a confident violet accent and generous whitespace.</p><div class="brand-values"><span>Clear</span><span>Considered</span><span>Useful</span></div></div></section>
        {:else}
          <section class="adaptive-panel"><div><span class="tiny-label">RESPONSIVE BEHAVIOR</span><h2>One system, every screen.</h2><p>Layouts can reflow from a two-column desktop canvas to a single phone column without losing hierarchy.</p></div><div class="adaptive-demo"><div class="desktop-mini"><span></span><i></i><i></i><i></i></div><div class="phone-mini"><span></span><i></i><i></i></div></div></section>
        {/if}
      </section>
    {:else}
      <section class="content catalog-content">
        <div class="page-heading"><div><p class="eyebrow">LIBRARY / COMPONENTS</p><h1>Component catalog</h1><p class="lede">Explore patterns, copy usage and leave a review for each entry.</p></div><span class="version-pill">{ENTRIES.length} entries</span></div>
        <label class="search-box"><span aria-hidden="true">⌕</span><input bind:value={search} placeholder="Search components and patterns" aria-label="Search components and patterns" /><kbd>⌘ K</kbd></label>
        <div class="catalog-layout">
          <nav class="catalog-nav" aria-label="Component groups"><span class="tiny-label">GROUPS</span>{#each GROUPS as group}<button class:group-active={selected.group === group} onclick={() => { const first = ENTRIES.find((entry) => entry.group === group); if (first) void selectEntry(first.id); }}>{group}<span>{ENTRIES.filter((entry) => entry.group === group).length}</span></button>{/each}<span class="tiny-label recently">ENTRIES</span>{#each filtered as entry}<button class:entry-active={selectedId === entry.id} class="entry-link" onclick={() => void selectEntry(entry.id)}>{entry.name}</button>{/each}</nav>
          <div class="entry-main">
            {#if filtered.length === 0}<div class="empty-search"><span>⌕</span><h2>No matching components</h2><p>Try a different name or group.</p></div>
            {:else}<div class="entry-heading"><div><span class="eyebrow">{selected.group.toUpperCase()} · COMPONENT</span><h2>{selected.name}</h2><p>{selected.summary}</p></div><span class={`status-pill ${review?.status ?? 'todo'}`}>{review?.status ?? 'Not reviewed'}</span></div>
              <section class="demo-section"><div class="section-head"><div><strong>Responsive preview</strong><small>Same component, two common viewports</small></div><button class="quiet-action" onclick={copySnippet} disabled={copying}>{copying ? 'Copying…' : copied ? 'Copied' : 'Copy snippet ↗'}</button></div>{#if copyError}<p class="error" role="alert">{copyError}</p>{/if}
                <div class="preview-grid"><article class="preview-frame desktop-frame"><div class="frame-toolbar"><span class="traffic"><i></i><i></i><i></i></span><small>Desktop · 1280 px</small><span>↗</span></div><div class="demo-canvas">{#if loadingDemo}<span class="loading">Loading preview…</span>{:else if Demo}<Demo />{/if}</div></article><article class="preview-frame phone-frame"><div class="frame-toolbar"><span class="phone-notch"></span><small>Phone · 390 px</small></div><div class="demo-canvas">{#if loadingDemo}<span class="loading">Loading…</span>{:else if Demo}<Demo />{/if}</div></article></div>
              </section>
              <section class="props-section"><div class="section-head"><div><strong>Props</strong><small>Read from this demo's source annotations</small></div><span class="generated-tag">GENERATED</span></div>{#if props.length}<div class="props-table" role="table" aria-label={`${selected.name} properties`}><div class="props-row props-header" role="row"><span role="columnheader">Name</span><span role="columnheader">Type</span><span role="columnheader">Description</span></div>{#each props as prop}<div class="props-row" role="row"><code>{prop.name}</code><code>{prop.type}</code><span>{prop.description}</span></div>{/each}</div>{:else}<p class="hint">Add @prop annotations to the component source to document its API.</p>{/if}</section>
              <section class="review-section"><div class="section-head"><div><strong>Review notes</strong><small>Saved for {principal.current?.persona.name ?? 'this persona'} in this browser</small></div><span class="saved-at">{review ? `Updated ${new Date(review.updatedAt).toLocaleDateString()}` : 'Not reviewed yet'}</span></div><div class="review-fields"><label>Status<select bind:value={status}><option value="todo">To do</option><option value="in-progress">In progress</option><option value="approved">Approved</option></select></label><label class="note-field">Notes<textarea bind:value={note} maxlength="500" placeholder="Add a decision, question or follow-up…"></textarea><small>{note.length}/500</small></label><Button class="primary save-button" loadingLabel="Saving review" onclick={() => saveReview()}>Save review</Button>{#if error}<p class="error" role="alert">{error}</p>{/if}</div></section>
            {/if}
          </div>
        </div>
      </section>
    {/if}
  </main>
</div>
