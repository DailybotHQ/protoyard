<script lang="ts">
import { Ellipsis } from '@lucide/svelte';
import BottomNav from '../components/bottom-nav/BottomNav.svelte';
import BottomSheet from '../components/bottom-sheet/BottomSheet.svelte';
import MobileAppShell from '../components/mobile-app-shell/MobileAppShell.svelte';
import MobileHeader from '../components/mobile-header/MobileHeader.svelte';
import { cn } from '../lib/cn.ts';
import LayoutChrome from './LayoutChrome.svelte';
import { currentHashPath, onNavigate, topLevelItems } from './layout-kit.ts';
import NavIcon, { navIconComponent } from './NavIcon.svelte';
import { navBadge, type ResolvedNavItem, resolveNav } from './nav-model.ts';
import type { LayoutProps } from './registry.ts';

/*
 * Mobile tab bar layout (ADR-023): `MobileAppShell` with a `MobileHeader`
 * (the current page's name and the actions) and a `BottomNav` of the
 * top-level items. Five or fewer fit; with more, the first four stay and a
 * More tab opens a `BottomSheet` with the rest, the user and the actions.
 * The tab bar is in normal flow under the screen's scroll region, so a
 * screen's composer stays above it, and it pads for the safe area.
 */
let { mountScreen, nav, path }: LayoutProps = $props();

const MAX_TABS = 5;
const uid = $props.id();
const mainId = `${uid}-main`;
let hashPath = $state(currentHashPath());
let moreOpen = $state(false);
let target: HTMLElement | undefined = $state();

$effect(() =>
  onNavigate(() => {
    hashPath = currentHashPath();
    moreOpen = false;
  })
);
$effect(() => {
  if (target) mountScreen(target);
});

const items = $derived(topLevelItems(resolveNav(nav ?? { sections: [] }, path ?? hashPath)));
const tabs = $derived(items.length > MAX_TABS ? items.slice(0, MAX_TABS - 1) : items);
const more = $derived(items.length > MAX_TABS ? items.slice(MAX_TABS - 1) : []);
const moreInTrail = $derived(more.some((item) => item.inTrail));
const current = $derived(items.find((item) => item.inTrail));
const title = $derived(current?.label ?? nav?.brand?.label ?? 'Home');

function tabItem(item: ResolvedNavItem) {
  const icon = navIconComponent(item.icon);
  const badge = navBadge(item.badge);
  return {
    label: item.label,
    href: item.href,
    active: item.inTrail,
    ...(icon ? { icon } : {}),
    ...(badge !== undefined ? { badge } : {}),
  };
}
</script>

<MobileAppShell {mainId} class="mx-auto w-full max-w-2xl device-frame:max-w-none" mainClass="flex flex-col">
  {#snippet header()}
    <MobileHeader {title} titleAs="p">
      {#snippet actions()}<LayoutChrome part="actions" {nav} compact class="flex-row" />{/snippet}
    </MobileHeader>
  {/snippet}
  <div bind:this={target} class="flex min-h-full flex-1 flex-col" data-py-layout="mobile-tabs"></div>
  {#snippet bottomNav()}
    {#if items.length}
      <div class="flex border-t border-border bg-surface/95 pb-safe px-safe backdrop-blur-md" data-py-tab-bar>
        <BottomNav
          items={tabs.map(tabItem)}
          fixed={false}
          label="Primary"
          class="min-w-0 flex-1 border-0 bg-transparent pb-0 px-0 backdrop-blur-none"
        />
        {#if more.length}
          <button
            type="button"
            class={cn(
              'relative flex min-h-14 w-1/5 shrink-0 flex-col items-center justify-center gap-0.5 px-2 py-1.5 text-[0.7rem] font-medium text-muted-foreground',
              'hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset',
              moreInTrail && 'text-primary'
            )}
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            onclick={() => (moreOpen = true)}
          >
            <Ellipsis class="size-5" aria-hidden="true" />
            <span>More</span>
            {#if moreInTrail}<span class="sr-only">(contains the current page)</span>{/if}
          </button>
        {/if}
      </div>
    {/if}
  {/snippet}
</MobileAppShell>

<BottomSheet bind:open={moreOpen} title="More">
  <nav aria-label="More">
    <ul class="grid gap-1">
      {#each more as item (item.id)}
        {@const badge = navBadge(item.badge)}
        <li>
          <a
            href={item.href}
            aria-current={item.active ? 'page' : undefined}
            class="flex min-h-touch items-center gap-3 rounded-md px-3 text-sm font-medium hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none aria-[current=page]:bg-primary/10 aria-[current=page]:font-semibold aria-[current=page]:[&_svg]:text-primary [&_svg]:size-5"
            onclick={() => (moreOpen = false)}
          >
            <NavIcon icon={item.icon} />
            <span class="truncate">{item.label}</span>
            {#if badge !== undefined}
              <span class="ml-auto rounded-full bg-foreground/10 px-1.5 text-xs tabular-nums">{badge}</span>
            {/if}
          </a>
        </li>
      {/each}
    </ul>
  </nav>
  {#if nav?.user}
    <div class="mt-3 border-t border-border pt-3"><LayoutChrome part="user" {nav} /></div>
  {/if}
</BottomSheet>
