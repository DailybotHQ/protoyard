<script lang="ts">
import Initials from '../primitives/Initials.svelte';
import InlineError from '../primitives/InlineError.svelte';
import Section from '../primitives/Section.svelte';
import SourceBadge from '../primitives/SourceBadge.svelte';
import Spinner from '../primitives/Spinner.svelte';
import type { DevtoolsState } from '../state.svelte.ts';

let { dt }: { dt: DevtoolsState } = $props();
const runtime = $derived(dt.runtime);

// Re-read lists when the principal or world changes (personas live in the DB).
const personas = $derived.by(() => {
  dt.principal;
  dt.worldVersion;
  return runtime.session.personas();
});
const memberships = $derived.by(() => {
  dt.principal;
  dt.worldVersion;
  return runtime.session.memberships();
});
const organizations = $derived.by(() => {
  dt.worldVersion;
  return runtime.session.organizations();
});
const roles = $derived(Object.keys(runtime.policy.definition.roles));
const principal = $derived(dt.principal);
const roleOverride = $derived(dt.overrides.role);
const capabilities = $derived(principal ? [...principal.capabilities].sort() : []);
/** Any persona, role or organization change in flight: controls wait for it. */
const switching = $derived(dt.isBusy('persona'));

function roleOf(personaId: string): string {
  const orgId = principal?.organization?.id;
  return (
    memberships.find((m) => m.personaId === personaId && (!orgId || m.organizationId === orgId))
      ?.role ??
    memberships.find((m) => m.personaId === personaId)?.role ??
    '—'
  );
}

async function switchTo(personaId: string) {
  const persona = personas.find((p) => p.id === personaId);
  await dt.run(
    `persona:${personaId}`,
    () => runtime.session.switchActor(personaId),
    `Now acting as ${persona?.name ?? personaId}. Records are unchanged.`
  );
}

async function setRole(event: Event) {
  const value = (event.currentTarget as HTMLSelectElement).value;
  await dt.run(
    'persona:role',
    () => (value ? runtime.overrides.set({ role: value }) : runtime.overrides.clear(['role'])),
    value ? `Role overridden to “${value}”.` : 'Role override cleared.'
  );
}

async function setOrganization(event: Event) {
  const value = (event.currentTarget as HTMLSelectElement).value;
  await dt.run(
    'persona:org',
    () => runtime.session.switchOrganization(value),
    'Organization switched.'
  );
}
</script>

<Section title="Acting as">
  {#if principal}
    <div class="flex items-center gap-3 rounded-lg border border-border bg-surface p-3">
      <Initials
        name={principal.persona.name}
        color={principal.persona.avatarColor}
        {...dt.avatarImage(principal.persona.avatar)}
      />
      <div class="min-w-0 flex-1">
        <p class="truncate text-sm font-semibold">{principal.persona.name}</p>
        <p class="truncate text-[11px] text-muted-foreground">
          {principal.persona.title ?? principal.persona.email ?? principal.persona.id}
        </p>
      </div>
      <div class="flex flex-col items-end gap-1">
        <span class="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">{principal.role ?? 'no role'}</span>
        <SourceBadge source={roleOverride ? 'override' : 'scenario'} />
      </div>
    </div>
    <dl class="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px]">
      <dt class="text-muted-foreground">Organization</dt>
      <dd class="truncate">{principal.organization?.name ?? '—'}</dd>
      <dt class="text-muted-foreground">Capabilities</dt>
      <dd class="flex flex-wrap gap-1">
        {#each capabilities as capability (capability)}
          <code
            class="rounded px-1 font-mono text-[10px] {capability.startsWith('-')
              ? 'bg-muted text-muted-foreground line-through'
              : 'bg-muted'}">{capability}</code
          >
        {:else}
          <span class="text-muted-foreground">none</span>
        {/each}
      </dd>
    </dl>
  {:else}
    <p class="text-xs text-muted-foreground">No active persona. Load a scenario first.</p>
  {/if}
</Section>

<Section title="Switch persona" description="Non-destructive: data stays, visibility and permissions adapt.">
  <ul class="space-y-1">
    {#each personas as persona (persona.id)}
      {@const current = principal?.persona.id === persona.id}
      {@const pending = dt.isBusy(`persona:${persona.id}`)}
      <li>
        <button
          type="button"
          class="flex min-h-touch w-full items-center gap-2.5 rounded-md border px-2 py-1.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-default {current
            ? 'border-primary/60 bg-primary/5'
            : 'border-border hover:bg-muted/60'}"
          aria-pressed={current || pending}
          aria-busy={pending || undefined}
          disabled={current || switching}
          onclick={() => switchTo(persona.id)}
        >
          <Initials name={persona.name} color={persona.avatarColor} size="sm" {...dt.avatarImage(persona.avatar)} />
          <span class="min-w-0 flex-1">
            <span class="block truncate text-xs font-medium">{persona.name}</span>
            <span class="block truncate text-[11px] text-muted-foreground">{persona.summary ?? persona.title ?? persona.id}</span>
          </span>
          {#if pending}<Spinner class="text-primary" />{/if}
          <span class="font-mono text-[10px] text-muted-foreground">{roleOf(persona.id)}</span>
        </button>
      </li>
    {:else}
      <li class="text-xs text-muted-foreground">This scenario has no personas.</li>
    {/each}
  </ul>
  <InlineError message={dt.errorFor('persona')} />
</Section>

<Section title="Overrides">
  <div class="space-y-2.5">
    <label class="block text-[11px] text-muted-foreground">
      <span class="flex items-center justify-between">Role override {#if roleOverride}<SourceBadge source="override" />{/if}</span>
      <select
        class="mt-1 block min-h-touch w-full rounded-md border border-input bg-surface px-2 text-xs text-surface-foreground sm:min-h-7"
        value={roleOverride ?? ''}
        onchange={setRole}
        disabled={!principal || switching}
      >
        <option value="">Membership role ({principal?.membership?.role ?? '—'})</option>
        {#each roles as role (role)}
          <option value={role}>{role}</option>
        {/each}
      </select>
    </label>
    {#if organizations.length > 1}
      <label class="block text-[11px] text-muted-foreground">
        Organization
        <select
          class="mt-1 block min-h-touch w-full rounded-md border border-input bg-surface px-2 text-xs text-surface-foreground sm:min-h-7"
          value={principal?.organization?.id ?? ''}
          onchange={setOrganization}
          disabled={switching}
        >
          {#each organizations as org (org.id)}
            <option value={org.id}>{org.name}</option>
          {/each}
        </select>
      </label>
    {/if}
  </div>
</Section>
