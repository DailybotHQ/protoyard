<script lang="ts">
import { Lock, ShieldCheck } from '@lucide/svelte';
import { avatarImage, can, liveQuery, usePrincipal } from '@protoyard/renderer-svelte';
import { Avatar, Badge, Card } from '@protoyard/ui';
import { LucideIcon } from 'texuli/icons/lucide';
import PageHeader from '../components/PageHeader.svelte';
import { CAPABILITIES, ROLE_LABELS } from '../domain/policy.ts';
import { useCrm } from '../lib/context.ts';
import { formatDate } from '../lib/format.ts';

/**
 * Team & settings. Role-gated sections show how the same screen differs
 * per persona. Persona switching itself lives in DevTools (author-only).
 */
const { db, runtime } = useCrm();
const principal = usePrincipal();

const team = liveQuery(
  async () => {
    const [people, memberships, deals] = await Promise.all([
      db.table('py_personas').toArray(),
      db.table('py_memberships').toArray(),
      db.deals.toArray(),
    ]);
    return memberships.map((m) => {
      const person = people.find((p) => p.id === m.personaId);
      const owned = deals.filter((d) => d.ownerId === m.personaId);
      return {
        id: m.personaId as string,
        name: (person?.name as string) ?? 'Unknown',
        title: (person?.title as string) ?? '',
        email: (person?.email as string) ?? '',
        avatar: person?.avatar as string | undefined,
        role: m.role as string,
        joinedAt: m.joinedAt as string,
        won: owned.filter((d) => d.stage === 'won').reduce((s, d) => s + d.amount, 0),
        open: owned.filter((d) => d.stage !== 'won' && d.stage !== 'lost').length,
      };
    });
  },
  { initial: [] }
);

const org = $derived(principal.current?.organization);
</script>

<PageHeader title="Team & settings" description={org?.name} />

<div class="grid gap-6 lg:grid-cols-3">
  <Card class="p-5 lg:col-span-2">
    <h2 class="text-sm font-semibold">Members <span class="font-normal text-muted-foreground">{(team.current ?? []).length}</span></h2>
    <ul class="mt-3 divide-y divide-border">
      {#each team.current ?? [] as member (member.id)}
        <li class="flex items-center gap-3 py-3">
          <Avatar name={member.name} {...avatarImage(member.avatar)} size="md" />
          <div class="min-w-0 flex-1 text-sm">
            <p class="truncate font-medium">
              {member.name}
              {#if member.id === principal.current?.persona.id}<span class="text-muted-foreground">(you)</span>{/if}
            </p>
            <p class="truncate text-muted-foreground">{member.title} · joined {formatDate(member.joinedAt)}</p>
          </div>
          <div class="hidden text-right text-xs text-muted-foreground sm:block">
            <p>{member.open} open deals</p>
            <p>${(member.won / 1000).toFixed(0)}k won</p>
          </div>
          <Badge variant={member.role === 'owner' ? 'default' : member.role === 'viewer' ? 'outline' : 'secondary'}>
            {ROLE_LABELS[member.role] ?? member.role}
          </Badge>
        </li>
      {/each}
    </ul>
    {#if !can(CAPABILITIES.teamManage)}
      <p class="mt-4 flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
        <LucideIcon icon={Lock} class="size-3.5" /> Only owners and admins can manage the team.
      </p>
    {/if}
  </Card>

  <div class="space-y-6">
    <Card class="p-5">
      <h2 class="text-sm font-semibold">Your access</h2>
      <p class="mt-1 text-sm text-muted-foreground">{ROLE_LABELS[principal.current?.role ?? ''] ?? '—'}</p>
      <ul class="mt-4 space-y-2 text-sm">
        {#each Object.entries(CAPABILITIES) as [label, capability] (capability)}
          {@const allowed = can(capability)}
          <li class="flex items-center justify-between gap-2">
            <code class="text-xs">{capability}</code>
            <Badge variant={allowed ? 'success' : 'outline'}>{allowed ? 'allowed' : 'blocked'}</Badge>
            <span class="sr-only">{label}</span>
          </li>
        {/each}
      </ul>
      <p class="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
        <LucideIcon icon={ShieldCheck} class="mt-0.5 size-3.5 shrink-0" /> Simulated permissions for prototyping — not real security.
      </p>
    </Card>

    <Card class="p-5">
      <h2 class="text-sm font-semibold">Billing</h2>
      {#if can(CAPABILITIES.billingManage)}
        <p class="mt-2 text-sm">Plan: <Badge>{org?.plan}</Badge> · status <Badge variant={org?.billingStatus === 'expired' ? 'destructive' : 'success'}>{org?.billingStatus}</Badge></p>
        <p class="mt-2 text-xs text-muted-foreground">Billing is simulated. Load the “Trial expired” scenario to see the paywall.</p>
      {:else}
        <p class="mt-2 flex items-center gap-2 text-sm text-muted-foreground"><LucideIcon icon={Lock} class="size-3.5" /> Only the owner can see billing.</p>
      {/if}
    </Card>

    <Card class="p-5 text-xs text-muted-foreground">
      <p>Workspace created {org ? formatDate(org.createdAt) : '—'} · data stored in this browser (IndexedDB namespace <code>{runtime.manifest.storage.namespace}</code>).</p>
    </Card>
  </div>
</div>
