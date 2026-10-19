<script lang="ts">
import { Menu } from '@lucide/svelte';
import Sidebar from '../components/sidebar/Sidebar.svelte';
import LayoutChrome from './LayoutChrome.svelte';
import LayoutDrawer from './LayoutDrawer.svelte';
import { closeWhenWide, currentHashPath, onNavigate, sidebarSections } from './layout-kit.ts';
import { resolveNav } from './nav-model.ts';
import type { LayoutProps } from './registry.ts';

/*
 * Sidebar layout (ADR-023): the `<Sidebar>` column beside the screen, a
 * drawer behind a menu button below 48rem of its own width (a container
 * query, so it follows the shell's inner width, not the viewport).
 */
let { mountScreen, nav, path }: LayoutProps = $props();

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

const sections = $derived(sidebarSections(resolveNav(nav ?? { sections: [] }, path ?? hashPath)));
const title = $derived(nav?.brand?.label ?? 'Navigation');
</script>

{#snippet column()}
  <Sidebar {sections} collapsible={false} label="Main">
    {#snippet header()}<LayoutChrome part="brand" {nav} />{/snippet}
    {#snippet footer()}
      <LayoutChrome part="actions" {nav} class="flex-wrap" />
      <LayoutChrome part="user" {nav} />
    {/snippet}
  </Sidebar>
{/snippet}

<div bind:this={root} class="@container flex min-h-app bg-background text-foreground" data-py-layout="sidebar">
  <LayoutChrome part="skip" {mainId} />
  <aside
    aria-label={title}
    class="sticky top-0 hidden h-app shrink-0 @min-[48rem]:flex"
    data-py-layout-column
  >
    {@render column()}
  </aside>
  <div class="flex min-w-0 flex-1 flex-col">
    <header
      class="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-background/95 px-3 backdrop-blur @min-[48rem]:hidden"
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
</div>

<LayoutDrawer bind:open={drawerOpen} label={title}>{@render column()}</LayoutDrawer>
