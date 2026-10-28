<script lang="ts">
import { Bell } from '@lucide/svelte';
import { Badge, Breadcrumb, Button, DropdownMenu, Header, toast } from '@protoyard/ui';
import { Icon } from 'texuli/icons';
import { LucideIcon } from 'texuli/icons/lucide';
import { interceptDemoNav } from './nav.ts';

let notifications = $state(2);
let menuClicks = $state(0);
let range = $state('This week');
</script>

<div class="grid gap-6">
  <div class="overflow-hidden rounded-xl border border-border">
    <Header
      title="Projects"
      description={`12 active · ${range}`}
      sticky={false}
      onMenuClick={() => (menuClicks += 1)}
    >
      {#snippet actions()}
        <DropdownMenu
          items={['Today', 'This week', 'This month'].map((label) => ({
            label,
            onSelect: () => (range = label),
          }))}
        >
          {#snippet trigger({ props })}
            <Button {...props} variant="outline" size="sm">{range}</Button>
          {/snippet}
        </DropdownMenu>
        <Button
          size="icon"
          variant="ghost"
          aria-label={`Notifications (${notifications} unread)`}
          class="relative"
          onclick={() => (notifications = 0)}
        >
          <LucideIcon icon={Bell} />
          {#if notifications > 0}
            <span class="absolute top-1 right-1 size-2 rounded-full bg-destructive" aria-hidden="true"></span>
          {/if}
        </Button>
        <Button size="sm" onclick={() => toast.success('Project created (demo)')}>
          <Icon icon="plus" aria-hidden="true" /> New
        </Button>
      {/snippet}
    </Header>
    <p class="px-6 py-4 text-xs text-muted-foreground">
      The menu button only shows below the lg breakpoint. Pressed {menuClicks} time{menuClicks === 1 ? '' : 's'}.
    </p>
  </div>

  <div class="overflow-hidden rounded-xl border border-border">
    <Header titleAs="p" sticky={false}>
      {#snippet leading()}
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
        <div onclick={(event) => interceptDemoNav(event, () => toast.info('Breadcrumb clicked'))}>
          <Breadcrumb
            items={[
              { label: 'Projects', href: '#demo/header/projects' },
              { label: 'Atlas', href: '#demo/header/atlas' },
              { label: 'Settings' },
            ]}
          />
        </div>
      {/snippet}
      {#snippet actions()}
        <Badge variant="success">Saved</Badge>
      {/snippet}
    </Header>
    <p class="px-6 py-4 text-xs text-muted-foreground">With a leading breadcrumb instead of a title.</p>
  </div>
</div>
