<script lang="ts">
import { ChevronDown, Menu } from '@lucide/svelte';
import DropdownMenu from '../components/dropdown-menu/DropdownMenu.svelte';
import Sidebar from '../components/sidebar/Sidebar.svelte';
import { cn } from '../lib/cn.ts';
import LayoutChrome from './LayoutChrome.svelte';
import LayoutDrawer from './LayoutDrawer.svelte';
import {
  closeWhenWide,
  currentHashPath,
  onNavigate,
  sidebarSections,
  topLevelItems,
} from './layout-kit.ts';
import NavIcon, { navIconComponent } from './NavIcon.svelte';
import { navBadge, resolveNav } from './nav-model.ts';
import type { LayoutProps } from './registry.ts';

/*
 * Top navigation layout (ADR-023): brand, primary links, a "More" menu for
 * the links past `options.visibleItems` (default 5), the actions and the
 * user in one bar; the current section's children as secondary tabs below
 * it. Below 48rem of its own width the links move into a drawer.
 */
let { mountScreen, nav, path, options }: LayoutProps = $props();

const uid = $props.id();
const mainId = `${uid}-main`;
let hashPath = $state(currentHashPath());
let drawerOpen = $state(false);
let target: HTMLElement | undefined = $state();
let root: HTMLDivElement | undefined = $state();

$effect(() => onNavigate(() => (hashPath = currentHashPath())));
$effect(() => {
  if (target) mountScreen(target);
});
$effect(() => {
  if (drawerOpen) return closeWhenWide(root, 768, () => (drawerOpen = false));
});

const resolved = $derived(resolveNav(nav ?? { sections: [] }, path ?? hashPath));
const items = $derived(topLevelItems(resolved));
const visibleCount = $derived(
  typeof options?.visibleItems === 'number' && options.visibleItems >= 1
    ? Math.floor(options.visibleItems)
    : 5
);
const visible = $derived(items.slice(0, visibleCount));
const overflow = $derived(items.slice(visibleCount));
const overflowInTrail = $derived(overflow.some((item) => item.inTrail));
const current = $derived(items.find((item) => item.inTrail));
const tabs = $derived(current?.children ?? []);
const title = $derived(nav?.brand?.label ?? 'Navigation');

const linkClass = cn(
  'relative inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium whitespace-nowrap text-muted-foreground',
  'transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
  'data-[trail]:bg-primary/10 data-[trail]:text-foreground data-[trail]:[&_svg]:text-primary [&_svg]:size-4 [&_svg]:shrink-0'
);
</script>

<div bind:this={root} class="@container flex min-h-app flex-col bg-background text-foreground" data-py-layout="top-nav">
  <LayoutChrome part="skip" {mainId} />
  <header class="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
    <div class="flex h-14 items-center gap-3 px-3 @min-[48rem]:px-4">
      <button
        type="button"
        class="inline-flex size-11 items-center justify-center rounded-md text-muted-foreground hover:bg-foreground/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none @min-[48rem]:hidden"
        aria-haspopup="dialog"
        aria-expanded={drawerOpen}
        onclick={() => (drawerOpen = true)}
      >
        <Menu class="size-5" aria-hidden="true" />
        <span class="sr-only">Open navigation</span>
      </button>
      <LayoutChrome part="brand" {nav} class="text-foreground" />
      {#if items.length}
        <nav aria-label="Main" class="hidden min-w-0 flex-1 @min-[48rem]:block">
          <ul class="flex items-center gap-1">
            {#each visible as item (item.id)}
              {@const badge = navBadge(item.badge)}
              <li>
                <a
                  href={item.href}
                  class={linkClass}
                  data-trail={item.inTrail || undefined}
                  aria-current={item.active ? 'page' : undefined}
                >
                  <NavIcon icon={item.icon} />
                  {item.label}
                  {#if badge !== undefined}
                    <span class="rounded-full bg-foreground/10 px-1.5 text-xs tabular-nums">{badge}</span>
                  {/if}
                </a>
              </li>
            {/each}
            {#if overflow.length}
              <li>
                <DropdownMenu
                  align="start"
                  items={overflow.map((item) => {
                    const icon = navIconComponent(item.icon);
                    return {
                      label: item.active ? `${item.label} (current page)` : item.label,
                      ...(icon ? { icon } : {}),
                      onSelect: () => window.location.assign(item.href),
                    };
                  })}
                >
                  {#snippet trigger({ props })}
                    <button {...props} type="button" class={linkClass} data-trail={overflowInTrail || undefined}>
                      More
                      <ChevronDown aria-hidden="true" />
                      {#if overflowInTrail}<span class="sr-only">(contains the current page)</span>{/if}
                    </button>
                  {/snippet}
                </DropdownMenu>
              </li>
            {/if}
          </ul>
        </nav>
      {:else}
        <div class="flex-1"></div>
      {/if}
      <div class="ml-auto hidden items-center gap-2 @min-[48rem]:flex">
        <LayoutChrome part="actions" {nav} />
        <LayoutChrome part="user" {nav} compact />
      </div>
    </div>
    {#if tabs.length && current}
      <nav aria-label={`${current.label} sections`} class="overflow-x-auto px-3 @min-[48rem]:px-4">
        <ul class="flex gap-1">
          {#each tabs as tab (tab.id)}
            <li>
              <a
                href={tab.href}
                aria-current={tab.active ? 'page' : undefined}
                class="inline-flex h-10 items-center border-b-2 border-transparent px-3 text-sm font-medium whitespace-nowrap text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none aria-[current=page]:border-primary aria-[current=page]:text-foreground"
              >
                {tab.label}
              </a>
            </li>
          {/each}
        </ul>
      </nav>
    {/if}
  </header>
  <main bind:this={target} id={mainId} tabindex="-1" class="min-w-0 flex-1 outline-none"></main>
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
