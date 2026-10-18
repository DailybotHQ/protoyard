<script lang="ts">
import { AI_MODELS } from '@protoyard/ai';
import { isValidationError, navigate, runService } from '@protoyard/renderer-svelte';
import { Button, Checkbox, Dialog, FormField, Input, Select, Textarea } from '@protoyard/ui';
import { type Agent, TOOL_NAMES, type ToolName } from '../database/schema.ts';
import { services } from '../lib/services.ts';

let { open = $bindable(false), agent = null }: { open?: boolean; agent?: Agent | null } = $props();

const TOOL_HELP: Record<ToolName, string> = {
  search: 'Fictional help-center search',
  'calendar.lookup': 'Fictional team calendar',
  'crm.lookup': 'Fictional customer records',
  'code.run': 'Simulated result; code is never executed',
};

let form = $state(blank());
let errors = $state<Record<string, string>>({});
let saving = $state(false);

$effect(() => {
  if (open) {
    form = blank();
    errors = {};
  }
});

function blank() {
  return {
    name: agent?.name ?? '',
    description: agent?.description ?? '',
    instructions: agent?.instructions ?? '',
    modelId: agent?.modelId ?? (AI_MODELS[0]?.id as string),
    tools: Object.fromEntries(TOOL_NAMES.map((t) => [t, agent?.tools.includes(t) ?? false])),
    approval: Object.fromEntries(
      TOOL_NAMES.map((t) => [t, agent?.approvalTools.includes(t) ?? false])
    ),
  };
}

async function submit(event: SubmitEvent) {
  event.preventDefault();
  saving = true;
  const tools = TOOL_NAMES.filter((t) => form.tools[t]);
  const input = {
    name: form.name,
    description: form.description,
    instructions: form.instructions,
    modelId: form.modelId,
    tools,
    approvalTools: tools.filter((t) => form.approval[t]),
  };
  const result = await runService(
    () => (agent ? services().agents.update(agent.id, input) : services().agents.create(input)),
    { success: agent ? 'Agent saved' : 'Agent created' }
  );
  saving = false;
  if (result.ok) {
    open = false;
    if (!agent) navigate(`/agents/${result.value.id}`);
  } else if (isValidationError(result.error)) {
    errors = result.error.issues;
  }
}
</script>

<Dialog bind:open title={agent ? 'Edit agent' : 'New agent'} size="lg">
  <form id="agent-form" class="grid gap-4" onsubmit={submit} novalidate>
    <div class="grid gap-4 sm:grid-cols-2">
      <FormField label="Name" required error={errors.name}>
        {#snippet children(control)}
          <Input {...control.props} bind:value={form.name} placeholder="Billing helper" autocomplete="off" />
        {/snippet}
      </FormField>
      <FormField label="Model" required description="Simulated models; costs are estimates" error={errors.modelId}>
        {#snippet children(control)}
          <Select {...control.props} items={AI_MODELS.map((m) => ({ value: m.id, label: `${m.name} · ${(m.contextWindow / 1000).toFixed(0)}k` }))} bind:value={form.modelId} />
        {/snippet}
      </FormField>
    </div>
    <FormField label="Description" error={errors.description}>
      {#snippet children(control)}
        <Input {...control.props} bind:value={form.description} placeholder="What this agent is for" />
      {/snippet}
    </FormField>
    <FormField label="Instructions" required error={errors.instructions}>
      {#snippet children(control)}
        <Textarea {...control.props} rows={5} bind:value={form.instructions} placeholder="You answer billing questions. Look up the customer first…" />
      {/snippet}
    </FormField>
    <fieldset class="rounded-lg border border-border p-3">
      <legend class="px-1 text-sm font-medium">Tools</legend>
      <ul class="grid gap-3 sm:grid-cols-2">
        {#each TOOL_NAMES as tool (tool)}
          <li class="space-y-1.5">
            <Checkbox bind:checked={form.tools[tool]} label={tool} />
            <p class="pl-6 text-xs text-muted-foreground">{TOOL_HELP[tool]}</p>
            {#if form.tools[tool]}
              <div class="pl-6"><Checkbox bind:checked={form.approval[tool]} label="Require approval" /></div>
            {/if}
          </li>
        {/each}
      </ul>
      {#if errors.approvalTools || errors.tools}
        <p class="mt-2 text-sm text-destructive" role="alert">{errors.approvalTools ?? errors.tools}</p>
      {/if}
    </fieldset>
  </form>
  {#snippet footer()}
    <Button variant="ghost" onclick={() => (open = false)}>Cancel</Button>
    <Button type="submit" form="agent-form" loading={saving}>{agent ? 'Save agent' : 'Create agent'}</Button>
  {/snippet}
</Dialog>
