<script lang="ts">
import {
  ArrowRight,
  Check,
  ChevronDown,
  CircleHelp,
  Cloud,
  Link2,
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Trash2,
  X,
} from '@lucide/svelte';
import { can, liveQuery, runService } from '@protoyard/renderer-svelte';
import { onMount } from 'svelte';
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
    <div class="brand-mark" aria-hidden="true"><Link2 size={17} /></div>
    <div class="brand-copy"><p class="eyebrow">ORBIT WORKSPACE</p><h1>Connections</h1></div>
    <button class="icon-button" aria-label="Help"><CircleHelp size={17} /></button>
    <button class="icon-button" aria-label="Settings" onclick={() => document.getElementById('settings')?.scrollIntoView({ behavior: 'smooth' })}><Settings2 size={17} /></button>
  </header>

  <main>
    <section class="intro-card">
      <div class="intro-icon"><Cloud size={20} /></div>
      <div><h2>Your work, in sync</h2><p>Bring your favorite tools into one calm workspace.</p></div>
      <span class="connected-count">{currentItems.length}</span>
    </section>

    <section class="section-block" aria-labelledby="connected-heading">
      <div class="section-title"><div><p class="eyebrow">WORKSPACE</p><h2 id="connected-heading">Connected items</h2></div><button class="text-button" onclick={() => (addOpen = !addOpen)} disabled={!canManage}><Plus size={15} /> Add</button></div>
      <p class="section-hint">Manage the tools and accounts available in this panel.</p>

      {#if addOpen}
        <form class="edit-card" onsubmit={addConnection}>
          <label>Connection name<input bind:value={addLabel} placeholder="e.g. Product roadmap" required maxlength="48" /></label>
          <label>Service<select bind:value={addProvider}>{#each PROVIDERS as provider}<option value={provider}>{provider}</option>{/each}</select></label>
          <label>Account email<input bind:value={addEmail} type="email" placeholder="name@example.com" required /></label>
          <div class="form-actions"><button type="button" class="quiet-button" onclick={() => (addOpen = false)}>Cancel</button><button class="primary-button" type="submit">Save item</button></div>
        </form>
      {/if}

      <div class="item-list">
        {#each currentItems as item (item.id)}
          <article class="connection-card">
            <div class="service-icon" aria-hidden="true">{#if item.provider === 'Northstar Drive'}<Cloud size={17} />{:else if item.provider === 'Copperline Calendar'}<RefreshCw size={17} />{:else}<Check size={17} />{/if}</div>
            <div class="connection-main">
              {#if editId === item.id}
                <div class="inline-edit"><input aria-label="Connection name" bind:value={editLabel} maxlength="48" /><input aria-label="Account email" type="email" bind:value={editEmail} /></div>
              {:else}
                <h3>{item.label}</h3><p>{item.provider} <span aria-hidden="true">·</span> {item.account}</p>
              {/if}
              <span class:paused={item.syncState === 'paused'} class="status-pill"><span></span>{item.syncState === 'active' ? 'Syncing' : 'Paused'}</span>
            </div>
            {#if canManage}
              <div class="row-actions">
                {#if editId === item.id}
                  <button class="icon-button" aria-label="Save connection" onclick={() => void saveEdit(item)}><Check size={16} /></button>
                  <button class="icon-button" aria-label="Cancel editing" onclick={() => (editId = null)}><X size={16} /></button>
                {:else}
                  <button class="icon-button" aria-label={`Edit ${item.label}`} onclick={() => startEdit(item)}><Pencil size={15} /></button>
                  <button class="icon-button danger" aria-label={`Delete ${item.label}`} onclick={() => void runService(() => services.remove(item.id), { success: 'Connection removed', errorTitle: 'Could not remove connection' })}><Trash2 size={15} /></button>
                {/if}
              </div>
            {/if}
          </article>
        {:else}
          <div class="empty-state"><span><Link2 size={18} /></span><h3>No connections yet</h3><p>Connect a fictional account to see it here.</p></div>
        {/each}
      </div>
      {#if canManage}
        <button class="connect-button" onclick={() => (consentOpen = true)}><Plus size={16} /> Connect account <ArrowRight size={15} /></button>
      {/if}
    </section>

    <section id="settings" class="section-block settings-block" aria-labelledby="settings-heading">
      <div class="section-title"><div><p class="eyebrow">PREFERENCES</p><h2 id="settings-heading">Panel settings</h2></div><ChevronDown size={16} class="muted-icon" /></div>
      <label class="setting-row"><span><strong>Automatic sync</strong><small>Keep connected items up to date</small></span><input type="checkbox" role="switch" bind:checked={autoSync} disabled={!can(CAPABILITIES.settings)} onchange={saveSettings} /></label>
      <label class="setting-row"><span><strong>Change notifications</strong><small>Show a note when an item updates</small></span><input type="checkbox" role="switch" bind:checked={notifyOnChange} disabled={!can(CAPABILITIES.settings)} onchange={saveSettings} /></label>
      <div class="privacy-note"><ShieldCheck size={16} /><p>Connections are simulated and stored only in this browser. No provider is contacted.</p></div>
    </section>
  </main>

  <footer><span>Orbit Connect <b>·</b> fictional workspace</span><span class="footer-caption">All providers simulated</span></footer>
</div>

{#if consentOpen}
  <div class="dialog-backdrop" role="presentation">
    <dialog open class="consent-dialog" aria-modal="true" aria-labelledby="consent-title">
      <button class="dialog-close icon-button" aria-label="Close simulated connection" onclick={() => (consentOpen = false)}><X size={17} /></button>
      <div class="consent-mark"><ShieldCheck size={22} /></div>
      <p class="eyebrow">SIMULATED ACCOUNT CONNECTION</p>
      <h2 id="consent-title">Connect an account</h2>
      <p class="dialog-copy">This preview stays in Protoyard. It does not open a provider or share data.</p>
      <label>Choose a service<select bind:value={connectProvider}>{#each PROVIDERS as provider}<option value={provider}>{provider}</option>{/each}</select></label>
      <label>Fictional account email<input bind:value={connectEmail} type="email" required /></label>
      <div class="simulation-banner"><span class="simulation-dot"></span><span><strong>Simulation only</strong><small>No OAuth redirect, credentials, or network request.</small></span></div>
      <button class="primary-button consent-submit" disabled={busy || !canManage} onclick={() => void connect()}>{#if busy}<LoaderCircle class="spin" size={16} /> Connecting…{:else}<ArrowRight size={16} /> Approve simulated connection{/if}</button>
      <button class="quiet-button cancel-consent" onclick={() => (consentOpen = false)}>Cancel</button>
    </dialog>
  </div>
{/if}
