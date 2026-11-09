<script lang="ts">
import {
  ArrowRight,
  CircleHelp,
  Cloud,
  Link2,
  Pencil,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Trash2,
} from '@lucide/svelte';
import { can, liveQuery, runService } from '@protoyard/renderer-svelte';
import {
  Badge,
  Button,
  Dialog,
  EmptyState,
  Input,
  Notice,
  Select,
  Separator,
  Switch,
} from '@protoyard/ui';
import { onMount } from 'svelte';
import { Icon } from 'texuli/icons';
import { LucideIcon } from 'texuli/icons/lucide';
import { Box, Heading, Text } from 'texuli/typography';
import { type ConnectedItem, PROVIDERS, type Provider } from './database/schema.ts';
import { CAPABILITIES } from './domain/policy.ts';
import { providePlugin } from './lib/context.ts';

const { db, services } = providePlugin();
const items = liveQuery(() => db.connectedItems.orderBy('updatedAt').reverse().toArray(), {
  initial: [],
});
const settings = liveQuery(() => db.settings.get('workspace'), { initial: undefined });
let consentOpen = $state(false);
let connectProvider = $state<Provider>(PROVIDERS[0]);
let connectEmail = $state('olivia.hart@example.com');
let editId = $state<string | null>(null);
let editLabel = $state('');
let editEmail = $state('');
let addOpen = $state(false);
let addProvider = $state<Provider>(PROVIDERS[0]);
let addLabel = $state('');
let addEmail = $state('');
let busy = $state(false);
let autoSync = $state(true);
let notifyOnChange = $state(true);
const canManage = $derived(can(CAPABILITIES.manage));
const currentItems = $derived(items.current ?? []);

$effect(() => {
  const value = settings.current;
  if (value) {
    autoSync = value.autoSync;
    notifyOnChange = value.notifyOnChange;
  }
});

onMount(() => {
  if (!settings.current) void services.saveSettings({ autoSync: true, notifyOnChange: true });
});

async function saveSettings() {
  await runService(() => services.saveSettings({ autoSync, notifyOnChange }), {
    errorTitle: 'Settings not saved',
  });
}

async function connect() {
  busy = true;
  try {
    const result = await runService(() => services.connectAccount(connectProvider, connectEmail), {
      success: 'Account connected (simulation)',
      errorTitle: 'Could not connect account',
    });
    if (result.ok) consentOpen = false;
  } finally {
    busy = false;
  }
}

function startEdit(item: ConnectedItem) {
  editId = item.id;
  editLabel = item.label;
  editEmail = item.account;
}

async function saveEdit(item: ConnectedItem) {
  const result = await runService(
    () =>
      services.update(item.id, {
        label: editLabel,
        provider: item.provider,
        account: editEmail,
        syncState: item.syncState,
      }),
    { success: 'Connection updated', errorTitle: 'Could not update connection' }
  );
  if (result.ok) editId = null;
}

async function addConnection(event: SubmitEvent) {
  event.preventDefault();
  const result = await runService(
    () =>
      services.create({
        label: addLabel,
        provider: addProvider,
        account: addEmail,
        syncState: 'active',
      }),
    { success: 'Connection added', errorTitle: 'Could not add connection' }
  );
  if (result.ok) {
    addOpen = false;
    addLabel = '';
    addEmail = '';
  }
}
</script>

<svelte:head>
  <title>Connections · Orbit Connect</title>
</svelte:head>

