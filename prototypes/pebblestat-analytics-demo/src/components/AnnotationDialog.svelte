<script lang="ts">
import { isValidationError, runService, useClock } from '@protoyard/renderer-svelte';
import { Button, Dialog, FormField, Input, Select } from '@protoyard/ui';
import { ANNOTATION_KINDS, type AnnotationKind } from '../database/schema.ts';
import { useAnalytics } from '../lib/context.ts';

/** Adds a release, incident or campaign note on a past day. */
let { open = $bindable(false), projectId }: { open?: boolean; projectId: string } = $props();

const { services } = useAnalytics();
const clock = useClock();
let form = $state({ title: '', kind: 'release' as string, day: '' });
let errors = $state<Record<string, string>>({});
let saving = $state(false);
const LABELS: Record<AnnotationKind, string> = {
  release: 'Release',
  incident: 'Incident',
  campaign: 'Campaign',
};

$effect(() => {
  if (open) {
    form = { title: '', kind: 'release', day: clock.now.toISOString().slice(0, 10) };
    errors = {};
  }
});

async function submit(event: SubmitEvent) {
  event.preventDefault();
  saving = true;
  const result = await runService(
    () =>
      services.annotations.create({
        projectId,
        title: form.title,
        kind: form.kind as AnnotationKind,
        day: form.day,
      }),
    { success: 'Annotation added' }
  );
  saving = false;
  if (result.ok) open = false;
  else if (isValidationError(result.error)) errors = result.error.issues;
}
</script>

<Dialog bind:open title="Add annotation" description="Marks a day on the trend charts for everyone in the workspace.">
  <form id="annotation-form" class="grid gap-4" onsubmit={submit} novalidate>
    <FormField label="Title" required error={errors.title}>
      {#snippet children(control)}
        <Input {...control.props} bind:value={form.title} placeholder="v2.6: faster exports" autocomplete="off" maxlength={80} />
      {/snippet}
    </FormField>
    <div class="grid gap-4 sm:grid-cols-2">
      <FormField label="Kind" required error={errors.kind}>
        {#snippet children(control)}
          <Select {...control.props} items={ANNOTATION_KINDS.map((k) => ({ value: k, label: LABELS[k] }))} bind:value={form.kind} />
        {/snippet}
      </FormField>
      <FormField label="Day (UTC)" required error={errors.day}>
        {#snippet children(control)}
          <Input {...control.props} type="date" bind:value={form.day} max={clock.now.toISOString().slice(0, 10)} />
        {/snippet}
      </FormField>
    </div>
  </form>
  {#snippet footer()}
    <Button variant="ghost" onclick={() => (open = false)}>Cancel</Button>
    <Button type="submit" form="annotation-form" loading={saving}>Add annotation</Button>
  {/snippet}
</Dialog>
