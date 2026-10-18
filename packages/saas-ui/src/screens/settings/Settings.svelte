<script lang="ts">
import { navigate } from '@protoyard/renderer-svelte';
import { Button } from '@protoyard/ui';
import Members from './Members.svelte';
import Notifications from './Notifications.svelte';
import Profile from './Profile.svelte';
import Security from './Security.svelte';

interface Props {
  params?: Record<string, string>;
}
let { params = {} }: Props = $props();
const tabs = [
  { id: 'profile', label: 'Profile' },
  { id: 'security', label: 'Security' },
  { id: 'members', label: 'Members' },
  { id: 'notifications', label: 'Notifications' },
] as const;
type SettingsTab = (typeof tabs)[number]['id'];
const active = $derived(
  tabs.some((tab) => tab.id === params.tab) ? (params.tab as SettingsTab) : 'profile'
);
</script>

<main class="mx-auto grid w-full max-w-4xl gap-6 p-4 sm:p-8" data-testid="saas-settings">
  <header><h1 class="text-2xl font-semibold">Settings</h1><p class="mt-1 text-sm text-muted-foreground">Manage your profile, security, workspace members, and notification preferences.</p></header>
  <div class="grid gap-6 md:grid-cols-[12rem_1fr]">
    <div class="flex gap-2 overflow-x-auto md:flex-col" aria-label="Settings sections" role="tablist" aria-orientation="vertical">
      {#each tabs as tab (tab.id)}
        <Button role="tab" aria-selected={active === tab.id} variant={active === tab.id ? 'secondary' : 'ghost'} class="justify-start" onclick={() => navigate(tab.id === 'profile' ? '/settings' : `/settings/${tab.id}`)}>{tab.label}</Button>
      {/each}
    </div>
    <div class="min-w-0 rounded-lg border border-border bg-surface p-4 sm:p-6">
      {#if active === 'profile'}<Profile />
      {:else if active === 'security'}<Security />
      {:else if active === 'members'}<Members />
      {:else}<Notifications />{/if}
    </div>
  </div>
</main>
