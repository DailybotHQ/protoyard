<script lang="ts">
import { Lock, ShieldCheck } from '@lucide/svelte';
import type { ColorMode } from '@protoyard/core';
import {
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
  FormField,
  Input,
  RadioGroup,
  Select,
  Skeleton,
  Switch,
} from '@protoyard/ui';
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
          <h2 class="text-sm font-semibold">Workspace</h2>
          <p class="mt-1 text-xs text-muted-foreground">
            {#if settings.current}Last changed {fromNow(settings.current.updatedAt, clock.now)} by {updatedByName}.{/if}
          </p>
        </div>
        {#if !canManage}<Badge variant="outline"><Lock aria-hidden="true" />Read-only</Badge>{/if}
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
        <dl class="mt-4 grid gap-4 text-sm sm:grid-cols-2">
          <div><dt class="text-muted-foreground">Workspace name</dt><dd class="font-medium">{settings.current.workspaceName}</dd></div>
          <div><dt class="text-muted-foreground">Support email</dt><dd class="font-medium">{settings.current.supportEmail}</dd></div>
          <div><dt class="text-muted-foreground">Currency</dt><dd class="font-medium">{settings.current.currency}</dd></div>
          <div><dt class="text-muted-foreground">Weekly report</dt><dd class="font-medium">{settings.current.weeklyReport ? 'On' : 'Off'}</dd></div>
        </dl>
        <p class="mt-4 flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
          <Lock class="size-3.5" aria-hidden="true" />Only owners and admins can change workspace settings.
        </p>
      {/if}
    </Card>

    <Card class="p-5">
      <h2 class="text-sm font-semibold">Appearance</h2>
      <p class="mt-1 text-xs text-muted-foreground">Your personal preference, saved for this persona.</p>
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
      <h2 class="text-sm font-semibold">Team <span class="font-normal text-muted-foreground">{(team.current ?? []).length}</span></h2>
      <ul class="mt-3 divide-y divide-border">
        {#each team.current ?? [] as member (member.id)}
          <li class="flex items-center gap-3 py-3">
            <Avatar name={member.name} size="sm" />
            <div class="min-w-0 flex-1 text-sm">
              <p class="truncate font-medium">
                {member.name}
                {#if member.id === principal.current?.persona.id}<span class="font-normal text-muted-foreground">(you)</span>{/if}
              </p>
              <p class="truncate text-muted-foreground">{member.title} · {member.email}</p>
            </div>
            <Badge variant={member.role === 'owner' ? 'default' : member.role === 'viewer' ? 'outline' : 'secondary'}>
              {ROLE_LABELS[member.role] ?? member.role}
            </Badge>
          </li>
        {/each}
      </ul>
      <p class="mt-3 text-xs text-muted-foreground">Switch persona in DevTools (Ctrl/⌘ + .) to see the app as another role.</p>
    </Card>
  </div>

  <div class="space-y-6">
    <Card class="p-5">
      <h2 class="text-sm font-semibold">Billing</h2>
      {#if can(CAPABILITIES.billingManage)}
        <dl class="mt-3 space-y-2 text-sm">
          <div class="flex justify-between"><dt class="text-muted-foreground">Plan</dt><dd><Badge>{org?.plan ?? '—'}</Badge></dd></div>
          <div class="flex justify-between"><dt class="text-muted-foreground">Status</dt><dd><Badge variant={org?.billingStatus === 'expired' ? 'destructive' : 'success'}>{org?.billingStatus ?? '—'}</Badge></dd></div>
          <div class="flex justify-between"><dt class="text-muted-foreground">Since</dt><dd>{org ? formatDate(org.createdAt) : '—'}</dd></div>
        </dl>
        <p class="mt-3 text-xs text-muted-foreground">Billing is simulated: no payment provider is involved.</p>
      {:else}
        <p class="mt-2 flex items-center gap-2 text-sm text-muted-foreground"><Lock class="size-3.5" aria-hidden="true" />Only the owner can see billing.</p>
      {/if}
    </Card>

    <Card class="p-5">
      <h2 class="text-sm font-semibold">Your access</h2>
      <p class="mt-1 text-sm text-muted-foreground">{ROLE_LABELS[principal.current?.role ?? ''] ?? '—'}</p>
      <ul class="mt-4 space-y-2 text-sm">
        {#each Object.values(CAPABILITIES) as capability (capability)}
          {@const allowed = can(capability)}
          <li class="flex items-center justify-between gap-2">
            <code class="text-xs">{capability}</code>
            <Badge variant={allowed ? 'success' : 'outline'}>{allowed ? 'allowed' : 'blocked'}</Badge>
          </li>
        {/each}
      </ul>
      <p class="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
        <ShieldCheck class="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />Simulated permissions for prototyping — not real security.
      </p>
    </Card>
  </div>
</div>
