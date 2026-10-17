<script lang="ts">
import type { ColorMode } from '@protoyard/core';
import { runService, useAppearance, usePrincipal } from '@protoyard/renderer-svelte';
import { Avatar, Badge } from '@protoyard/ui';
import Page from '../components/Page.svelte';
import Segmented from '../components/Segmented.svelte';
import { ROLE_LABELS } from '../domain/policy.ts';
import { useApp } from '../lib/context.ts';

const { runtime } = useApp();
const principal = usePrincipal();
const appearance = useAppearance();

const me = $derived(principal.current);
const people = $derived.by(() => {
  void principal.current; // re-read after persona switches / scenario loads
  return runtime.session.memberships().map((m) => ({
    membership: m,
    persona: runtime.session.personas().find((p) => p.id === m.personaId),
  }));
});

let mode = $state<ColorMode>('system');
$effect(() => {
  mode = appearance.current.mode.value;
});

/** Saved per persona in the control database — never touches app data. */
function setMode(next: ColorMode) {
  void runService(() => runtime.theme.setPreference({ mode: next }));
}
</script>

<Page title="Profile" subtitle={me?.organization?.name}>
  {#if me}
    <section class="flex items-center gap-4 rounded-2xl bg-surface p-4 shadow-soft" aria-label="You">
      <Avatar name={me.persona.name} size="lg" decorative />
      <div class="min-w-0 flex-1">
        <p class="truncate text-lg font-semibold">{me.persona.name}</p>
        <p class="truncate text-sm text-muted-foreground">{me.persona.email}</p>
        <Badge variant="secondary" class="mt-1.5">{ROLE_LABELS[me.role ?? ''] ?? me.role}</Badge>
      </div>
    </section>
  {/if}

  <section aria-labelledby="appearance" class="flex flex-col gap-2">
    <h2 id="appearance" class="text-base font-semibold">Appearance</h2>
    <Segmented
      label="Color mode"
      bind:value={mode}
      onChange={setMode}
      options={[
        { value: 'light', label: 'Light' },
        { value: 'dark', label: 'Dark' },
        { value: 'system', label: 'System' },
      ]}
    />
  </section>

  <section aria-labelledby="people" class="flex flex-col gap-2">
    <h2 id="people" class="text-base font-semibold">People</h2>
    <ul class="divide-y divide-border rounded-2xl bg-surface px-4 shadow-soft">
      {#each people as entry (entry.membership.id)}
        <li class="flex min-h-14 items-center gap-3 py-2.5">
          <Avatar name={entry.persona?.name ?? '?'} size="sm" decorative />
          <span class="min-w-0 flex-1 truncate text-sm font-medium">
            {entry.persona?.name}{entry.persona?.id === me?.persona.id ? ' (you)' : ''}
          </span>
          <Badge variant="outline">{ROLE_LABELS[entry.membership.role] ?? entry.membership.role}</Badge>
        </li>
      {/each}
    </ul>
    <p class="text-xs text-muted-foreground">Switch persona in DevTools to see the app as someone else.</p>
  </section>
</Page>
