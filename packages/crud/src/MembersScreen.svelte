<script lang="ts">
import { UserPlus } from '@lucide/svelte';
import { MEMBER_CAPABILITIES, OWNER_ROLE, type PrototypeRuntime } from '@protoyard/core';
import { avatarImage, can, runService, usePrincipal } from '@protoyard/renderer-svelte';
import { Avatar, Button, FormField, Input, Select, toast } from '@protoyard/ui';

/**
 * Team members for the active organization: invite, change role, remove.
 * Controls are hidden/disabled via `can()`; services still enforce policy.
 */
let {
  runtime,
  class: className,
}: {
  runtime: PrototypeRuntime;
  class?: string;
} = $props();

const principal = usePrincipal(runtime);
/** Bumped after mutations so the table refreshes even if the principal object is unchanged. */
let membersTick = $state(0);
const members = $derived.by(() => {
  void principal.current;
  void membersTick;
  return [...runtime.members.list()];
});

$effect(() => {
  void principal.current;
  return runtime.session.subscribe(() => {
    membersTick += 1;
  });
});

const roles = $derived(Object.keys(runtime.policy.definition.roles));
const roleItems = $derived(roles.map((value) => ({ value, label: value })));

const canInvite = $derived(can(MEMBER_CAPABILITIES.invite, undefined, runtime));
const canUpdate = $derived(can(MEMBER_CAPABILITIES.update, undefined, runtime));
const canRemove = $derived(can(MEMBER_CAPABILITIES.remove, undefined, runtime));
const canTransfer = $derived(can(MEMBER_CAPABILITIES.transfer, undefined, runtime));

let inviteName = $state('');
let inviteEmail = $state('');
let inviteRole = $state('member');
let inviteError = $state<string | null>(null);
let busy = $state(false);

$effect(() => {
  if (!roles.includes(inviteRole) && roles[0]) inviteRole = roles[0];
});

function issuesOf(error: unknown): Record<string, string> | null {
  if (
    error &&
    typeof error === 'object' &&
    'issues' in error &&
    error.issues &&
    typeof error.issues === 'object'
  ) {
    return error.issues as Record<string, string>;
  }
  return null;
}

function refreshMembers() {
  membersTick += 1;
}

async function invite() {
  if (!canInvite || busy) return;
  busy = true;
  inviteError = null;
  const result = await runService(() =>
    runtime.members.invite({
      name: inviteName,
      email: inviteEmail.trim() || undefined,
      role: inviteRole,
    })
  );
  busy = false;
  if (!result.ok) {
    const issues = issuesOf(result.error);
    inviteError =
      issues?.email ??
      issues?.name ??
      issues?.role ??
      issues?.member ??
      issues?.form ??
      (result.error instanceof Error ? result.error.message : 'Could not invite');
    return;
  }
  inviteName = '';
  inviteEmail = '';
  refreshMembers();
  toast.success('Member invited');
}

async function changeRole(membershipId: string, role: string) {
  if (!canUpdate && role !== OWNER_ROLE) return;
  if (role === OWNER_ROLE && !canTransfer) return;
  const result = await runService(() => runtime.members.changeRole(membershipId, role));
  if (result.ok) {
    refreshMembers();
    toast.success('Role updated');
  }
}

async function removeMember(membershipId: string, name: string) {
  if (!canRemove) return;
  const result = await runService(() => runtime.members.remove(membershipId));
  if (result.ok) {
    refreshMembers();
    toast.success(`Removed ${name}`);
  }
}

function roleDisabled(targetRole: string, currentRole: string): boolean {
  if (currentRole === targetRole) return true;
  if (targetRole === OWNER_ROLE) return !canTransfer;
  if (currentRole === OWNER_ROLE) return !canTransfer;
  return !canUpdate;
}
</script>

