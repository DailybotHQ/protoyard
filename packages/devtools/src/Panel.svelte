<script lang="ts">
import {
  Camera,
  Clapperboard,
  Clock,
  Database,
  Eraser,
  FlaskConical,
  Palette,
  Presentation,
  Share2,
  Users,
  Wifi,
} from '@lucide/svelte';
import type { PrototypeRuntime, Theme } from '@protoyard/core';
import type { Component } from 'svelte';
import { onMount } from 'svelte';
import { on } from 'svelte/events';
import { reproducibleLink } from './link.ts';
import type { DevtoolsTab } from './mount.ts';
import { loadPrefs, savePrefs } from './persist.ts';
import Btn from './primitives/Btn.svelte';
import Glyph from './primitives/Glyph.svelte';
import AppearanceSection from './sections/AppearanceSection.svelte';
import DataSection from './sections/DataSection.svelte';
import EnvironmentSection from './sections/EnvironmentSection.svelte';
import PersonasSection from './sections/PersonasSection.svelte';
import ScenarioSection from './sections/ScenarioSection.svelte';
import ShareSection from './sections/ShareSection.svelte';
import SnapshotsSection from './sections/SnapshotsSection.svelte';
import TimeSection from './sections/TimeSection.svelte';
import {
  type AvatarImageResolver,
  createDevtoolsState,
  type DevtoolsState,
} from './state.svelte.ts';

let {
  runtime,
  themes = [],
  avatarImage,
  extraTabs = [],
}: {
  runtime: PrototypeRuntime;
  themes?: readonly Theme[];
  avatarImage?: AvatarImageResolver;
  extraTabs?: readonly DevtoolsTab[];
} = $props();

// svelte-ignore state_referenced_locally
const dt = createDevtoolsState(runtime, themes, avatarImage);
// svelte-ignore state_referenced_locally
const namespace = runtime.manifest.storage.namespace;
const initial = loadPrefs(namespace);

type BuiltinTabId =
  | 'scenario'
  | 'personas'
  | 'time'
  | 'data'
  | 'env'
  | 'look'
  | 'snapshots'
  | 'share';
type TabId = BuiltinTabId | (string & {});
type BuiltinTab = {
  id: BuiltinTabId;
  label: string;
  icon: Component<{ class?: string }>;
  view: Component<{ dt: DevtoolsState }>;
};
type Tab = BuiltinTab | DevtoolsTab;
type ExtensionView = Component<{ dt?: DevtoolsState; [key: string]: unknown }>;

const builtinTabs: BuiltinTab[] = [
  { id: 'scenario', label: 'Scenario', icon: Clapperboard, view: ScenarioSection },
  { id: 'personas', label: 'Personas', icon: Users, view: PersonasSection },
  { id: 'time', label: 'Time', icon: Clock, view: TimeSection },
  { id: 'data', label: 'Data', icon: Database, view: DataSection },
  { id: 'env', label: 'Env', icon: Wifi, view: EnvironmentSection },
  { id: 'look', label: 'Look', icon: Palette, view: AppearanceSection },
  { id: 'snapshots', label: 'Snaps', icon: Camera, view: SnapshotsSection },
  { id: 'share', label: 'Share', icon: Share2, view: ShareSection },
];
const tabs = $derived.by(() => {
  const registeredIds = new Set<string>(builtinTabs.map((item) => item.id));
  return [
    ...builtinTabs,
    ...extraTabs.filter((item) => {
      if (registeredIds.has(item.id)) return false;
      registeredIds.add(item.id);
      return true;
    }),
  ] as Tab[];
});

let open = $state(initial.open);
// svelte-ignore state_referenced_locally -- initialize the saved selection once, then persist later changes.
let tab = $state<TabId>(tabs.some((t) => t.id === initial.tab) ? initial.tab : 'scenario');
let loadedTabs = $state<Record<string, ExtensionView>>({});
let loadingTabs = $state<string[]>([]);
let tabErrors = $state<Record<string, string>>({});
let launcher: HTMLElement | null = $state(null);
let heading: HTMLHeadingElement | undefined = $state();
let tabList: HTMLDivElement | undefined = $state();

