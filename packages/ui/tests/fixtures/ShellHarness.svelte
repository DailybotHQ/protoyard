<script lang="ts">
import { House, Settings } from '@lucide/svelte';
import Header from '../../src/components/header/Header.svelte';
import Sidebar from '../../src/components/sidebar/Sidebar.svelte';
import { AppShell } from '../../src/index.ts';

let { collapsed = false }: { collapsed?: boolean } = $props();
let sidebarOpen = $state(false);
</script>

<AppShell bind:sidebarOpen>
  {#snippet sidebar()}
    <Sidebar
      bind:collapsed
      sections={[
        { label: 'Workspace', items: [{ label: 'Home', href: '#/', icon: House, active: true, badge: 3 }] },
        { label: 'Admin', items: [{ label: 'Settings', href: '#/settings', icon: Settings }] },
      ]}
    />
  {/snippet}
  {#snippet header()}
    <Header title="Dashboard" />
  {/snippet}
  <p>Body content</p>
</AppShell>
<p data-testid="drawer">{sidebarOpen ? 'open' : 'closed'}</p>
