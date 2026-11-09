<script lang="ts">
import type { ColorMode } from '@protoyard/core';
import { avatarImage, runService, useAppearance, usePrincipal } from '@protoyard/renderer-svelte';
import { Avatar, Badge } from '@protoyard/ui';
import { ListItem } from 'texuli/list-item';
import { Box, Heading, Text } from 'texuli/typography';
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
    <Box as="section" surface="default" radius="xl" elevation="sm" class="flex items-center gap-4" aria-label="You">
      <Avatar name={me.persona.name} {...avatarImage(me.persona.avatar)} size="lg" decorative />
      <div class="min-w-0 flex-1">
        <Text size="lg" weight="semibold" truncate>{me.persona.name}</Text>
        <Text size="sm" tone="muted" truncate>{me.persona.email}</Text>
        <Badge variant="secondary" class="mt-1.5">{ROLE_LABELS[me.role ?? ''] ?? me.role}</Badge>
      </div>
    </Box>
  {/if}

  <section aria-labelledby="appearance" class="flex flex-col gap-2">
    <Heading level={2} size="sm" id="appearance">Appearance</Heading>
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
    <Heading level={2} size="sm" id="people">People</Heading>
    <Box surface="default" radius="xl" elevation="sm" padding="sm">
      <ul role="list" class="tx-list">
        {#each people as entry (entry.membership.id)}
          <ListItem title={`${entry.persona?.name ?? ''}${entry.persona?.id === me?.persona.id ? ' (you)' : ''}`} class="min-h-14">
            {#snippet leading()}
              <Avatar name={entry.persona?.name ?? '?'} {...avatarImage(entry.persona?.avatar)} size="sm" decorative />
            {/snippet}
            {#snippet trailing()}
              <Badge variant="outline">{ROLE_LABELS[entry.membership.role] ?? entry.membership.role}</Badge>
            {/snippet}
          </ListItem>
        {/each}
      </ul>
    </Box>
    <Text size="xs" tone="muted">Switch persona in DevTools to see the app as someone else.</Text>
  </section>
</Page>
