<script lang="ts">
import { MailPlus, Settings2, UserRound, Users } from '@lucide/svelte';
import {
  avatarImage,
  can,
  liveQuery,
  navigate,
  runService,
  usePrincipal,
} from '@protoyard/renderer-svelte';
import { Avatar, Badge, Button, Card, LoadingState } from '@protoyard/ui';
import { LucideIcon } from 'texuli/icons/lucide';
import { Box, Heading, Text } from 'texuli/typography';
import Fact from '../components/Fact.svelte';
import RestartOnboarding from '../components/RestartOnboarding.svelte';
import { CAPABILITIES, ROLE_LABELS } from '../domain/policy.ts';
import { useOnboarding } from '../lib/context.ts';
import {
  DIGEST_LABELS,
  formatDate,
  TEAM_SIZE_LABELS,
  timezoneLabel,
  USE_CASE_LABELS,
} from '../lib/format.ts';

/** The post-onboarding home. People who have not finished onboarding are sent to the wizard. */
const { db, services, progress, workspace } = useOnboarding();
const principal = usePrincipal();

const team = liveQuery(
  async () => {
    const [people, memberships, invitations] = await Promise.all([
      db.table('py_personas').toArray(),
      db.table('py_memberships').toArray(),
      db.invitations.where('status').equals('pending').toArray(),
    ]);
    return {
      members: memberships.map((m) => ({
        id: m.personaId as string,
        name: (people.find((p) => p.id === m.personaId)?.name as string) ?? 'Unknown',
        avatar: people.find((p) => p.id === m.personaId)?.avatar as string | undefined,
        role: m.role as string,
      })),
      invitations: invitations.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    };
  },
  { initial: { members: [], invitations: [] } }
);

const done = $derived(Boolean(progress.current?.completedAt));
$effect(() => {
  if (progress.loading || done) return;
  // The live query can lag a just-committed "Finish", so confirm with a direct read first.
  void services.state().then((state) => {
    if (!state.completedAt) navigate('/onboarding', { replace: true });
  });
});

const profile = $derived(progress.current?.profile ?? null);
const preferences = $derived(progress.current?.preferences ?? null);
const modeLabel = $derived(
  preferences?.mode === 'system'
    ? 'Match system'
    : preferences
      ? preferences.mode.charAt(0).toUpperCase() + preferences.mode.slice(1)
      : ''
);
const firstName = $derived(
  (profile?.fullName ?? principal.current?.persona.name ?? 'there').split(' ')[0]
);
</script>

{#if progress.loading || !done}
  <LoadingState label="Loading your workspace…" />
{:else}
  <div class="mx-auto w-full max-w-5xl">
    <header class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <Heading level={1} size="xl">Welcome to {workspace.current?.name ?? 'your workspace'}, {firstName}</Heading>
        <Text size="sm" tone="muted" class="mt-1">
          Setup finished {progress.current?.completedAt ? formatDate(progress.current.completedAt) : ''}. Everything below comes from your onboarding answers.
        </Text>
      </div>
      <RestartOnboarding />
    </header>

    <div class="mt-6 grid gap-6 md:grid-cols-2">
      <Card class="p-5">
        <Heading level={2} size="sm" class="flex items-center gap-2"><LucideIcon icon={UserRound} size="sm" tone="neutral" />Your profile</Heading>
        {#if profile}
          <dl class="mt-3 grid grid-cols-2 gap-3">
            <Fact label="Name" value={profile.fullName} />
            <Fact label="Title" value={profile.jobTitle || '—'} />
            <Fact label="Team" value={profile.department} />
            <Fact label="Time zone" value={timezoneLabel(profile.timezone)} />
          </dl>
        {:else}
          <Text size="sm" tone="muted" class="mt-3">No profile saved.</Text>
        {/if}
      </Card>

      <Card class="p-5">
        <Heading level={2} size="sm" class="flex items-center gap-2"><LucideIcon icon={Settings2} size="sm" tone="neutral" />Workspace</Heading>
        {#if workspace.current}
          <dl class="mt-3 grid grid-cols-2 gap-3">
            <Fact label="Name" value={workspace.current.name} />
            <Fact label="URL" value={`app.example.com/${workspace.current.slug}`} truncate />
            <Fact label="Team size" value={TEAM_SIZE_LABELS[workspace.current.teamSize ?? ''] ?? 'Not set'} />
            <Fact label="Used for" value={USE_CASE_LABELS[workspace.current.useCase ?? '']?.label ?? 'Not set'} />
          </dl>
        {/if}
      </Card>

      <Card class="p-5">
        <Heading level={2} size="sm" class="flex items-center gap-2"><LucideIcon icon={Users} size="sm" tone="neutral" />Team <Text as="span" tone="muted">{team.current?.members.length ?? 0}</Text></Heading>
        <ul class="mt-3 flex flex-col">
          {#each team.current?.members ?? [] as member, i (member.id)}
            <li>
              <Box radius="none" padding="none" border={i === 0 ? 'none' : 'block-start'} class="flex items-center gap-3 py-2.5">
                <Avatar name={member.name} {...avatarImage(member.avatar)} size="sm" decorative />
                <Text as="span" size="sm" weight="medium" truncate class="min-w-0 flex-1">
                  {member.name}{#if member.id === principal.current?.persona.id}<Text as="span" size="sm" tone="muted" class="ml-1">(you)</Text>{/if}
                </Text>
                <Badge variant="secondary">{ROLE_LABELS[member.role] ?? member.role}</Badge>
              </Box>
            </li>
          {/each}
        </ul>
      </Card>

      <Card class="p-5">
        <Heading level={2} size="sm" class="flex items-center gap-2"><LucideIcon icon={MailPlus} size="sm" tone="neutral" />Pending invitations <Text as="span" tone="muted">{team.current?.invitations.length ?? 0}</Text></Heading>
        <ul class="mt-3 flex flex-col">
          {#each team.current?.invitations ?? [] as invitation, i (invitation.id)}
            <li>
              <Box radius="none" padding="none" border={i === 0 ? 'none' : 'block-start'} class="flex items-center gap-3 py-2.5">
                <span class="min-w-0 flex-1">
                  <Text as="span" size="sm" weight="medium" truncate class="block">{invitation.email}</Text>
                  <Text as="span" size="xs" tone="muted" class="block">{ROLE_LABELS[invitation.role]} · sent {formatDate(invitation.createdAt)}</Text>
                </span>
                {#if can(CAPABILITIES.invitesCreate)}
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Revoke invitation for ${invitation.email}`}
                    onclick={() => runService(() => services.revokeInvitation(invitation.id), { success: 'Invitation revoked' })}
                  >
                    Revoke
                  </Button>
                {/if}
              </Box>
            </li>
          {:else}
            <li class="py-2.5"><Text size="sm" tone="muted">No pending invitations.</Text></li>
          {/each}
        </ul>
      </Card>

      <Card class="p-5 md:col-span-2">
        <Heading level={2} size="sm">Preferences</Heading>
        {#if preferences}
          <dl class="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Fact label="Appearance" value={modeLabel} />
            <Fact label="Email digest" value={DIGEST_LABELS[preferences.digest] ?? ''} />
            <Fact label="Mentions" value={preferences.mentions ? 'On' : 'Off'} />
            <Fact label="Product updates" value={preferences.productUpdates ? 'On' : 'Off'} />
          </dl>
        {:else}
          <Text size="sm" tone="muted" class="mt-3">You skipped this step, so the defaults apply. Restart onboarding to set them.</Text>
        {/if}
      </Card>
    </div>
  </div>
{/if}