const current = $derived(tabs.find((t) => t.id === tab) ?? (tabs[0] as Tab));
const overrideCount = $derived(Object.values(dt.overrides).filter((v) => v !== undefined).length);
const activeTabLoading = $derived(loadingTabs.includes(tab));

$effect(() => {
  savePrefs(namespace, { open, tab });
});

onMount(() => {
  const selected = tabs.find((item) => item.id === tab);
  if (selected && !('view' in selected)) void selectTab(selected);
});

/**
 * Keep the launcher out of the app's way: sit above a fixed bottom nav
 * (`data-py-bottom-nav`, set by @protoyard/ui BottomNav) and dock to the
 * screen edge while an app modal is open. Prototypes can set
 * `--py-devtools-offset` on :root for anything else pinned to the bottom.
 */
let navOffset = $state(0);
let fixedRightEdge = $state('0px');
let devtoolsOffset = $state('0px');
let appModalOpen = $state(false);
/** Phone-width windows: a bottom pill covers composers, send buttons and tab bars. */
let narrow = $state(false);
$effect(() => {
  let frame = 0;
  const measure = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      fixedRightEdge =
        getComputedStyle(document.documentElement)
          .getPropertyValue('--py-fixed-right-edge')
          .trim() || '0px';
      devtoolsOffset =
        getComputedStyle(document.documentElement)
          .getPropertyValue('--py-devtools-offset')
          .trim() || '0px';
      let offset = 0;
      for (const nav of document.querySelectorAll<HTMLElement>('[data-py-bottom-nav]')) {
        const rect = nav.getBoundingClientRect();
        const fixed = getComputedStyle(nav).position === 'fixed';
        if (fixed && rect.height > 0 && rect.bottom >= window.innerHeight - 1) {
          offset = Math.max(offset, rect.height);
        }
      }
      navOffset = offset;
      narrow = window.innerWidth < 640;
      appModalOpen = [
        ...document.querySelectorAll('[role="dialog"][aria-modal="true"], [role="alertdialog"]'),
      ].some((el) => !el.closest('.py-devtools'));
    });
  };
  measure();
  const observer = new MutationObserver(measure);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['aria-modal', 'role', 'class', 'style'],
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['style'],
  });
  const offResize = on(window, 'resize', measure);
  return () => {
    cancelAnimationFrame(frame);
    observer.disconnect();
    offResize();
  };
});

$effect(() => {
  return () => dt.destroy();
});

function setOpen(next: boolean, focus = true) {
  open = next;
  if (!focus) return;
  queueMicrotask(() => (next ? heading : launcher)?.focus());
}

$effect(() => {
  // Ctrl/⌘ + . toggles from anywhere, including inside app inputs.
  return on(window, 'keydown', (event: KeyboardEvent) => {
    if ((event.ctrlKey || event.metaKey) && event.key === '.') {
      event.preventDefault();
      setOpen(!open);
    }
  });
});

function onPanelKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && !event.defaultPrevented) {
    event.stopPropagation();
    setOpen(false);
  }
}

function onTabKeydown(event: KeyboardEvent) {
  const index = tabs.findIndex((t) => t.id === tab);
  let next = index;
  if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
  else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
  else if (event.key === 'Home') next = 0;
  else if (event.key === 'End') next = tabs.length - 1;
  else return;
  event.preventDefault();
  const nextTab = tabs[next];
  if (nextTab) void selectTab(nextTab);
  queueMicrotask(() => tabList?.querySelector<HTMLButtonElement>(`#py-dt-tab-${tab}`)?.focus());
}

async function selectTab(selected: Tab): Promise<void> {
  tab = selected.id;
  tabErrors[selected.id] = '';
  if ('view' in selected || loadedTabs[selected.id] || loadingTabs.includes(selected.id)) return;
  loadingTabs = [...loadingTabs, selected.id];
  try {
    loadedTabs[selected.id] = (await selected.load()) as ExtensionView;
  } catch (error) {
    tabErrors[selected.id] =
      error instanceof Error ? error.message : `Could not load ${selected.label}.`;
  } finally {
    loadingTabs = loadingTabs.filter((id) => id !== selected.id);
  }
}

