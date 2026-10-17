<script lang="ts">
import { Activity, Settings, Users } from '@lucide/svelte';
import { type TabItem, Tabs } from '@protoyard/ui';

let view = $state('overview');
let section = $state('members');

const views: TabItem[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'activity', label: 'Activity', icon: Activity },
  { value: 'settings', label: 'Settings', icon: Settings },
];
const sections: TabItem[] = [
  { value: 'members', label: 'Members', icon: Users, badge: 12 },
  { value: 'invites', label: 'Invites', badge: 3 },
  { value: 'billing', label: 'Billing (owners only)', disabled: true },
];

const bodies: Record<string, string> = {
  overview: 'Project health is green. 18 of 24 tasks are done this sprint.',
  activity: 'Ana moved “Onboarding emails” to Done 5 minutes ago.',
  settings: 'Visibility: workspace. Default assignee: none.',
  members: '12 people have access to this workspace.',
  invites: '3 invitations are pending for example.com addresses.',
  billing: '',
};
</script>

<div class="grid gap-8">
  <div class="grid gap-2">
    <p class="text-xs text-muted-foreground">Segmented (default)</p>
    <Tabs items={views} bind:value={view} label="Project views">
      {#snippet content(item)}
        <p class="rounded-lg border border-border bg-surface p-4 text-sm">{bodies[item.value]}</p>
      {/snippet}
    </Tabs>
  </div>
  <div class="grid gap-2">
    <p class="text-xs text-muted-foreground">Underline with badges and a disabled tab</p>
    <Tabs items={sections} bind:value={section} variant="underline" label="Workspace sections">
      {#snippet content(item)}
        <p class="py-2 text-sm text-muted-foreground">{bodies[item.value]}</p>
      {/snippet}
    </Tabs>
    <p class="text-xs text-muted-foreground" aria-live="polite">
      Values: {view} / {section}. Use the arrow keys inside a tab list.
    </p>
  </div>
</div>
