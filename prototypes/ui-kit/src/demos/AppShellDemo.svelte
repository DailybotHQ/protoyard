<script lang="ts">
import { FolderKanban, House, Inbox, Settings } from '@lucide/svelte';
import { AppShell, Avatar, Header, Sidebar, type SidebarSection } from '@protoyard/ui';
import { interceptDemoNav } from './nav.ts';

const pages: Record<string, { title: string; body: string }> = {
  '#demo/shell/home': { title: 'Home', body: 'Welcome back. You have 4 tasks due today.' },
  '#demo/shell/inbox': { title: 'Inbox', body: '3 unread messages from your team.' },
  '#demo/shell/projects': { title: 'Projects', body: '6 active projects across 2 teams.' },
  '#demo/shell/settings': { title: 'Settings', body: 'Workspace name, members and billing.' },
};

let current = $state('#demo/shell/home');
let sidebarOpen = $state(false);
let collapsed = $state(false);
const page = $derived(pages[current] ?? { title: 'Home', body: '' });

const sections: SidebarSection[] = $derived([
  {
    label: 'Workspace',
    items: [
      {
        label: 'Home',
        href: '#demo/shell/home',
        icon: House,
        active: current === '#demo/shell/home',
      },
      {
        label: 'Inbox',
        href: '#demo/shell/inbox',
        icon: Inbox,
        badge: 3,
        active: current === '#demo/shell/inbox',
      },
      {
        label: 'Projects',
        href: '#demo/shell/projects',
        icon: FolderKanban,
        active: current === '#demo/shell/projects',
      },
    ],
  },
  {
    label: 'Admin',
    items: [
      {
        label: 'Settings',
        href: '#demo/shell/settings',
        icon: Settings,
        active: current === '#demo/shell/settings',
      },
    ],
  },
]);
</script>

<!-- The frame contains the shell; its sidebar column is sized to the frame instead of the viewport. -->
<div class="relative h-[460px] overflow-hidden rounded-xl border border-border">
  <AppShell
    bind:sidebarOpen
    mainId="app-shell-demo-main"
    sidebarLabel="Demo navigation"
    class="h-full min-h-0 [&>div:first-of-type]:h-full"
    mainClass="overflow-y-auto"
  >
    {#snippet sidebar()}
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
      <div class="flex h-full w-full" onclick={(event) => interceptDemoNav(event, (href) => (current = href))}>
        <Sidebar bind:collapsed {sections} label="Demo">
          {#snippet header({ collapsed: isCollapsed })}
            <span class="flex items-center gap-2 font-heading font-semibold">
              <span class="flex size-7 items-center justify-center rounded-md bg-primary text-xs text-primary-foreground" aria-hidden="true">A</span>
              {#if !isCollapsed}Acme Inc.{/if}
            </span>
          {/snippet}
        </Sidebar>
      </div>
    {/snippet}
    {#snippet header()}
      <Header title={page.title} description="AppShell demo">
        {#snippet actions()}
          <Avatar name="Jordan Example" size="sm" />
        {/snippet}
      </Header>
    {/snippet}
    <div class="grid gap-3 p-6">
      <p class="text-sm">{page.body}</p>
      <p class="text-xs text-muted-foreground">
        Below the lg breakpoint the sidebar moves into a drawer opened from the header menu button.
        Drawer is {sidebarOpen ? 'open' : 'closed'}; sidebar is {collapsed ? 'collapsed' : 'expanded'}.
      </p>
    </div>
  </AppShell>
</div>
