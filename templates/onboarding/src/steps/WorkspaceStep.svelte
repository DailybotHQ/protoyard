<script lang="ts">
import { Lock } from '@lucide/svelte';
import { can, isValidationError, runService } from '@protoyard/renderer-svelte';
import { FormField, Input, RadioGroup, Select } from '@protoyard/ui';
import { Alert } from 'texuli/alert';
import { LucideIcon } from 'texuli/icons/lucide';
import { Box } from 'texuli/typography';
import Fact from '../components/Fact.svelte';
import StepFooter from '../components/StepFooter.svelte';
import StepHeading from '../components/StepHeading.svelte';
import { TEAM_SIZES, type TeamSize, USE_CASES, type UseCase } from '../database/schema.ts';
import { CAPABILITIES } from '../domain/policy.ts';
import { slugify } from '../domain/validation.ts';
import { useOnboarding } from '../lib/context.ts';
import { TEAM_SIZE_LABELS, USE_CASE_LABELS } from '../lib/format.ts';

let { onBack }: { onBack: () => void } = $props();
const { services, workspace } = useOnboarding();
const canEdit = $derived(can(CAPABILITIES.workspaceUpdate));

let form = $state({ name: '', slug: '', teamSize: '', useCase: '' });
let slugTouched = $state(false);
let loaded = $state(false);
let errors = $state<Record<string, string>>({});
let busy = $state(false);

// Prefill once the stored workspace arrives (it is created at signup).
$effect(() => {
  const w = workspace.current;
  if (w && !loaded) {
    form = { name: w.name, slug: w.slug, teamSize: w.teamSize ?? '', useCase: w.useCase ?? '' };
    slugTouched = w.slug !== slugify(w.name);
    loaded = true;
  }
});

function onNameInput() {
  // Keep the URL in sync with the name until the person edits the URL themselves.
  if (!slugTouched) form.slug = slugify(form.name);
}

async function submit(event: SubmitEvent) {
  event.preventDefault();
  busy = true;
  const result = await runService(() =>
    canEdit
      ? services.saveWorkspace({
          ...form,
          teamSize: form.teamSize as TeamSize,
          useCase: form.useCase as UseCase,
        })
      : services.acknowledgeWorkspace()
  );
  busy = false;
  if (!result.ok && isValidationError(result.error)) errors = result.error.issues;
}
</script>

<StepHeading
  title={canEdit ? 'Set up your workspace' : 'Your workspace'}
  description={canEdit
    ? 'Your team will find everything here. The URL is how people reach it.'
    : 'This is the workspace you were invited to.'}
/>

{#if canEdit}
  <form id="step-workspace" class="grid gap-4 sm:grid-cols-2" onsubmit={submit} novalidate>
    <FormField label="Workspace name" required error={errors.name}>
      {#snippet children(control)}
        <Input {...control.props} bind:value={form.name} oninput={onNameInput} autocomplete="organization" maxlength={48} />
      {/snippet}
    </FormField>
    <FormField label="Workspace URL" required error={errors.slug} description={`app.example.com/${form.slug || 'your-team'}`}>
      {#snippet children(control)}
        <Input {...control.props} bind:value={form.slug} oninput={() => (slugTouched = true)} autocomplete="off" spellcheck={false} maxlength={32} />
      {/snippet}
    </FormField>
    <FormField label="Team size" required error={errors.teamSize} class="sm:col-span-2">
      {#snippet children(control)}
        <Select {...control.props} placeholder="How many people?" items={TEAM_SIZES.map((s) => ({ value: s, label: TEAM_SIZE_LABELS[s] ?? s }))} bind:value={form.teamSize} />
      {/snippet}
    </FormField>
    <FormField label="What will you use it for?" required error={errors.useCase} class="sm:col-span-2">
      {#snippet children(control)}
        <RadioGroup
          {...control.props}
          class="grid gap-2 sm:grid-cols-2"
          bind:value={form.useCase}
          items={USE_CASES.map((u) => ({ value: u, label: USE_CASE_LABELS[u]?.label ?? u, description: USE_CASE_LABELS[u]?.description }))}
        />
      {/snippet}
    </FormField>
  </form>
{:else}
  <form id="step-workspace" onsubmit={submit} novalidate>
    {#if workspace.current}
      <Box border="default" radius="lg" surface="subtle" padding="md">
        <dl class="grid gap-4 sm:grid-cols-2">
          <Fact label="Name" value={workspace.current.name} />
          <Fact label="URL" value={`app.example.com/${workspace.current.slug}`} />
          <Fact label="Team size" value={TEAM_SIZE_LABELS[workspace.current.teamSize ?? ''] ?? 'Not set yet'} />
          <Fact label="Used for" value={USE_CASE_LABELS[workspace.current.useCase ?? '']?.label ?? 'Not set yet'} />
        </dl>
      </Box>
    {/if}
    <Alert tone="neutral" role="note" class="mt-4" text="Only owners and admins can change workspace settings. Continue to finish your own setup.">
      {#snippet icon()}<LucideIcon icon={Lock} size="sm" class="shrink-0" />{/snippet}
    </Alert>
  </form>
{/if}

<StepFooter form="step-workspace" {busy} {onBack} />