<section class={['space-y-6', className]} data-testid="members-screen" aria-labelledby="members-title">
  <div>
    <h2 id="members-title" class="font-heading text-lg font-semibold">Team members</h2>
    <p class="text-sm text-muted-foreground">
      Simulated roster for this workspace. Policy gates controls; services still enforce them.
    </p>
  </div>

  {#if canInvite}
    <form
      class="grid gap-3 rounded-xl border border-border bg-surface p-4 sm:grid-cols-[1fr_1fr_10rem_auto]"
      data-testid="members-invite-form"
      onsubmit={(event) => {
        event.preventDefault();
        void invite();
      }}
    >
      <FormField label="Name" required>
        {#snippet children({ props })}
          <Input {...props} bind:value={inviteName} placeholder="Ada Example" data-testid="invite-name" />
        {/snippet}
      </FormField>
      <FormField label="Email" description="Fictional @example.com address">
        {#snippet children({ props })}
          <Input
            {...props}
            type="email"
            bind:value={inviteEmail}
            placeholder="ada@example.com"
            data-testid="invite-email"
          />
        {/snippet}
      </FormField>
      <FormField label="Role">
        {#snippet children({ props })}
          <Select {...props} items={roleItems} bind:value={inviteRole} data-testid="invite-role" />
        {/snippet}
      </FormField>
      <div class="flex items-end">
        <Button type="submit" loading={busy} data-testid="invite-submit">
          <UserPlus aria-hidden="true" /> Invite
        </Button>
      </div>
      {#if inviteError}
        <p class="text-sm text-destructive sm:col-span-4" role="alert" data-testid="invite-error">
          {inviteError}
        </p>
      {/if}
    </form>
  {:else}
    <p class="text-sm text-muted-foreground" data-testid="members-invite-denied">
      You cannot invite members in this role (simulated).
    </p>
  {/if}

  <div class="overflow-hidden rounded-xl border border-border">
    <table class="w-full text-sm" data-testid="members-table">
      <caption class="sr-only">Workspace members</caption>
      <thead class="bg-muted/50 text-left text-xs tracking-wide text-muted-foreground uppercase">
        <tr>
          <th class="px-3 py-2 font-medium">Name</th>
          <th class="px-3 py-2 font-medium">Email</th>
          <th class="px-3 py-2 font-medium">Role</th>
          <th class="px-3 py-2 font-medium"><span class="sr-only">Actions</span></th>
        </tr>
      </thead>
      <tbody class="divide-y divide-border">
        {#each members as member (member.membership.id)}
          {@const isSelf = member.persona.id === principal.current?.persona.id}
          <tr data-testid="member-row" data-membership-id={member.membership.id}>
            <td class="px-3 py-2 font-medium text-foreground">
              <span class="flex items-center gap-2">
                <Avatar name={member.persona.name} {...avatarImage(member.persona.avatar)} size="sm" decorative />
                <span>
                  {member.persona.name}
                  {#if isSelf}<span class="text-muted-foreground"> (you)</span>{/if}
                </span>
              </span>
            </td>
            <td class="px-3 py-2 text-muted-foreground">{member.persona.email ?? '—'}</td>
            <td class="px-3 py-2">
              {#if canUpdate || canTransfer}
                <Select
                  items={roleItems.map((item) => ({
                    ...item,
                    disabled: roleDisabled(item.value, member.membership.role),
                  }))}
                  value={member.membership.role}
                  aria-label={`Role for ${member.persona.name}`}
                  data-testid="member-role"
                  onValueChange={(value) => {
                    if (value && value !== member.membership.role) {
                      void changeRole(member.membership.id, value);
                    }
                  }}
                />
              {:else}
                <span data-testid="member-role-readonly">{member.membership.role}</span>
              {/if}
            </td>
            <td class="px-3 py-2 text-right">
              {#if canRemove}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  class="text-destructive"
                  disabled={isSelf || (member.membership.role === OWNER_ROLE && !canTransfer)}
                  data-testid="member-remove"
                  onclick={() => removeMember(member.membership.id, member.persona.name)}
                >
                  Remove
                </Button>
              {/if}
            </td>
          </tr>
        {:else}
          <tr>
            <td colspan="4" class="px-3 py-6 text-center text-muted-foreground">No members.</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</section>
