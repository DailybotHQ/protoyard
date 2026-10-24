<script lang="ts">
import { Menu } from '@lucide/svelte';
import { Tooltip } from 'texuli/tooltip';
import Sidebar from '../components/sidebar/Sidebar.svelte';
import { cn } from '../lib/cn.ts';
import LayoutChrome from './LayoutChrome.svelte';
import LayoutDrawer from './LayoutDrawer.svelte';
import { closeWhenWide, currentHashPath, onNavigate, sidebarSections } from './layout-kit.ts';
import NavIcon from './NavIcon.svelte';
import { navBadge, type ResolvedNavItem, resolveNav } from './nav-model.ts';
import type { LayoutProps } from './registry.ts';

/*
 * Dual sidebar layout (ADR-023): a narrow switcher column (one button per
 * nav section, arrow keys move between them), the chosen section's pages
 * (one level of children) in a second column, the screen, and the optional
 * `aside` context panel on the right. The switcher follows the current page
 * until someone picks another section. Below 64rem of its own width the nav
 * moves into a drawer (the host already falls back to `sidebar` there).
 */
let { mountScreen, nav, path, aside }: LayoutProps = $props();

const uid = $props.id();
const mainId = `${uid}-main`;
let hashPath = $state(currentHashPath());
let drawerOpen = $state(false);
let picked = $state<string | undefined>();
let target: HTMLElement | undefined = $state();
let root: HTMLDivElement | undefined = $state();

$effect(() =>
  onNavigate(() => {
    hashPath = currentHashPath();
    picked = undefined;
  })
);
$effect(() => {
  if (target) mountScreen(target);
});
$effect(() => {
  if (drawerOpen) return closeWhenWide(root, 1024, () => (drawerOpen = false));
});

const resolved = $derived(resolveNav(nav ?? { sections: [] }, path ?? hashPath));
const trailSection = $derived(
  resolved.find((section) => section.items.some((item) => item.inTrail))
);
const selected = $derived(
  resolved.find((section) => section.id === picked) ?? trailSection ?? resolved[0]
);
const title = $derived(nav?.brand?.label ?? 'Navigation');

