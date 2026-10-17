<script lang="ts">
import { Lock } from '@lucide/svelte';
import { can, isValidationError, runService } from '@protoyard/renderer-svelte';
import { FormField, Input, RadioGroup, Select } from '@protoyard/ui';
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
      <dl class="grid gap-4 rounded-lg border border-border bg-muted/40 p-4 text-sm sm:grid-cols-2">
        <div><dt class="text-muted-foreground">Name</dt><dd class="font-medium">{workspace.current.name}</dd></div>
        <div><dt class="text-muted-foreground">URL</dt><dd class="font-medium">app.example.com/{workspace.current.slug}</dd></div>
        <div><dt class="text-muted-foreground">Team size</dt><dd class="font-medium">{TEAM_SIZE_LABELS[workspace.current.teamSize ?? ''] ?? 'Not set yet'}</dd></div>
        <div><dt class="text-muted-foreground">Used for</dt><dd class="font-medium">{USE_CASE_LABELS[workspace.current.useCase ?? '']?.label ?? 'Not set yet'}</dd></div>
      </dl>
    {/if}
    <p class="mt-4 flex items-start gap-2 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground" role="note">
      <Lock class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      Only owners and admins can change workspace settings. Continue to finish your own setup.
    </p>
  </form>
{/if}

<StepFooter form="step-workspace" {busy} {onBack} />
