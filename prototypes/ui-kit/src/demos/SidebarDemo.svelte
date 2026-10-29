<script lang="ts">
import { Calendar, FileText, House, Inbox, LifeBuoy, Users } from '@lucide/svelte';
import { Avatar, Button, Sidebar, type SidebarSection } from '@protoyard/ui';
import { LucideIcon } from 'texuli/icons/lucide';
import { sampleFace } from './faces.ts';
import { interceptDemoNav } from './nav.ts';

let current = $state('#demo/side/home');
let collapsed = $state(false);
let unread = $state(5);

const label = (href: string): string => href.split('/').pop() ?? '';

const sections: SidebarSection[] = $derived(
  [
    {
      items: [
        { label: 'Home', href: '#demo/side/home', icon: House },
        {
          label: 'Inbox',
          href: '#demo/side/inbox',
          icon: Inbox,
          badge: unread > 0 ? unread : undefined,
        },
        { label: 'Calendar', href: '#demo/side/calendar', icon: Calendar },
      ],
    },
    {
      label: 'Team',
      items: [
        { label: 'People', href: '#demo/side/people', icon: Users, badge: 'New' },
        { label: 'Docs', href: '#demo/side/docs', icon: FileText },
      ],
    },
  ].map((section) => ({
    ...section,
    items: section.items.map((item) => ({ ...item, active: item.href === current })),
  }))
);

function navigate(href: string): void {
  current = href;
  if (href.endsWith('/inbox')) unread = 0;
}
</script>

<div class="flex h-[440px] overflow-hidden rounded-xl border border-border">
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="flex h-full" onclick={(event) => interceptDemoNav(event, navigate)}>
    <Sidebar bind:collapsed {sections} label="Demo sidebar">
      {#snippet header({ collapsed: isCollapsed })}
        <span class="flex items-center gap-2 font-heading font-semibold">
          <span class="flex size-7 items-center justify-center rounded-md bg-primary text-xs text-primary-foreground" aria-hidden="true">N</span>
          {#if !isCollapsed}Northwind{/if}
        </span>
      {/snippet}
      {#snippet footer({ collapsed: isCollapsed })}
        <a
          href="#demo/side/help"
          class="flex h-9 items-center gap-3 rounded-md px-3 text-sm text-sidebar-foreground/80 hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none {isCollapsed ? 'justify-center px-0' : ''}"
          aria-current={current === '#demo/side/help' ? 'page' : undefined}
        >
          <LucideIcon icon={LifeBuoy} class="size-4" />
          <span class={isCollapsed ? 'sr-only' : undefined}>Help center</span>
        </a>
      {/snippet}
    </Sidebar>
  </div>
  <div class="grid min-w-0 flex-1 content-start gap-3 bg-background p-6">
    <p class="font-heading text-lg font-semibold capitalize">{label(current)}</p>
    <p class="text-sm text-muted-foreground">
      Click items to change the active page. Collapse for icons-only mode with tooltips.
    </p>
    <div class="flex items-center gap-2 text-xs text-muted-foreground">
      <Avatar name="Jordan Example" {...sampleFace('Jordan Example')} size="xs" decorative /> Signed in as Jordan · {collapsed ? 'collapsed' : 'expanded'}
    </div>
    <Button
      type="button"
      variant="link"
      class="justify-self-start text-xs font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      onclick={() => (unread += 1)}
    >
      Simulate a new inbox message
    </Button>
  </div>
</div>
