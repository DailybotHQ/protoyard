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
        <h1 class="text-2xl font-semibold tracking-tight">Welcome to {workspace.current?.name ?? 'your workspace'}, {firstName}</h1>
        <p class="mt-1 text-sm text-muted-foreground">
          Setup finished {progress.current?.completedAt ? formatDate(progress.current.completedAt) : ''}. Everything below comes from your onboarding answers.
        </p>
      </div>
      <RestartOnboarding />
    </header>

    <div class="mt-6 grid gap-6 md:grid-cols-2">
      <Card class="p-5">
        <h2 class="flex items-center gap-2 text-sm font-semibold"><LucideIcon icon={UserRound} class="size-4 text-muted-foreground" />Your profile</h2>
        {#if profile}
          <dl class="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div><dt class="text-muted-foreground">Name</dt><dd class="font-medium">{profile.fullName}</dd></div>
            <div><dt class="text-muted-foreground">Title</dt><dd class="font-medium">{profile.jobTitle || '—'}</dd></div>
            <div><dt class="text-muted-foreground">Team</dt><dd class="font-medium">{profile.department}</dd></div>
            <div><dt class="text-muted-foreground">Time zone</dt><dd class="font-medium">{timezoneLabel(profile.timezone)}</dd></div>
          </dl>
        {:else}
          <p class="mt-3 text-sm text-muted-foreground">No profile saved.</p>
        {/if}
      </Card>

      <Card class="p-5">
        <h2 class="flex items-center gap-2 text-sm font-semibold"><LucideIcon icon={Settings2} class="size-4 text-muted-foreground" />Workspace</h2>
        {#if workspace.current}
          <dl class="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div><dt class="text-muted-foreground">Name</dt><dd class="font-medium">{workspace.current.name}</dd></div>
            <div><dt class="text-muted-foreground">URL</dt><dd class="truncate font-medium">app.example.com/{workspace.current.slug}</dd></div>
            <div><dt class="text-muted-foreground">Team size</dt><dd class="font-medium">{TEAM_SIZE_LABELS[workspace.current.teamSize ?? ''] ?? 'Not set'}</dd></div>
            <div><dt class="text-muted-foreground">Used for</dt><dd class="font-medium">{USE_CASE_LABELS[workspace.current.useCase ?? '']?.label ?? 'Not set'}</dd></div>
          </dl>
        {/if}
      </Card>

      <Card class="p-5">
        <h2 class="flex items-center gap-2 text-sm font-semibold"><LucideIcon icon={Users} class="size-4 text-muted-foreground" />Team <span class="font-normal text-muted-foreground">{team.current?.members.length ?? 0}</span></h2>
        <ul class="mt-3 divide-y divide-border">
          {#each team.current?.members ?? [] as member (member.id)}
            <li class="flex items-center gap-3 py-2.5 text-sm">
              <Avatar name={member.name} {...avatarImage(member.avatar)} size="sm" decorative />
              <span class="min-w-0 flex-1 truncate font-medium">
                {member.name}{#if member.id === principal.current?.persona.id}<span class="ml-1 font-normal text-muted-foreground">(you)</span>{/if}
              </span>
              <Badge variant="secondary">{ROLE_LABELS[member.role] ?? member.role}</Badge>
            </li>
          {/each}
        </ul>
      </Card>

      <Card class="p-5">
        <h2 class="flex items-center gap-2 text-sm font-semibold"><LucideIcon icon={MailPlus} class="size-4 text-muted-foreground" />Pending invitations <span class="font-normal text-muted-foreground">{team.current?.invitations.length ?? 0}</span></h2>
        <ul class="mt-3 divide-y divide-border">
          {#each team.current?.invitations ?? [] as invitation (invitation.id)}
            <li class="flex items-center gap-3 py-2.5 text-sm">
              <span class="min-w-0 flex-1">
                <span class="block truncate font-medium">{invitation.email}</span>
                <span class="block text-xs text-muted-foreground">{ROLE_LABELS[invitation.role]} · sent {formatDate(invitation.createdAt)}</span>
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
            </li>
          {:else}
            <li class="py-2.5 text-sm text-muted-foreground">No pending invitations.</li>
          {/each}
        </ul>
      </Card>

      <Card class="p-5 md:col-span-2">
        <h2 class="text-sm font-semibold">Preferences</h2>
        {#if preferences}
          <dl class="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div><dt class="text-muted-foreground">Appearance</dt><dd class="font-medium capitalize">{preferences.mode === 'system' ? 'Match system' : preferences.mode}</dd></div>
            <div><dt class="text-muted-foreground">Email digest</dt><dd class="font-medium">{DIGEST_LABELS[preferences.digest]}</dd></div>
            <div><dt class="text-muted-foreground">Mentions</dt><dd class="font-medium">{preferences.mentions ? 'On' : 'Off'}</dd></div>
            <div><dt class="text-muted-foreground">Product updates</dt><dd class="font-medium">{preferences.productUpdates ? 'On' : 'Off'}</dd></div>
          </dl>
        {:else}
          <p class="mt-3 text-sm text-muted-foreground">You skipped this step, so the defaults apply. Restart onboarding to set them.</p>
        {/if}
      </Card>
    </div>
  </div>
{/if}
