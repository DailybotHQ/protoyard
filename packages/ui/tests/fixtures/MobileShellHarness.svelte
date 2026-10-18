<script lang="ts">
import { House, Settings } from '@lucide/svelte';
import BottomNav from '../../src/components/bottom-nav/BottomNav.svelte';
import MobileAppShell from '../../src/components/mobile-app-shell/MobileAppShell.svelte';
import MobileHeader from '../../src/components/mobile-header/MobileHeader.svelte';
</script>

<MobileAppShell>
  {#snippet header()}
    <MobileHeader title="My app" />
  {/snippet}
  {#snippet stickyFooter()}
    <div><button type="button">Save changes</button></div>
  {/snippet}
  <p>Scrollable screen content</p>
  {#snippet bottomNav()}
    <BottomNav
      fixed={false}
      items={[
        { label: 'Home', href: '#/home', icon: House, active: true },
        { label: 'Settings', href: '#/settings', icon: Settings },
      ]}
    />
  {/snippet}
</MobileAppShell>
