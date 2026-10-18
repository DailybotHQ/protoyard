<script lang="ts">
import {
  getRuntime,
  isValidationError,
  liveQuery,
  navigate,
  runService,
} from '@protoyard/renderer-svelte';
import { Button, Dialog, FormField, Input, Select } from '@protoyard/ui';
import type { ConsoleDatabase } from '../database/schema.ts';
import { services } from '../lib/services.ts';

let { open = $bindable(false) }: { open?: boolean } = $props();

const runtime = getRuntime<ConsoleDatabase>();
const agents = liveQuery(() => runtime.db.agents.toArray(), { initial: [] });
let name = $state('');
let agentId = $state('');
let errors = $state<Record<string, string>>({});
let saving = $state(false);

$effect(() => {
  if (open) {
    name = '';
    agentId = agents.current?.[0]?.id ?? '';
    errors = {};
  }
});

async function submit(event: SubmitEvent) {
  event.preventDefault();
  saving = true;
  const result = await runService(() => services().datasets.create({ name, agentId }), {
    success: 'Dataset created',
  });
  saving = false;
  if (result.ok) {
    open = false;
    navigate(`/datasets/${result.value.id}`);
  } else if (isValidationError(result.error)) errors = result.error.issues;
}
</script>

<Dialog bind:open title="New dataset" description="A set of prompts with the outcome each one should produce.">
  <form id="dataset-form" class="grid gap-4" onsubmit={submit} novalidate>
    <FormField label="Name" required error={errors.name}>
      {#snippet children(control)}
        <Input {...control.props} bind:value={name} placeholder="Refund questions" autocomplete="off" />
      {/snippet}
    </FormField>
    <FormField label="Agent" required error={errors.agentId}>
      {#snippet children(control)}
        <Select {...control.props} items={(agents.current ?? []).map((a) => ({ value: a.id, label: a.name }))} bind:value={agentId} placeholder="Pick an agent" />
      {/snippet}
    </FormField>
  </form>
  {#snippet footer()}
    <Button variant="ghost" onclick={() => (open = false)}>Cancel</Button>
    <Button type="submit" form="dataset-form" loading={saving}>Create dataset</Button>
  {/snippet}
</Dialog>
