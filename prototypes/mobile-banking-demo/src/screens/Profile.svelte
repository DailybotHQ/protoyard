<script lang="ts">
import type { ColorMode } from '@protoyard/core';
import { useAppearance, usePrincipal, useScenario } from '@protoyard/renderer-svelte';
import { Avatar, Badge } from '@protoyard/ui';
import Notice from '../components/Notice.svelte';
import Page from '../components/Page.svelte';
import Segmented from '../components/Segmented.svelte';
import { ROLE_LABELS } from '../domain/policy.ts';
import { useBank } from '../lib/context.ts';
import { notifyError } from '../lib/feedback.ts';
import { formatShortDate } from '../lib/format.ts';

const { runtime } = useBank();
const principal = usePrincipal();
const appearance = useAppearance();
const scenario = useScenario();

const me = $derived(principal.current);
const household = $derived.by(() => {
  void principal.current;
  const orgId = me?.organization?.id;
  const memberships = runtime.session.memberships().filter((m) => m.organizationId === orgId);
  return memberships
    .map((m) => ({
      membership: m,
      persona: runtime.session.personas().find((p) => p.id === m.personaId),
    }))
    .filter((entry) => entry.persona !== undefined);
});

const modeOptions: { value: ColorMode; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];
let mode = $state<ColorMode>('system');
$effect(() => {
  mode = appearance.current.mode.value;
});

async function setMode(next: ColorMode) {
  try {
    await runtime.theme.setPreference({ mode: next });
  } catch (error) {
    notifyError(error);
  }
}
</script>

<Page title="Profile" subtitle={me?.organization?.name}>
  <div role="note" class="rounded-2xl border-2 border-warning bg-warning/15 p-4">
    <p class="font-semibold">Demo only — fictional bank, no real money</p>
    <p class="mt-1 text-sm text-muted-foreground">
      Lumen Bank, its people, merchants and institutions are invented. Balances live only in this
      browser. Never enter real account numbers or personal details.
    </p>
  </div>

  {#if me}
    <section class="flex items-center gap-4 rounded-2xl bg-surface p-4 shadow-soft" aria-label="You">
      <Avatar name={me.persona.name} size="lg" decorative />
      <div class="min-w-0 flex-1">
        <p class="truncate text-lg font-semibold">{me.persona.name}</p>
        <p class="truncate text-sm text-muted-foreground">{me.persona.email}</p>
        <Badge variant={me.role === 'owner' ? 'default' : 'secondary'} class="mt-1.5">
          {ROLE_LABELS[me.role ?? ''] ?? me.role ?? 'No role'}
        </Badge>
      </div>
    </section>
  {/if}

  <section aria-labelledby="appearance-heading" class="flex flex-col gap-2">
    <h2 id="appearance-heading" class="text-base font-semibold">Appearance</h2>
    <Segmented label="Color mode" options={modeOptions} bind:value={mode} onChange={setMode} />
    <p class="text-xs text-muted-foreground">
      Saved for {me?.persona.name.split(' ')[0] ?? 'this person'} on this device{appearance.current.mode
        .source === 'override'
        ? ' · a DevTools override is currently active'
        : ''}.
    </p>
  </section>

  <section aria-labelledby="household-heading" class="flex flex-col gap-2">
    <h2 id="household-heading" class="text-base font-semibold">Household</h2>
    <ul class="divide-y divide-border rounded-2xl bg-surface px-4 shadow-soft">
      {#each household as entry (entry.membership.id)}
        <li class="flex min-h-14 items-center gap-3 py-2.5">
          <Avatar name={entry.persona?.name ?? '?'} size="sm" decorative />
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium">
              {entry.persona?.name}{entry.persona?.id === me?.persona.id ? ' (you)' : ''}
            </p>
            <p class="text-xs text-muted-foreground">Since {formatShortDate(entry.membership.joinedAt)}</p>
          </div>
          <Badge variant="outline">{ROLE_LABELS[entry.membership.role] ?? entry.membership.role}</Badge>
        </li>
      {/each}
    </ul>
    <p class="text-xs text-muted-foreground">
      Switch between household members from DevTools to see how access changes.
    </p>
  </section>

  {#if scenario.active}
    <Notice title={`Scenario: ${scenario.active.scenario.name}`}>
      {scenario.active.scenario.description}
    </Notice>
  {/if}
</Page>