async function resetOverrides() {
  await dt.run('overrides:clear', () => runtime.overrides.clear(), 'All overrides cleared.');
}

function presentationMode() {
  // Leaving presentation mode later shows the launcher, not a panel reopened over the app.
  open = false;
  savePrefs(namespace, { open: false, tab });
  location.assign(reproducibleLink(runtime, { presentation: true }));
}
</script>

<div class="py-devtools-root pointer-events-auto font-sans text-[13px] leading-normal text-foreground antialiased" style={`--devtools-fixed-right-edge: ${fixedRightEdge}; --devtools-offset: ${devtoolsOffset}`}>
  {#if !open}
    {#if appModalOpen || narrow}
      <!-- Docked to the right edge so it never covers an app dialog's actions or a phone's bottom controls. -->
      <Btn
        bind:ref={launcher}
        type="button"
        class="fixed top-1/2 right-[var(--devtools-fixed-right-edge,0px)] z-[2147483000] inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-l-xl border border-r-0 border-border bg-elevated text-primary shadow-float focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        aria-label="Open Protoyard DevTools (Ctrl or Command + period)"
        aria-expanded="false"
        onclick={() => setOpen(true)}
      >
        <Glyph icon={FlaskConical} class="size-4" aria-hidden="true" />
      </Btn>
    {:else}
      <Btn
        bind:ref={launcher}
        type="button"
        class="fixed right-[calc(1rem+var(--devtools-fixed-right-edge,0px))] z-[2147483000] inline-flex h-11 items-center gap-2 rounded-full border border-border bg-elevated pr-4 pl-3 text-xs font-semibold text-foreground shadow-float transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none"
        style={`bottom: ${navOffset > 0
          ? `calc(${navOffset + 12}px + var(--devtools-offset, 0px))`
          : 'calc(1rem + env(safe-area-inset-bottom, 0px) + var(--devtools-offset, 0px))'}`}
        aria-label={overrideCount > 0
          ? `Open Protoyard DevTools ${overrideCount} active overrides (Ctrl or Command + period)`
          : 'Open Protoyard DevTools (Ctrl or Command + period)'}
        aria-expanded="false"
        onclick={() => setOpen(true)}
      >
        <Glyph icon={FlaskConical} class="size-4 text-primary" aria-hidden="true" />
        DevTools
        {#if overrideCount > 0}
          <!-- The visible count is part of the button's name (label-content-name-mismatch). -->
          <span class="rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">{overrideCount}</span>
        {/if}
      </Btn>
    {/if}
  {:else}
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -- Escape-to-close is delegated from the whole dock. -->
    <aside
      class="fixed inset-x-0 bottom-0 z-[2147483000] flex max-h-[85dvh] flex-col overflow-hidden rounded-t-2xl border border-border bg-background shadow-float sm:inset-x-auto sm:right-[calc(1rem+var(--devtools-fixed-right-edge,0px))] sm:bottom-4 sm:h-[min(680px,calc(100dvh-2rem))] sm:max-h-none sm:w-[400px] sm:rounded-xl"
      aria-label="Protoyard DevTools"
      onkeydown={onPanelKeydown}
    >
      <div class="mx-auto mt-2 h-1 w-10 rounded-full bg-border sm:hidden" aria-hidden="true"></div>
      <header class="relative flex items-center gap-2 border-b border-border px-3 py-2" aria-busy={dt.working || activeTabLoading || undefined}>
        {#if dt.working}
          <!-- Immediate feedback for any panel action or runtime operation; overlays the border, no layout shift. -->
          <div
            class="pointer-events-none absolute inset-x-0 -bottom-px h-0.5 overflow-hidden bg-primary/15"
            role="progressbar"
            aria-label="Applying changes"
            data-dt-working
          >
            <div class="h-full w-1/3 animate-pulse bg-primary motion-reduce:w-full motion-reduce:animate-none"></div>
          </div>
        {/if}
        <Glyph icon={FlaskConical} class="size-4 shrink-0 text-primary" aria-hidden="true" />
        <div class="min-w-0 flex-1">
          <h2 bind:this={heading} tabindex="-1" class="truncate text-xs font-semibold outline-none">
            {runtime.manifest.name} <span class="font-normal text-muted-foreground">· DevTools</span>
          </h2>
          <p class="truncate text-[11px] text-muted-foreground">
            {#if runtime.sandbox}<span class="mr-1 rounded bg-warning px-1 font-medium text-warning-foreground">Sandbox: {runtime.sandbox}</span>{/if}
            {dt.active?.scenario.name ?? 'No scenario'} · {dt.principal?.persona.name ?? 'nobody'}
            ({dt.principal?.role ?? '—'})
          </p>
        </div>
        {#if overrideCount > 0}
          <Btn
            type="button"
            class="inline-flex min-h-touch items-center gap-1 rounded-md px-2 text-[11px] font-medium text-primary hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring sm:min-h-7"
            title="Clear every temporary override (actor, role, environment, appearance)"
            disabled={dt.isBusy('overrides:clear')}
            onclick={resetOverrides}
          >
            <Glyph icon={Eraser} class="size-3.5" aria-hidden="true" />Reset {overrideCount}
          </Btn>
        {/if}
        <Btn
          type="button"
          class="inline-flex size-11 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring sm:size-7"
          aria-label="Presentation mode: reload without DevTools"
          title="Presentation mode (?devtools=0)"
          onclick={presentationMode}
        >
          <Glyph icon={Presentation} class="size-4" aria-hidden="true" />
        </Btn>
        <Btn
          type="button"
          class="inline-flex size-11 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring sm:size-7"
          aria-label="Close DevTools"
          onclick={() => setOpen(false)}
        >
          <Glyph icon="close" class="size-4" aria-hidden="true" />
        </Btn>
      </header>

      <div
        bind:this={tabList}
        role="tablist"
        aria-label="DevTools sections"
        tabindex="-1"
        class="grid shrink-0 gap-0.5 border-b border-border px-1.5 py-1.5"
        style:grid-template-columns={`repeat(${Math.min(tabs.length, 9)}, minmax(0, 1fr))`}
        onkeydown={onTabKeydown}
      >
        {#each tabs as t (t.id)}
          {@const selected = t.id === tab}
          <Btn
            id={`py-dt-tab-${t.id}`}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls="py-dt-tabpanel"
            tabindex={selected ? 0 : -1}
            class="flex min-h-touch min-w-0 flex-col items-center justify-center gap-0.5 rounded-md px-0.5 py-1 text-[10px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring {selected
              ? 'bg-primary/10 font-semibold text-foreground [&_svg]:text-primary'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'}"
            onclick={() => selectTab(t)}
          >
            <Glyph icon={t.icon} class="size-4" />
            <span class="max-w-full truncate">{t.label}</span>
          </Btn>
        {/each}
      </div>

      <div
        id="py-dt-tabpanel"
        role="tabpanel"
        aria-labelledby={`py-dt-tab-${tab}`}
        class="min-h-0 flex-1 overflow-y-auto overscroll-contain"
      >
        {#key tab}
          {#if 'view' in current}
            <current.view {dt} />
          {:else if loadedTabs[tab]}
            {@const ExtraView = loadedTabs[tab]}
            <ExtraView {dt} {...('props' in current ? current.props : {})} />
          {:else if activeTabLoading}
            <p class="p-4 text-muted-foreground" role="status">Loading {current.label}…</p>
          {:else if tabErrors[tab]}
            <p class="p-4 text-destructive" role="alert">{tabErrors[tab]}</p>
          {/if}
        {/key}
      </div>

      <div class="min-h-8 border-t border-border px-3 py-1.5 pb-safe text-[11px]" aria-live="polite" role="status">
        {#if dt.status}
          <span
            class={dt.status.kind === 'error'
              ? 'text-destructive'
              : dt.status.kind === 'success'
                ? 'text-success'
                : 'text-muted-foreground'}>{dt.status.text}</span
          >
        {:else}
          <span class="text-muted-foreground">Simulation only — nothing here is real security or real infrastructure.</span>
        {/if}
      </div>
    </aside>
  {/if}
</div>
