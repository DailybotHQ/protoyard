<script lang="ts">
import {
  ArrowRight,
  CircleHelp,
  Cloud,
  Link2,
  LoaderCircle,
  Pencil,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Trash2,
} from '@lucide/svelte';
import { can, liveQuery, runService } from '@protoyard/renderer-svelte';
import { Button, Dialog, Input, Select, Switch } from '@protoyard/ui';
import { onMount } from 'svelte';
import { Icon } from 'texuli/icons';
import { LucideIcon } from 'texuli/icons/lucide';
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

<div class="plugin-panel">
  <header class="topbar">
    <div class="brand-mark" aria-hidden="true"><LucideIcon icon={Link2} class="size-[17px]" /></div>
    <div class="brand-copy"><p class="eyebrow">ORBIT WORKSPACE</p><h1>Connections</h1></div>
    <Button class="icon-button" aria-label="Help"><LucideIcon icon={CircleHelp} class="size-[17px]" /></Button>
    <Button class="icon-button" aria-label="Settings" onclick={() => document.getElementById('settings')?.scrollIntoView({ behavior: 'smooth' })}><LucideIcon icon={Settings2} class="size-[17px]" /></Button>
  </header>

  <main>
    <section class="intro-card">
      <div class="intro-icon"><LucideIcon icon={Cloud} class="size-[20px]" /></div>
      <div><h2>Your work, in sync</h2><p>Bring your favorite tools into one calm workspace.</p></div>
      <span class="connected-count">{currentItems.length}</span>
    </section>

    <section class="section-block" aria-labelledby="connected-heading">
      <div class="section-title"><div><p class="eyebrow">WORKSPACE</p><h2 id="connected-heading">Connected items</h2></div><Button class="text-button" onclick={() => (addOpen = !addOpen)} disabled={!canManage}><Icon icon="plus" style="width:15px;height:15px" /> Add</Button></div>
      <p class="section-hint">Manage the tools and accounts available in this panel.</p>

      {#if addOpen}
        <form class="edit-card" onsubmit={addConnection}>
          <label>Connection name<Input bind:value={addLabel} placeholder="e.g. Product roadmap" required maxlength={48} /></label>
          <label>Service<Select bind:value={addProvider} items={PROVIDERS.map((provider) => ({ value: provider, label: provider }))} /></label>
          <label>Account email<Input bind:value={addEmail} type="email" placeholder="name@example.com" required /></label>
          <div class="form-actions"><Button type="button" class="quiet-button" onclick={() => (addOpen = false)}>Cancel</Button><Button class="primary-button" type="submit">Save item</Button></div>
        </form>
      {/if}

      <div class="item-list">
        {#each currentItems as item (item.id)}
          <article class="connection-card">
            <div class="service-icon" aria-hidden="true">{#if item.provider === 'Northstar Drive'}<LucideIcon icon={Cloud} class="size-[17px]" />{:else if item.provider === 'Copperline Calendar'}<LucideIcon icon={RefreshCw} class="size-[17px]" />{:else}<Icon icon="check" style="width:17px;height:17px" />{/if}</div>
            <div class="connection-main">
              {#if editId === item.id}
                <div class="inline-edit"><Input aria-label="Connection name" bind:value={editLabel} maxlength={48} /><Input aria-label="Account email" type="email" bind:value={editEmail} /></div>
              {:else}
                <h3>{item.label}</h3><p>{item.provider} <span aria-hidden="true">·</span> {item.account}</p>
              {/if}
              <span class:paused={item.syncState === 'paused'} class="status-pill"><span></span>{item.syncState === 'active' ? 'Syncing' : 'Paused'}</span>
            </div>
            {#if canManage}
              <div class="row-actions">
                {#if editId === item.id}
                  <Button variant="ghost" class="icon-button" aria-label="Save connection" onclick={() => saveEdit(item)}><Icon icon="check" style="width:16px;height:16px" /></Button>
                  <Button class="icon-button" aria-label="Cancel editing" onclick={() => (editId = null)}><Icon icon="close" style="width:16px;height:16px" /></Button>
                {:else}
                  <Button class="icon-button" aria-label={`Edit ${item.label}`} onclick={() => startEdit(item)}><LucideIcon icon={Pencil} class="size-[15px]" /></Button>
                  <Button variant="destructive" class="icon-button danger" aria-label={`Delete ${item.label}`} onclick={() => runService(() => services.remove(item.id), { success: 'Connection removed', errorTitle: 'Could not remove connection' })}><LucideIcon icon={Trash2} class="size-[15px]" /></Button>
                {/if}
              </div>
            {/if}
          </article>
        {:else}
          <div class="empty-state"><span><LucideIcon icon={Link2} class="size-[18px]" /></span><h3>No connections yet</h3><p>Connect a fictional account to see it here.</p></div>
        {/each}
      </div>
      {#if canManage}
        <Button variant="default" class="connect-button" onclick={() => (consentOpen = true)}><Icon icon="plus" style="width:16px;height:16px" /> Connect account <LucideIcon icon={ArrowRight} class="size-[15px]" /></Button>
      {/if}
    </section>

    <section id="settings" class="section-block settings-block" aria-labelledby="settings-heading">
      <div class="section-title"><div><p class="eyebrow">PREFERENCES</p><h2 id="settings-heading">Panel settings</h2></div><Icon icon="chevron-down" style="width:16px;height:16px" class="muted-icon" /></div>
      <label class="setting-row"><span><strong>Automatic sync</strong><small>Keep connected items up to date</small></span><Switch bind:checked={autoSync} disabled={!can(CAPABILITIES.settings)} onCheckedChange={saveSettings} /></label>
      <label class="setting-row"><span><strong>Change notifications</strong><small>Show a note when an item updates</small></span><Switch bind:checked={notifyOnChange} disabled={!can(CAPABILITIES.settings)} onCheckedChange={saveSettings} /></label>
      <div class="privacy-note"><LucideIcon icon={ShieldCheck} class="size-[16px]" /><p>Connections are simulated and stored only in this browser. No provider is contacted.</p></div>
    </section>
  </main>

  <footer><span>Orbit Connect <b>·</b> fictional workspace</span><span class="footer-caption">All providers simulated</span></footer>
</div>

<Dialog bind:open={consentOpen} title="Connect an account" description="This preview stays in Protoyard. It does not open a provider or share data." size="md" hideClose class="consent-dialog">
  {#snippet children()}
      <Button class="dialog-close icon-button" aria-label="Close simulated connection" onclick={() => (consentOpen = false)}><Icon icon="close" style="width:17px;height:17px" /></Button>
      <div class="consent-mark"><LucideIcon icon={ShieldCheck} class="size-[22px]" /></div>
      <p class="eyebrow">SIMULATED ACCOUNT CONNECTION</p>
      <label>Choose a service<Select bind:value={connectProvider} items={PROVIDERS.map((provider) => ({ value: provider, label: provider }))} /></label>
      <label>Fictional account email<Input bind:value={connectEmail} type="email" required /></label>
      <div class="simulation-banner"><span class="simulation-dot"></span><span><strong>Simulation only</strong><small>No OAuth redirect, credentials, or network request.</small></span></div>
      <Button variant="default" class="primary-button consent-submit" disabled={busy || !canManage} onclick={connect}>{#if busy}<LucideIcon icon={LoaderCircle} class="size-[16px] spin" /> Connecting…{:else}<LucideIcon icon={ArrowRight} class="size-[16px]" /> Approve simulated connection{/if}</Button>
      <Button class="quiet-button cancel-consent" onclick={() => (consentOpen = false)}>Cancel</Button>
  {/snippet}
</Dialog>