<Box surface="default" radius="none" padding="none" class="mx-auto flex min-h-app w-full max-w-md flex-col">
  <Box as="header" surface="default" border="block-end" radius="none" padding="none" class="flex h-16 flex-none items-center gap-2.5 px-4">
    <Box surface="muted" radius="md" padding="sm" class="grid flex-none place-items-center" aria-hidden="true"><LucideIcon icon={Link2} size="sm" tone="primary" /></Box>
    <div class="min-w-0 flex-1"><Text size="xs" tone="muted" weight="semibold" transform="uppercase" tracking="wide">ORBIT WORKSPACE</Text><Heading level={1} size="sm" truncate>Connections</Heading></div>
    <Button variant="ghost" size="icon" aria-label="Help"><LucideIcon icon={CircleHelp} size="sm" /></Button>
    <Button variant="ghost" size="icon" aria-label="Settings" onclick={() => document.getElementById('settings')?.scrollIntoView({ behavior: 'smooth' })}><LucideIcon icon={Settings2} size="sm" /></Button>
  </Box>

  <main class="min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-4">
    <Box as="section" surface="muted" border="default" radius="lg" padding="md" class="flex items-center gap-3">
      <Box surface="default" radius="md" padding="sm" class="grid flex-none place-items-center"><LucideIcon icon={Cloud} size="md" tone="primary" /></Box>
      <div><Heading level={2} size="sm">Your work, in sync</Heading><Text size="xs" tone="muted" class="mt-0.5">Bring your favorite tools into one calm workspace.</Text></div>
      <Badge variant="secondary" class="ml-auto">{currentItems.length}</Badge>
    </Box>

    <section class="mt-6" aria-labelledby="connected-heading">
      <div class="flex items-center justify-between gap-2.5"><div><Text size="xs" tone="muted" weight="semibold" transform="uppercase" tracking="wide" class="mb-1">WORKSPACE</Text><Heading level={2} size="md" id="connected-heading">Connected items</Heading></div><Button variant="ghost" size="sm" onclick={() => (addOpen = !addOpen)} disabled={!canManage}><Icon icon="plus" size="sm" /> Add</Button></div>
      <Text size="xs" tone="muted" class="mb-3 mt-1.5">Manage the tools and accounts available in this panel.</Text>

      {#if addOpen}
        <Box surface="muted" border="default" radius="lg" padding="md" class="mb-2.5">
          <form class="grid gap-2" onsubmit={addConnection}>
            <Text as="label" size="xs" tone="muted" weight="medium" class="grid gap-1">Connection name<Input bind:value={addLabel} placeholder="e.g. Product roadmap" required maxlength={48} /></Text>
            <Text as="label" size="xs" tone="muted" weight="medium" class="grid gap-1">Service<Select bind:value={addProvider} items={PROVIDERS.map((provider) => ({ value: provider, label: provider }))} /></Text>
            <Text as="label" size="xs" tone="muted" weight="medium" class="grid gap-1">Account email<Input bind:value={addEmail} type="email" placeholder="name@example.com" required /></Text>
            <div class="mt-1 flex justify-end gap-2"><Button type="button" variant="secondary" size="sm" onclick={() => (addOpen = false)}>Cancel</Button><Button size="sm" type="submit">Save item</Button></div>
          </form>
        </Box>
      {/if}

      <div class="grid gap-2">
        {#each currentItems as item (item.id)}
          <Box as="article" surface="default" border="default" radius="lg" padding="sm" elevation="sm" class="flex min-w-0 items-start gap-2.5">
            <Box surface="muted" radius="md" padding="sm" class="grid flex-none place-items-center" aria-hidden="true">{#if item.provider === 'Northstar Drive'}<LucideIcon icon={Cloud} size="sm" tone="primary" />{:else if item.provider === 'Copperline Calendar'}<LucideIcon icon={RefreshCw} size="sm" tone="primary" />{:else}<Icon icon="check" size="sm" tone="primary" />{/if}</Box>
            <div class="min-w-0 flex-1">
              {#if editId === item.id}
                <div class="mb-1.5 grid gap-1"><Input aria-label="Connection name" bind:value={editLabel} maxlength={48} /><Input aria-label="Account email" type="email" bind:value={editEmail} /></div>
              {:else}
                <Heading level={3} size="sm" truncate>{item.label}</Heading><Text size="xs" tone="muted" truncate class="mb-1.5 mt-0.5">{item.provider} <span aria-hidden="true">·</span> {item.account}</Text>
              {/if}
              <Badge variant={item.syncState === 'paused' ? 'warning' : 'success'}>{item.syncState === 'active' ? 'Syncing' : 'Paused'}</Badge>
            </div>
            {#if canManage}
              <div class="flex">
                {#if editId === item.id}
                  <Button variant="ghost" size="icon" class="size-7" aria-label="Save connection" onclick={() => saveEdit(item)}><Icon icon="check" size="sm" /></Button>
                  <Button variant="ghost" size="icon" class="size-7" aria-label="Cancel editing" onclick={() => (editId = null)}><Icon icon="close" size="sm" /></Button>
                {:else}
                  <Button variant="ghost" size="icon" class="size-7" aria-label={`Edit ${item.label}`} onclick={() => startEdit(item)}><LucideIcon icon={Pencil} size="sm" /></Button>
                  <Button variant="ghost" tone="destructive" size="icon" class="size-7" aria-label={`Delete ${item.label}`} onclick={() => runService(() => services.remove(item.id), { success: 'Connection removed', errorTitle: 'Could not remove connection' })}><LucideIcon icon={Trash2} size="sm" /></Button>
                {/if}
              </div>
            {/if}
          </Box>
        {:else}
          <EmptyState size="sm" icon={Link2} title="No connections yet" description="Connect a fictional account to see it here." />
        {/each}
      </div>
      {#if canManage}
        <Button class="mt-2.5 w-full" onclick={() => (consentOpen = true)}><Icon icon="plus" size="sm" /> Connect account <LucideIcon icon={ArrowRight} size="sm" /></Button>
      {/if}
    </section>

    <Box as="section" id="settings" surface="default" border="default" radius="lg" padding="md" class="mt-6" aria-labelledby="settings-heading">
      <div class="flex items-center justify-between gap-2.5"><div><Text size="xs" tone="muted" weight="semibold" transform="uppercase" tracking="wide" class="mb-1">PREFERENCES</Text><Heading level={2} size="md" id="settings-heading">Panel settings</Heading></div><Icon icon="chevron-down" size="sm" tone="neutral" /></div>
      <label class="flex items-center justify-between gap-3 py-3"><span class="flex flex-col gap-0.5"><Text as="span" size="sm" weight="medium">Automatic sync</Text><Text as="span" size="xs" tone="muted">Keep connected items up to date</Text></span><Switch bind:checked={autoSync} disabled={!can(CAPABILITIES.settings)} onCheckedChange={saveSettings} /></label>
      <Separator />
      <label class="flex items-center justify-between gap-3 py-3"><span class="flex flex-col gap-0.5"><Text as="span" size="sm" weight="medium">Change notifications</Text><Text as="span" size="xs" tone="muted">Show a note when an item updates</Text></span><Switch bind:checked={notifyOnChange} disabled={!can(CAPABILITIES.settings)} onCheckedChange={saveSettings} /></label>
      <Notice tone="brand" icon={ShieldCheck} text="Connections are simulated and stored only in this browser. No provider is contacted." />
    </Box>
  </main>

  <Box as="footer" surface="default" border="block-start" radius="none" padding="none" class="flex min-h-11 items-center justify-between gap-1.5 px-3"><Text as="span" size="xs" tone="muted">Orbit Connect <span aria-hidden="true">·</span> fictional workspace</Text><Text as="span" size="xs" tone="muted">All providers simulated</Text></Box>
</Box>

<Dialog bind:open={consentOpen} title="Connect an account" description="This preview stays in Protoyard. It does not open a provider or share data." size="md" hideClose>
  {#snippet children()}
      <Button variant="ghost" size="icon" class="absolute right-3 top-3" aria-label="Close simulated connection" onclick={() => (consentOpen = false)}><Icon icon="close" size="sm" /></Button>
      <Box surface="muted" radius="lg" padding="sm" class="mb-3 inline-grid place-items-center"><LucideIcon icon={ShieldCheck} size="md" tone="primary" /></Box>
      <Text size="xs" tone="muted" weight="semibold" transform="uppercase" tracking="wide">SIMULATED ACCOUNT CONNECTION</Text>
      <Text as="label" size="xs" tone="muted" weight="medium" class="mt-2.5 grid gap-1">Choose a service<Select bind:value={connectProvider} items={PROVIDERS.map((provider) => ({ value: provider, label: provider }))} /></Text>
      <Text as="label" size="xs" tone="muted" weight="medium" class="mt-2.5 grid gap-1">Fictional account email<Input bind:value={connectEmail} type="email" required /></Text>
      <Notice tone="info" title="Simulation only" text="No OAuth redirect, credentials, or network request." class="mt-3" />
      <Button class="mt-3 w-full" disabled={!canManage} loading={busy} loadingLabel="Connecting…" onclick={connect}><LucideIcon icon={ArrowRight} size="sm" /> Approve simulated connection</Button>
      <Button variant="ghost" class="mt-1 w-full" onclick={() => (consentOpen = false)}>Cancel</Button>
  {/snippet}
</Dialog>
