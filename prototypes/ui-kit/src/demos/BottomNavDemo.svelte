<script lang="ts">
import { Bell, House, Search, User } from '@lucide/svelte';
import { BottomNav, Button, type NavItem } from '@protoyard/ui';
import { interceptDemoNav } from './nav.ts';

let current = $state('#demo/tabs/home');
let alerts = $state(4);

const items: NavItem[] = $derived(
  [
    { label: 'Home', href: '#demo/tabs/home', icon: House },
    { label: 'Search', href: '#demo/tabs/search', icon: Search },
    {
      label: 'Alerts',
      href: '#demo/tabs/alerts',
      icon: Bell,
      badge: alerts > 0 ? alerts : undefined,
    },
    { label: 'Profile', href: '#demo/tabs/profile', icon: User },
  ].map((item) => ({ ...item, active: item.href === current }))
);
const title = $derived(items.find((item) => item.active)?.label ?? 'Home');

function navigate(href: string): void {
  current = href;
  if (href.endsWith('/alerts')) alerts = 0;
}
</script>

<div class="mx-auto flex h-[420px] max-w-[390px] flex-col overflow-hidden rounded-[2rem] border-4 border-border bg-background">
  <div class="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
    <p class="font-heading text-lg font-semibold">{title}</p>
    <p class="text-sm text-muted-foreground">Tap a tab. Opening Alerts clears its badge.</p>
    <Button
      type="button"
      class="text-xs font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      onclick={() => (alerts += 1)}
    >
      Simulate a new alert
    </Button>
  </div>
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div onclick={(event) => interceptDemoNav(event, navigate)}>
    <BottomNav {items} fixed={false} label="Demo tabs" />
  </div>
</div>
