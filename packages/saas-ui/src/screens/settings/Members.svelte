<script lang="ts">
import { MEMBER_CAPABILITIES, type Member, OWNER_ROLE } from '@protoyard/core';
import { createInvitationServices, type SaasInvitation } from '@protoyard/saas';
import { AlertDialog, Button, FormField, Input } from '@protoyard/ui';
import { onMount } from 'svelte';
import { getSaas } from '../../context.ts';

const { runtime } = getSaas();
const invitations = createInvitationServices(
  runtime as Parameters<typeof createInvitationServices>[0]
);
const organizationId = runtime.session.principal()?.organization?.id;
const roles = Object.keys(runtime.policy.definition.roles);
let members = $state<Member[]>([]);
let pending = $state<SaasInvitation[]>([]);
let email = $state('');
let role = $state('member');
let busy = $state(false);
let message = $state('');
// Destructive actions confirm first: the button only picks the target.
let removing = $state<Member | null>(null);
let removeOpen = $state(false);
let revoking = $state<SaasInvitation | null>(null);
let revokeOpen = $state(false);
const canInvite = $derived(runtime.session.can(MEMBER_CAPABILITIES.invite, { organizationId }));
const canUpdate = $derived(runtime.session.can(MEMBER_CAPABILITIES.update, { organizationId }));
const canRemove = $derived(runtime.session.can(MEMBER_CAPABILITIES.remove, { organizationId }));
const canTransfer = $derived(runtime.session.can(MEMBER_CAPABILITIES.transfer, { organizationId }));

async function refresh(): Promise<void> {
  members = [...runtime.members.list()];
  if (organizationId) {
    pending = await (runtime as Parameters<typeof createInvitationServices>[0]).db
      .rows<SaasInvitation>('saas_invitations')
      .where('organizationId')
      .equals(organizationId)
      .toArray();
    pending = pending.filter((invitation) => invitation.status === 'pending');
  }
}

async function invite(): Promise<void> {
  if (!canInvite || busy) return;
  busy = true;
  message = '';
  try {
    await invitations.create({ email, role });
    email = '';
    message = 'Invitation added to the simulated inbox.';
    await refresh();
  } catch (error) {
    message = error instanceof Error ? error.message : 'Could not create the invitation.';
  } finally {
    busy = false;
  }
}

async function changeRole(member: Member, nextRole: string): Promise<void> {
  if (!canUpdate || busy) return;
  busy = true;
  message = '';
  try {
    await runtime.members.changeRole(member.membership.id, nextRole);
    await refresh();
  } catch (error) {
    message = error instanceof Error ? error.message : 'Could not change the role.';
  } finally {
    busy = false;
  }
}

async function remove(member: Member): Promise<void> {
  if (!canRemove || busy) return;
  busy = true;
  message = '';
  try {
    await runtime.members.remove(member.membership.id);
    await refresh();
  } catch (error) {
    message = error instanceof Error ? error.message : 'Could not remove this member.';
  } finally {
    busy = false;
  }
}

async function revoke(invitationId: string): Promise<void> {
  if (!canInvite || busy) return;
  busy = true;
  message = '';
  try {
    await invitations.revoke(invitationId);
    await refresh();
  } catch (error) {
    message = error instanceof Error ? error.message : 'Could not revoke the invitation.';
  } finally {
    busy = false;
  }
}

onMount(() => {
  void refresh();
});
</script>

<section class="grid gap-5" aria-labelledby="settings-members-title" data-testid="settings-members">
  <div><h2 id="settings-members-title" class="text-lg font-semibold">Members</h2><p class="text-sm text-muted-foreground">Manage simulated roles and invitations for this workspace.</p></div>
  <form class="grid max-w-xl gap-3 sm:grid-cols-[1fr_10rem_auto] sm:items-end" onsubmit={(event) => { event.preventDefault(); void invite(); }}>
    <FormField label="Invite email" required>
      {#snippet children(control)}<Input {...control.props} bind:value={email} type="email" placeholder="name@example.com" required disabled={!canInvite || busy} />{/snippet}
    </FormField>
    <FormField label="Role" required>
      {#snippet children(control)}<select {...control.props} class="h-10 rounded-md border border-input bg-background px-3 text-sm" bind:value={role} disabled={!canInvite || busy}>{#each roles as candidate (candidate)}<option value={candidate}>{candidate}</option>{/each}</select>{/snippet}
    </FormField>
    <Button type="submit" disabled={!canInvite || busy}>Invite</Button>
  </form>
  <div class="grid gap-2">
    <h3 class="font-medium">Current members</h3>
    <ul class="divide-y divide-border rounded-md border border-border">
      {#each members as member (member.membership.id)}
        <li class="flex flex-wrap items-center justify-between gap-3 p-3">
          <span><span class="block font-medium">{member.persona.name}</span><span class="text-sm text-muted-foreground">{member.persona.email ?? 'No email on profile'}</span></span>
          <div class="flex items-center gap-2">
            <select aria-label={`Role for ${member.persona.name}`} class="h-9 rounded-md border border-input bg-background px-2 text-sm" value={member.membership.role} disabled={!canUpdate || busy || (member.membership.role === OWNER_ROLE && !canTransfer)} onchange={(event) => void changeRole(member, event.currentTarget.value)}>{#each roles as candidate (candidate)}<option value={candidate} disabled={candidate === OWNER_ROLE && !canTransfer}>{candidate}</option>{/each}</select>
            <Button variant="outline" size="sm" disabled={!canRemove || busy || (member.membership.role === OWNER_ROLE && !canTransfer)} onclick={() => { removing = member; removeOpen = true; }}>Remove</Button>
          </div>
        </li>
      {/each}
    </ul>
  </div>
  <div class="grid gap-2">
    <h3 class="font-medium">Pending invitations</h3>
    {#if pending.length}
      <ul class="grid gap-2">{#each pending as invitation (invitation.id)}<li class="flex items-center justify-between gap-2 rounded-md border border-border p-3"><span>{invitation.email} · {invitation.role}</span><button type="button" class="ui-button h-8 min-h-touch shrink-0 rounded-md border border-input bg-surface px-3 text-xs font-medium text-foreground hover:bg-muted disabled:pointer-events-none disabled:opacity-50" disabled={!canInvite || busy} onclick={() => { revoking = invitation; revokeOpen = true; }}>Revoke</button></li>{/each}</ul>
    {:else}<p class="text-sm text-muted-foreground">No pending invitations.</p>{/if}
  </div>
  {#if !canInvite && !canUpdate && !canRemove}<p class="text-sm text-muted-foreground">Your simulated role cannot manage members.</p>{/if}
  {#if message}<p role="status" class="text-sm text-muted-foreground">{message}</p>{/if}
</section>

<AlertDialog
  bind:open={removeOpen}
  title={`Remove ${removing?.persona.name ?? 'this member'}?`}
  description={`${removing?.persona.name ?? 'This person'} loses access to this simulated workspace. You can invite them again later.`}
  confirmLabel="Remove member"
  destructive
  onConfirm={async () => {
    if (removing) await remove(removing);
  }}
  onCancel={() => (removing = null)}
/>
<AlertDialog
  bind:open={revokeOpen}
  title={`Revoke the invitation for ${revoking?.email ?? 'this person'}?`}
  description="The invitation link stops working. You can send a new invitation later."
  confirmLabel="Revoke invitation"
  destructive
  onConfirm={async () => {
    if (revoking) await revoke(revoking.id);
  }}
  onCancel={() => (revoking = null)}
/>
