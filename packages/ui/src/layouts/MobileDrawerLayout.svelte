<script lang="ts">
import { Menu } from '@lucide/svelte';
import MobileAppShell from '../components/mobile-app-shell/MobileAppShell.svelte';
import MobileHeader from '../components/mobile-header/MobileHeader.svelte';
import Sidebar from '../components/sidebar/Sidebar.svelte';
import LayoutChrome from './LayoutChrome.svelte';
import LayoutDrawer from './LayoutDrawer.svelte';
import { currentHashPath, onNavigate, sidebarSections, topLevelItems } from './layout-kit.ts';
import { resolveNav } from './nav-model.ts';
import type { LayoutProps } from './registry.ts';

/*
 * Mobile drawer layout (ADR-023): `MobileAppShell` with a `MobileHeader`
 * (the current page's name, the actions and a menu button) and the whole
 * nav model in a side drawer: brand, sections, actions and the user. The
 * drawer opens on the device screen inside a phone frame and closes on
 * Escape, a link or any in-app navigation. No bottom bar, so a screen's
 * composer sits at the bottom edge above the safe area.
 */
let { mountScreen, nav, path }: LayoutProps = $props();

const uid = $props.id();
const mainId = `${uid}-main`;
let hashPath = $state(currentHashPath());
let drawerOpen = $state(false);
let target: HTMLElement | undefined = $state();

$effect(() => onNavigate(() => (hashPath = currentHashPath())));
$effect(() => {
  if (target) mountScreen(target);
});

const resolved = $derived(resolveNav(nav ?? { sections: [] }, path ?? hashPath));
const current = $derived(topLevelItems(resolved).find((item) => item.inTrail));
const title = $derived(current?.label ?? nav?.brand?.label ?? 'Home');
const menuLabel = $derived(nav?.brand?.label ?? 'Navigation');
</script>

<MobileAppShell {mainId} class="mx-auto w-full max-w-2xl device-frame:max-w-none" mainClass="flex flex-col">
  {#snippet header()}
    <MobileHeader {title} titleAs="p">
      {#snippet actions()}
        <LayoutChrome part="actions" {nav} compact class="flex-row" />
        {#if nav}
          <button
            type="button"
            class="-mr-2 inline-flex size-11 items-center justify-center rounded-md text-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            aria-haspopup="dialog"
            aria-expanded={drawerOpen}
            onclick={() => (drawerOpen = true)}
          >
            <Menu class="size-6" aria-hidden="true" />
            <span class="sr-only">Open navigation</span>
          </button>
        {/if}
      {/snippet}
    </MobileHeader>
  {/snippet}
  <div bind:this={target} class="flex min-h-full flex-1 flex-col pb-safe" data-py-layout="mobile-drawer"></div>
</MobileAppShell>

<LayoutDrawer bind:open={drawerOpen} label={menuLabel}>
  <Sidebar sections={sidebarSections(resolved)} collapsible={false} label="Main">
    {#snippet header()}<LayoutChrome part="brand" {nav} />{/snippet}
    {#snippet footer()}
      <LayoutChrome part="actions" {nav} class="flex-wrap" />
      <LayoutChrome part="user" {nav} />
    {/snippet}
  </Sidebar>
</LayoutDrawer>
