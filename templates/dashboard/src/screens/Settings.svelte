<script lang="ts">
import { Lock, ShieldCheck } from '@lucide/svelte';
import type { ColorMode } from '@protoyard/core';
import {
  avatarImage,
  can,
  isValidationError,
  liveQuery,
  runService,
  useAppearance,
  useClock,
  usePrincipal,
} from '@protoyard/renderer-svelte';
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardDescription,
  CardTitle,
  FormField,
  Input,
  Notice,
  RadioGroup,
  Select,
  Skeleton,
  Switch,
} from '@protoyard/ui';
import { LucideIcon } from 'texuli/icons/lucide';
import { Code } from 'texuli/kbd-code';
import { ListItem } from 'texuli/list-item';
import PageHeader from '../components/PageHeader.svelte';
import { CURRENCIES, type Currency } from '../database/schema.ts';
import { CAPABILITIES, ROLE_LABELS } from '../domain/policy.ts';
import { useDashboard } from '../lib/context.ts';
import { formatDate, fromNow } from '../lib/format.ts';

/**
 * Settings. Each card is gated by a capability, so the same screen shows
 * what each persona can and cannot do. Services enforce the same rules.
 */
const { db, runtime, services, settings } = useDashboard();
const principal = usePrincipal();
const appearance = useAppearance();
const clock = useClock();

const team = liveQuery(
  async () => {
    const [people, memberships] = await Promise.all([
      db.table('py_personas').toArray(),
      db.table('py_memberships').toArray(),
    ]);
    return memberships.map((m) => {
      const person = people.find((p) => p.id === m.personaId);
      return {
        id: m.personaId as string,
        name: (person?.name as string) ?? 'Unknown',
        email: (person?.email as string) ?? '',
        title: (person?.title as string) ?? '',
        avatar: person?.avatar as string | undefined,
        role: m.role as string,
      };
    });
  },
  { initial: [] }
);

const canManage = $derived(can(CAPABILITIES.settingsManage));
let form = $state({ workspaceName: '', supportEmail: '', currency: 'USD', weeklyReport: true });
let errors = $state<Record<string, string>>({});
let saving = $state(false);
let loadedAt = $state<string | null>(null);

// Copy stored settings into the form whenever they change elsewhere (scenario load, snapshot restore).
$effect(() => {
  const s = settings.current;
  if (s && s.updatedAt !== loadedAt) {
    form = {
      workspaceName: s.workspaceName,
      supportEmail: s.supportEmail,
      currency: s.currency,
      weeklyReport: s.weeklyReport,
    };
    loadedAt = s.updatedAt;
    errors = {};
  }
});

const dirty = $derived(
  settings.current !== undefined &&
    (form.workspaceName !== settings.current.workspaceName ||
      form.supportEmail !== settings.current.supportEmail ||
      form.currency !== settings.current.currency ||
      form.weeklyReport !== settings.current.weeklyReport)
);

async function save(event: SubmitEvent) {
  event.preventDefault();
  saving = true;
  const result = await runService(
    () => services.settings.update({ ...form, currency: form.currency as Currency }),
    { success: 'Workspace settings saved' }
  );
  saving = false;
  if (!result.ok && isValidationError(result.error)) errors = result.error.issues;
}

function reset() {
  const s = settings.current;
  if (!s) return;
  form = {
    workspaceName: s.workspaceName,
    supportEmail: s.supportEmail,
    currency: s.currency,
    weeklyReport: s.weeklyReport,
  };
  errors = {};
}

const mode = $derived(appearance.current.mode.value);
function setMode(value: string) {
  void runService(() => runtime.theme.setPreference({ mode: value as ColorMode }));
}

const org = $derived(principal.current?.organization);
const updatedByName = $derived(
  (team.current ?? []).find((m) => m.id === settings.current?.updatedBy)?.name ?? 'someone'
);
</script>

<PageHeader title="Settings" description={org?.name} />

