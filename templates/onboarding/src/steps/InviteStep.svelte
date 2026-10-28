<script lang="ts">
import { Lock } from '@lucide/svelte';
import { can, isValidationError, runService } from '@protoyard/renderer-svelte';
import { Button, Input, Select } from '@protoyard/ui';
import { Icon } from 'texuli/icons';
import { LucideIcon } from 'texuli/icons/lucide';
import StepFooter from '../components/StepFooter.svelte';
import StepHeading from '../components/StepHeading.svelte';
import { INVITE_ROLES, type InviteRole, type OnboardingState } from '../database/schema.ts';
import { CAPABILITIES, ROLE_LABELS } from '../domain/policy.ts';
import { useOnboarding } from '../lib/context.ts';

const MAX = 10;
let { flow, onBack, onSkip }: { flow: OnboardingState; onBack: () => void; onSkip: () => void } =
  $props();
const { services } = useOnboarding();
const canInvite = $derived(can(CAPABILITIES.invitesCreate));

let nextKey = 0;
const row = (email = '', role: InviteRole = 'member') => ({
  key: nextKey++,
  email,
  role: role as string,
});
// svelte-ignore state_referenced_locally
let rows = $state(
  flow.invites.length ? flow.invites.map((i) => row(i.email, i.role)) : [row(), row()]
);
let errors = $state<Record<string, string>>({});
let busy = $state(false);

function add() {
  if (rows.length < MAX) rows.push(row());
}

function remove(index: number) {
  rows.splice(index, 1);
  if (rows.length === 0) rows.push(row());
  errors = {};
}

async function submit(event: SubmitEvent) {
  event.preventDefault();
  // Blank rows are ignored, so field errors line up with what is left.
  const filled = rows.filter((r) => r.email.trim() !== '');
  rows = filled.length ? filled : [row()];
  busy = true;
  const result = await runService(() =>
    services.saveInvites({
      invites: filled.map((r) => ({ email: r.email, role: r.role as InviteRole })),
    })
  );
  busy = false;
  if (!result.ok && isValidationError(result.error)) errors = result.error.issues;
}
</script>

<StepHeading
  title="Invite your teammates"
  optional
  description="Work is better together. Invitations are created now; nobody is emailed in this prototype."
/>

{#if canInvite}
  <form id="step-invite" onsubmit={submit} novalidate>
    <ul class="space-y-3">
      {#each rows as invite, index (invite.key)}
        {@const error = errors[`invites.${index}.email`] ?? errors[`invites.${index}.role`]}
        <li>
          <div class="flex items-start gap-2">
            <div class="min-w-0 flex-1">
              <label for={`invite-email-${invite.key}`} class="sr-only">Teammate {index + 1} email</label>
              <Input
                id={`invite-email-${invite.key}`}
                type="email"
                placeholder="teammate@example.com"
                autocomplete="off"
                bind:value={invite.email}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `invite-error-${invite.key}` : undefined}
              />
            </div>
            <Select
              aria-label={`Teammate ${index + 1} role`}
              class="w-32 shrink-0"
              items={INVITE_ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] ?? r }))}
              bind:value={invite.role}
            />
            <Button variant="ghost" size="icon" aria-label={`Remove teammate ${index + 1}`} onclick={() => remove(index)}>
              <Icon icon="close" aria-hidden="true" />
            </Button>
          </div>
          {#if error}<p id={`invite-error-${invite.key}`} class="mt-1 text-xs text-destructive">{error}</p>{/if}
        </li>
      {/each}
    </ul>
    {#if errors.invites}<p class="mt-3 text-sm text-destructive" role="alert">{errors.invites}</p>{/if}
    <Button variant="ghost" size="sm" class="mt-3" onclick={add} disabled={rows.length >= MAX}>
      <Icon icon="plus" aria-hidden="true" />{rows.length >= MAX ? `Up to ${MAX} at a time` : 'Add another'}
    </Button>
  </form>
  <StepFooter form="step-invite" {busy} {onBack} {onSkip} submitLabel="Send invitations" />
{:else}
  <form id="step-invite" onsubmit={(e) => { e.preventDefault(); onSkip(); }}>
    <p class="flex items-start gap-2 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground" role="note">
      <LucideIcon icon={Lock} class="mt-0.5 size-4 shrink-0" />
      Your role can't invite people. Ask a workspace owner or admin to add teammates.
    </p>
  </form>
  <StepFooter form="step-invite" {busy} {onBack} submitLabel="Continue" />
{/if}
