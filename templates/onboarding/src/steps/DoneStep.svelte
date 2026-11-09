<script lang="ts">
import { CircleCheck, CircleDashed, PartyPopper, Pencil } from '@lucide/svelte';
import { isValidationError, navigate, runService } from '@protoyard/renderer-svelte';
import { Button } from '@protoyard/ui';
import { Alert } from 'texuli/alert';
import { LucideIcon } from 'texuli/icons/lucide';
import { Box, Text } from 'texuli/typography';
import RestartOnboarding from '../components/RestartOnboarding.svelte';
import StepHeading from '../components/StepHeading.svelte';
import { ACTIONABLE_STEPS, type OnboardingState, type StepId } from '../database/schema.ts';
import { ROLE_LABELS } from '../domain/policy.ts';
import { missingRequired, STEP_DETAILS } from '../domain/steps.ts';
import { useOnboarding } from '../lib/context.ts';
import { DIGEST_LABELS, TEAM_SIZE_LABELS, timezoneLabel, USE_CASE_LABELS } from '../lib/format.ts';

let {
  flow,
  onBack,
  onEdit,
}: { flow: OnboardingState; onBack: () => void; onEdit: (step: StepId) => void } = $props();
const { services, workspace } = useOnboarding();
let busy = $state(false);
let error = $state<string | null>(null);
const missing = $derived(missingRequired(flow));

async function finish() {
  busy = true;
  error = null;
  const result = await runService(() => services.complete(), { success: "You're all set" });
  busy = false;
  if (result.ok) navigate('/');
  else if (isValidationError(result.error)) error = Object.values(result.error.issues)[0] ?? null;
}

const status = (step: StepId) =>
  flow.completedSteps.includes(step)
    ? 'done'
    : flow.skippedSteps.includes(step)
      ? 'skipped'
      : 'todo';
</script>

{#if flow.completedAt}
  <div class="flex flex-col items-center py-6 text-center">
    <Box radius="full" surface="muted" padding="md" class="mb-4 grid place-items-center"><LucideIcon icon={PartyPopper} size="lg" tone="success" /></Box>
    <StepHeading title="You're all set" description="Onboarding is complete. Here is what you set up." align="center" />
  </div>
{:else}
  <StepHeading title="Review and finish" description="Check your answers. You can jump back to any step to change them." />
{/if}

<Box border="default" radius="lg" padding="none">
<ul class="flex flex-col">
  {#each ACTIONABLE_STEPS as step, i (step)}
    {@const s = status(step)}
    <li>
    <Box radius="none" padding="md" border={i === 0 ? 'none' : 'block-start'} class="flex items-start gap-3">
      {#if s === 'done'}
        <LucideIcon icon={CircleCheck} tone="success" class="mt-0.5 shrink-0" />
      {:else}
        <LucideIcon icon={CircleDashed} tone="neutral" class="mt-0.5 shrink-0" />
      {/if}
      <div class="min-w-0 flex-1">
        <Text size="sm" weight="medium">
          {STEP_DETAILS[step].label}
          <span class="sr-only">({s === 'done' ? 'completed' : s === 'skipped' ? 'skipped' : 'not done'})</span>
        </Text>
        <Text as="div" size="sm" tone="muted" class="mt-0.5">
          {#if s === 'skipped'}
            Skipped
          {:else if s === 'todo'}
            Not done yet
          {:else if step === 'profile' && flow.profile}
            {flow.profile.fullName}{flow.profile.jobTitle ? ` · ${flow.profile.jobTitle}` : ''} · {flow.profile.department} · {timezoneLabel(flow.profile.timezone)}
          {:else if step === 'workspace' && workspace.current}
            {workspace.current.name} · app.example.com/{workspace.current.slug} · {TEAM_SIZE_LABELS[workspace.current.teamSize ?? ''] ?? 'size not set'} · {USE_CASE_LABELS[workspace.current.useCase ?? '']?.label ?? 'use not set'}
          {:else if step === 'invite'}
            {#if flow.invites.length}
              {flow.invites.map((i) => `${i.email} (${ROLE_LABELS[i.role] ?? i.role})`).join(', ')}
            {:else}No invitations{/if}
          {:else if step === 'preferences' && flow.preferences}
            {flow.preferences.mode === 'system' ? 'Match system' : flow.preferences.mode} theme · digest {DIGEST_LABELS[flow.preferences.digest]?.toLowerCase()} · {flow.preferences.mentions ? 'mentions on' : 'mentions off'}
          {/if}
        </Text>
      </div>
      {#if !flow.completedAt}
        <Button variant="ghost" size="sm" onclick={() => onEdit(step)} aria-label={`Edit ${STEP_DETAILS[step].label}`}>
          <LucideIcon icon={Pencil} />Edit
        </Button>
      {/if}
    </Box>
    </li>
  {/each}
</ul>
</Box>

{#if error || missing.length}
  <Alert
    tone="error"
    class="mt-4"
    text={error ?? `Finish ${missing.map((s) => STEP_DETAILS[s].label).join(' and ')} before you continue.`}
  />
{/if}

<Box as="footer" radius="none" border="block-start" padding="none" class="mt-8 flex flex-col-reverse gap-2 pt-5 sm:flex-row sm:items-center">
  {#if flow.completedAt}
    <RestartOnboarding variant="ghost" />
    <Button class="sm:ml-auto" href="#/">Go to home</Button>
  {:else}
    <Button variant="ghost" disabled={busy} onclick={onBack}>Back</Button>
    <Button class="sm:ml-auto" loading={busy} disabled={missing.length > 0} onclick={finish}>Finish setup</Button>
  {/if}
</Box>