function switcherKeys(event: KeyboardEvent): void {
  const buttons = [
    ...(event.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>(
      'button[data-section]'
    ),
  ];
  const index = buttons.indexOf(event.target as HTMLButtonElement);
  if (index === -1) return;
  const last = buttons.length - 1;
  const next =
    event.key === 'ArrowDown'
      ? (index + 1) % buttons.length
      : event.key === 'ArrowUp'
        ? (index - 1 + buttons.length) % buttons.length
        : event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? last
            : -1;
  if (next === -1) return;
  event.preventDefault();
  buttons[next]?.focus();
}

const itemClass = cn(
  'flex h-9 items-center gap-3 rounded-md px-3 text-sm font-medium text-sidebar-foreground/80',
  'hover:bg-foreground/5 hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
  'aria-[current=page]:bg-primary/10 aria-[current=page]:font-semibold aria-[current=page]:text-sidebar-foreground aria-[current=page]:[&_svg]:text-primary [&_svg]:size-4 [&_svg]:shrink-0'
);
</script>

{#snippet link(item: ResolvedNavItem, child = false)}
  {@const badge = navBadge(item.badge)}
  <a href={item.href} aria-current={item.active ? 'page' : undefined} class={cn(itemClass, child && 'h-8 pl-9 text-xs')}>
    {#if !child}<NavIcon icon={item.icon} />{/if}
    <span class="truncate">{item.label}</span>
    {#if badge !== undefined}
      <span class="ml-auto rounded-full bg-foreground/10 px-1.5 text-xs tabular-nums">{badge}</span>
    {/if}
  </a>
{/snippet}

<div bind:this={root} class="@container flex min-h-app bg-background text-foreground" data-py-layout="dual-sidebar">
  <LayoutChrome part="skip" {mainId} />
  <aside aria-label={title} class="sticky top-0 hidden h-app shrink-0 @min-[64rem]:flex" data-py-layout-column>
    <div class="flex w-16 flex-col items-center gap-3 border-r border-sidebar-border bg-sidebar py-3">
      <LayoutChrome part="brand" {nav} compact />
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <ul class="grid gap-1" aria-label="Sections" onkeydown={switcherKeys}>
        {#each resolved as section, index (section.id)}
          {@const label = section.label ?? section.items[0]?.label ?? `Section ${index + 1}`}
          <li>
            <Tooltip content={label} side="right">
              {#snippet children({ props })}
                <button
                  {...props}
                  type="button"
                  data-section={section.id}
                  aria-pressed={section.id === selected?.id}
                  aria-current={section === trailSection ? 'true' : undefined}
                  class="inline-flex size-10 items-center justify-center rounded-md text-sidebar-foreground/80 hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none aria-pressed:bg-primary/10 aria-pressed:text-sidebar-foreground aria-pressed:[&_svg]:text-primary [&_svg]:size-5"
                  onclick={() => (picked = section.id)}
                >
                  {#if section.items[0]?.icon}
                    <NavIcon icon={section.items[0].icon} />
                  {:else}
                    <span class="text-xs font-semibold" aria-hidden="true">{label.slice(0, 2)}</span>
                  {/if}
                  <span class="sr-only">{label}</span>
                </button>
              {/snippet}
            </Tooltip>
          </li>
        {/each}
      </ul>
      <div class="mt-auto grid justify-items-center gap-2">
        <LayoutChrome part="actions" {nav} compact />
        <LayoutChrome part="user" {nav} compact />
      </div>
    </div>
    {#if selected}
      <nav
        aria-label={selected.label ?? 'Section'}
        class="flex w-60 flex-col gap-1 overflow-y-auto border-r border-sidebar-border bg-sidebar px-2 py-3 text-sidebar-foreground"
      >
        {#if selected.label}
          <p class="px-3 pb-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">{selected.label}</p>
        {/if}
        <ul class="grid gap-0.5">
          {#each selected.items as item (item.id)}
            <li>
              {@render link(item)}
              {#if item.children.length}
                <ul class="mt-0.5 grid gap-0.5">
                  {#each item.children as child (child.id)}
                    <li>{@render link(child, true)}</li>
                  {/each}
                </ul>
              {/if}
            </li>
          {/each}
        </ul>
      </nav>
    {/if}
  </aside>
  <div class="flex min-w-0 flex-1 flex-col">
    <header
      class="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-background/95 px-3 backdrop-blur @min-[64rem]:hidden"
    >
      <button
        type="button"
        class="inline-flex size-11 items-center justify-center rounded-md text-muted-foreground hover:bg-foreground/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        aria-haspopup="dialog"
        aria-expanded={drawerOpen}
        onclick={() => (drawerOpen = true)}
      >
        <Menu class="size-5" aria-hidden="true" />
        <span class="sr-only">Open navigation</span>
      </button>
      <LayoutChrome part="brand" {nav} />
    </header>
    <main bind:this={target} id={mainId} tabindex="-1" class="min-w-0 flex-1 outline-none"></main>
  </div>
  {#if aside}
    <aside
      aria-label="Context"
      class="sticky top-0 hidden h-app w-80 shrink-0 overflow-y-auto border-l border-border bg-card text-card-foreground @min-[64rem]:block"
      data-py-layout-aside
    >
      {@render aside()}
    </aside>
  {/if}
</div>

<LayoutDrawer bind:open={drawerOpen} label={title}>
  <Sidebar sections={sidebarSections(resolved)} collapsible={false} label="Main">
    {#snippet header()}<LayoutChrome part="brand" {nav} />{/snippet}
    {#snippet footer()}
      <LayoutChrome part="actions" {nav} class="flex-wrap" />
      <LayoutChrome part="user" {nav} />
    {/snippet}
  </Sidebar>
</LayoutDrawer>