<div class="grid gap-6 lg:grid-cols-3">
  <div class="space-y-6 lg:col-span-2">
    <Card class="p-5">
      <div class="flex items-start justify-between gap-3">
        <div>
          <CardTitle level={2}>Workspace</CardTitle>
          <CardDescription class="mt-1">
            {#if settings.current}Last changed {fromNow(settings.current.updatedAt, clock.now)} by {updatedByName}.{/if}
          </CardDescription>
        </div>
        {#if !canManage}<Badge variant="outline"><LucideIcon icon={Lock} />Read-only</Badge>{/if}
      </div>

      {#if settings.loading}
        <div class="mt-4 space-y-3"><Skeleton class="h-9 w-full" /><Skeleton class="h-9 w-full" /></div>
      {:else if canManage}
        <form class="mt-4 grid gap-4 sm:grid-cols-2" onsubmit={save} novalidate>
          <FormField label="Workspace name" required error={errors.workspaceName}>
            {#snippet children(control)}
              <Input {...control.props} bind:value={form.workspaceName} autocomplete="off" maxlength={60} />
            {/snippet}
          </FormField>
          <FormField label="Support email" required error={errors.supportEmail} description="Shown to customers on receipts.">
            {#snippet children(control)}
              <Input {...control.props} type="email" bind:value={form.supportEmail} autocomplete="off" />
            {/snippet}
          </FormField>
          <FormField label="Currency" required error={errors.currency} description="Used for every amount in the app.">
            {#snippet children(control)}
              <Select {...control.props} items={CURRENCIES.map((c) => ({ value: c, label: c }))} bind:value={form.currency} />
            {/snippet}
          </FormField>
          <div class="flex items-end pb-1">
            <Switch label="Weekly report" description="Email a summary every Monday (simulated)." bind:checked={form.weeklyReport} />
          </div>
          <div class="flex gap-2 sm:col-span-2">
            <Button type="submit" loading={saving} disabled={!dirty}>Save changes</Button>
            <Button variant="ghost" onclick={reset} disabled={!dirty || saving}>Discard</Button>
          </div>
        </form>
      {:else if settings.current}
        <dl class="mt-4 grid gap-4 sm:grid-cols-2">
          <div><dt><CardDescription>Workspace name</CardDescription></dt><dd><strong>{settings.current.workspaceName}</strong></dd></div>
          <div><dt><CardDescription>Support email</CardDescription></dt><dd><strong>{settings.current.supportEmail}</strong></dd></div>
          <div><dt><CardDescription>Currency</CardDescription></dt><dd><strong>{settings.current.currency}</strong></dd></div>
          <div><dt><CardDescription>Weekly report</CardDescription></dt><dd><strong>{settings.current.weeklyReport ? 'On' : 'Off'}</strong></dd></div>
        </dl>
        <Notice class="mt-4" icon={Lock} text="Only owners and admins can change workspace settings." />
      {/if}
    </Card>

    <Card class="p-5">
      <CardTitle level={2}>Appearance</CardTitle>
      <CardDescription class="mt-1">Your personal preference, saved for this persona.</CardDescription>
      <RadioGroup
        class="mt-4"
        orientation="horizontal"
        aria-label="Color mode"
        value={mode}
        onValueChange={setMode}
        items={[
          { value: 'system', label: 'System' },
          { value: 'light', label: 'Light' },
          { value: 'dark', label: 'Dark' },
        ]}
      />
    </Card>

    <Card class="p-5">
      <div class="flex items-center gap-2">
        <CardTitle level={2}>Team</CardTitle>
        <Badge variant="secondary">{(team.current ?? []).length}</Badge>
      </div>
      <ul role="list" class="tx-list mt-2 -mx-3">
        {#each team.current ?? [] as member (member.id)}
          <ListItem
            title={member.id === principal.current?.persona.id ? `${member.name} (you)` : member.name}
            description={`${member.title} · ${member.email}`}
          >
            {#snippet leading()}<Avatar name={member.name} {...avatarImage(member.avatar)} size="sm" />{/snippet}
            {#snippet trailing()}
              <Badge variant={member.role === 'owner' ? 'default' : member.role === 'viewer' ? 'outline' : 'secondary'}>
                {ROLE_LABELS[member.role] ?? member.role}
              </Badge>
            {/snippet}
          </ListItem>
        {/each}
      </ul>
      <CardDescription class="mt-3">Switch persona in DevTools (Ctrl/⌘ + .) to see the app as another role.</CardDescription>
    </Card>
  </div>

  <div class="space-y-6">
    <Card class="p-5">
      <CardTitle level={2}>Billing</CardTitle>
      {#if can(CAPABILITIES.billingManage)}
        <dl class="mt-3 space-y-2">
          <div class="flex items-center justify-between"><dt><CardDescription>Plan</CardDescription></dt><dd><Badge>{org?.plan ?? '—'}</Badge></dd></div>
          <div class="flex items-center justify-between"><dt><CardDescription>Status</CardDescription></dt><dd><Badge variant={org?.billingStatus === 'expired' ? 'destructive' : 'success'}>{org?.billingStatus ?? '—'}</Badge></dd></div>
          <div class="flex items-center justify-between"><dt><CardDescription>Since</CardDescription></dt><dd>{org ? formatDate(org.createdAt) : '—'}</dd></div>
        </dl>
        <CardDescription class="mt-3">Billing is simulated: no payment provider is involved.</CardDescription>
      {:else}
        <CardDescription class="mt-2 flex items-center gap-2"><LucideIcon icon={Lock} class="size-3.5" />Only the owner can see billing.</CardDescription>
      {/if}
    </Card>

    <Card class="p-5">
      <CardTitle level={2}>Your access</CardTitle>
      <CardDescription class="mt-1">{ROLE_LABELS[principal.current?.role ?? ''] ?? '—'}</CardDescription>
      <ul class="mt-4 space-y-2">
        {#each Object.values(CAPABILITIES) as capability (capability)}
          {@const allowed = can(capability)}
          <li class="flex items-center justify-between gap-2">
            <Code>{capability}</Code>
            <Badge variant={allowed ? 'success' : 'outline'}>{allowed ? 'allowed' : 'blocked'}</Badge>
          </li>
        {/each}
      </ul>
      <CardDescription class="mt-4 flex items-start gap-2">
        <LucideIcon icon={ShieldCheck} class="mt-0.5 size-3.5 shrink-0" />Simulated permissions for prototyping — not real security.
      </CardDescription>
    </Card>
  </div>
</div>
