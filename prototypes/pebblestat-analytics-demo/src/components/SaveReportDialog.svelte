<script lang="ts">
import { isValidationError, runService } from '@protoyard/renderer-svelte';
import { Button, Dialog, FormField, Input } from '@protoyard/ui';
import type { ReportConfig } from '../database/schema.ts';
import type { ReportInput } from '../domain/validation.ts';
import { useAnalytics } from '../lib/context.ts';

/** Saves the current Trends query as a named report. */
let {
  open = $bindable(false),
  projectId,
  config,
  suggestion,
}: { open?: boolean; projectId: string; config: ReportConfig; suggestion: string } = $props();

const { services } = useAnalytics();
let name = $state('');
let error = $state<string | undefined>(undefined);
let saving = $state(false);

$effect(() => {
  if (open) {
    name = suggestion;
    error = undefined;
  }
});

async function submit(event: SubmitEvent) {
  event.preventDefault();
  saving = true;
  const result = await runService(
    () =>
      services.reports.save({
        projectId,
        name,
        config: $state.snapshot(config) as ReportInput['config'],
      }),
    { success: 'Report saved' }
  );
  saving = false;
  if (result.ok) open = false;
  else if (isValidationError(result.error))
    error = result.error.issues.name ?? Object.values(result.error.issues)[0];
}
</script>

<Dialog bind:open title="Save report" description="Saves the event, measure, breakdown and filter. Open it again from Reports.">
  <form id="report-form" class="grid gap-4" onsubmit={submit} novalidate>
    <FormField label="Report name" required {error}>
      {#snippet children(control)}
        <Input {...control.props} bind:value={name} autocomplete="off" maxlength={60} />
      {/snippet}
    </FormField>
  </form>
  {#snippet footer()}
    <Button variant="ghost" onclick={() => (open = false)}>Cancel</Button>
    <Button type="submit" form="report-form" loading={saving}>Save report</Button>
  {/snippet}
</Dialog>
