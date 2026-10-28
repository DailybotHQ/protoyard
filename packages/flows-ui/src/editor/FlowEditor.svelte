<script lang="ts">
import {
  applyOperations,
  type Condition,
  describeCondition,
  type Flow,
  type FlowDiagnostic,
  type FlowOperation,
  type Step,
  type Trigger,
} from '@protoyard/flows/model';
import { WorkflowEditor } from '@texuli/workflows/editor';
import type { WorkflowGraph } from '@texuli/workflows/model';
import { Button } from 'texuli/button';
import { Checkbox, RadioGroup } from 'texuli/choice';
import { Input, Textarea } from 'texuli/input';
import ConditionEditor from './ConditionEditor.svelte';
import StepDataEditor from './StepDataEditor.svelte';
import TriggerDataEditor from './TriggerDataEditor.svelte';
import {
  flowStepRegistry,
  graphForFlow,
  graphValidation,
  orderedStepIds,
  reorderOperations,
} from './workflow-graph.ts';

let {
  flow,
  onChange,
}: {
  flow: Flow;
  onChange?: (flow: Flow, operations: readonly FlowOperation[]) => void;
} = $props();

// These editable drafts intentionally start from the prop and resync below.
// svelte-ignore state_referenced_locally
let current = $state.raw(flow);
// svelte-ignore state_referenced_locally
let nameDraft = $state(flow.name);
let diagnostics = $state<FlowDiagnostic[]>([]);
// Keep the editor graph stable between flow updates so Texuli can retain its history.
// svelte-ignore state_referenced_locally
let graphFlow = $state.raw(flow);
// svelte-ignore state_referenced_locally
let workflowGraph = $state.raw<WorkflowGraph>(graphForFlow(flow));

$effect(() => {
  current = flow;
  nameDraft = flow.name;
  diagnostics = [];
  if (flow !== graphFlow) {
    graphFlow = flow;
    workflowGraph = graphForFlow(flow, workflowGraph);
  }
});

function apply(operations: FlowOperation[]): void {
  const result = applyOperations(current, operations);
  diagnostics = result.diagnostics;
  if (!result.ok) return;
  current = result.flow;
  onChange?.(result.flow, operations);
}

function onWorkflowChange(graph: WorkflowGraph): void {
  workflowGraph = graph;
  const order = orderedStepIds(graph, current);
  if (!order) return;
  const operations = reorderOperations(current, order);
  if (operations.length) apply(operations);
}

function validateWorkflow(graph: WorkflowGraph) {
  return graphValidation(graph, current);
}

function nextId(prefix: string): string {
  const taken = new Set([
    ...current.triggers.map((trigger) => trigger.id),
    ...current.steps.map((step) => step.id),
  ]);
  let index = 1;
  while (taken.has(`${prefix}-${index}`)) index += 1;
  return `${prefix}-${index}`;
}

function updateTrigger(trigger: Trigger, patch: Partial<Trigger>): void {
  apply([
    {
      op: 'replace_trigger',
      triggerId: trigger.id,
      trigger: { ...trigger, ...patch } as Trigger,
    },
  ]);
}

function updateStep(step: Step, patch: Record<string, unknown>): void {
  apply([{ op: 'update_step', stepId: step.id, patch }]);
}

function updateCondition(step: Step, condition: Condition): void {
  if (step.type === 'branch') updateStep(step, { when: condition });
  else updateStep(step, { only: condition });
}

function addManualTrigger(): void {
  const trigger: Trigger = { id: nextId('manual'), type: 'manual', label: 'Run manually' };
  apply([{ op: 'add_trigger', trigger }]);
}

function addReplyStep(): void {
  apply([
    {
      op: 'add_step',
      step: { id: nextId('step'), type: 'reply', text: 'A simulated reply' },
    },
  ]);
}

function updateStepText(step: Step, value: string): void {
  if (step.type === 'reply' || step.type === 'message') updateStep(step, { text: value });
  else if (step.type === 'approval') updateStep(step, { prompt: value });
}

function replaceStep(previous: Step, next: Step): void {
  const index = current.steps.findIndex((step) => step.id === previous.id);
  if (index < 0) return;
  apply([
    { op: 'remove_step', stepId: previous.id },
    { op: 'add_step', step: next, index },
  ]);
}
</script>

<section class="grid gap-5 rounded-xl border border-border bg-card p-4 text-foreground sm:p-6" aria-labelledby="flow-editor-heading">
  <header class="grid gap-1">
    <h2 id="flow-editor-heading" class="m-0 text-lg font-semibold">Workflow editor</h2>
    <p class="m-0 text-sm text-muted-foreground">Edit simulated triggers, steps and data-only conditions.</p>
  </header>

  <section class="grid gap-2" aria-labelledby="flow-order-heading">
    <div>
      <h3 id="flow-order-heading" class="m-0 text-base font-semibold">Step order</h3>
      <p class="m-0 text-sm text-muted-foreground">Drag steps or reconnect them to change the top-level order. Branch contents stay in each step's configuration.</p>
    </div>
    <WorkflowEditor
      graph={workflowGraph}
      registry={flowStepRegistry}
      palette={false}
      inspector={false}
      outline={false}
      minimap={false}
      validate={validateWorkflow}
      onchange={(graph) => onWorkflowChange(graph)}
      class="min-h-64"
    />
  </section>

  <div class="grid gap-4 sm:grid-cols-2">
    <label class="grid gap-1 text-sm font-medium" for="flow-name">Name
      <Input
        id="flow-name"
        class="min-h-10 rounded-md border border-border bg-background px-3 text-foreground focus-visible:outline-2 focus-visible:outline-ring"
        value={nameDraft}
        maxlength={80}
        aria-invalid={diagnostics.some((item) => item.severity === 'error') ? 'true' : undefined}
        onValueChange={(value) => {
          nameDraft = value;
          apply([{ op: 'update_flow', patch: { name: nameDraft } }]);
        }}
      />
    </label>
    <fieldset class="grid gap-1 text-sm font-medium">
      <legend>Status</legend>
      <RadioGroup
        name="flow-status"
        aria-label="Workflow status"
        value={current.status}
        orientation="horizontal"
        items={[{ value: 'draft', label: 'Draft' }, { value: 'active', label: 'Active' }, { value: 'paused', label: 'Paused' }]}
        onValueChange={(value) => apply([{ op: 'set_status', status: value as Flow['status'] }])}
      />
    </fieldset>
  </div>

  <section class="grid gap-3" aria-labelledby="flow-triggers-heading">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h3 id="flow-triggers-heading" class="m-0 text-base font-semibold">Triggers</h3>
      <Button variant="outline" size="sm" onclick={addManualTrigger}>Add manual trigger</Button>
    </div>
    {#each current.triggers as trigger (trigger.id)}
      <fieldset class="grid gap-3 rounded-lg border border-border p-3">
        <legend class="px-1 text-sm font-medium">{trigger.type} · {trigger.id}</legend>
        {#if trigger.type === 'manual'}
          <label class="grid gap-1 text-sm" for="trigger-{trigger.id}-label">Button label
            <Input id="trigger-{trigger.id}-label" value={trigger.label} maxlength={80} onValueChange={(label) => updateTrigger(trigger, { label })} />
          </label>
        {:else if trigger.type === 'event'}
          <label class="grid gap-1 text-sm" for="trigger-{trigger.id}-event">Event name
            <Input id="trigger-{trigger.id}-event" value={trigger.event} onValueChange={(event) => updateTrigger(trigger, { event })} />
          </label>
          <div class="grid gap-1 text-sm">
            <span>Source</span>
            <RadioGroup
              name="trigger-{trigger.id}-source"
              aria-label="Event source"
              value={trigger.source ?? 'any'}
              orientation="horizontal"
              items={[{ value: 'any', label: 'Any source' }, { value: 'records', label: 'Records' }, { value: 'people', label: 'People' }, { value: 'app', label: 'App' }, { value: 'integration', label: 'Integration' }]}
              onValueChange={(value) => updateTrigger(trigger, { source: (value === 'any' ? undefined : value) as typeof trigger.source })}
            />
          </div>
          <ConditionEditor fieldId="trigger-{trigger.id}-filter" label="Event filter condition (JSON)" condition={trigger.filter} onChange={(condition) => updateTrigger(trigger, { filter: condition })} onRemove={trigger.filter ? () => updateTrigger(trigger, { filter: undefined }) : undefined} />
        {:else if trigger.type === 'schedule'}
          <div class="grid gap-3 sm:grid-cols-2">
            <label class="grid gap-1 text-sm" for="trigger-{trigger.id}-time">Time
              <Input id="trigger-{trigger.id}-time" type="time" value={trigger.time} onValueChange={(time) => updateTrigger(trigger, { time })} />
            </label>
            <label class="grid gap-1 text-sm" for="trigger-{trigger.id}-zone">Time zone
              <Input id="trigger-{trigger.id}-zone" value={trigger.timezone} onValueChange={(timezone) => updateTrigger(trigger, { timezone })} />
            </label>
          </div>
          <div class="flex flex-wrap gap-x-4 gap-y-2" aria-label="Schedule days">
            {#each ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as day}
              <Checkbox
                checked={trigger.days.includes(day as (typeof trigger.days)[number])}
                label={day}
                onCheckedChange={(checked) => updateTrigger(trigger, { days: checked ? [...trigger.days, day as (typeof trigger.days)[number]] : trigger.days.filter((item) => item !== day) })}
              />
            {/each}
          </div>
        {:else}
          <label class="grid gap-1 text-sm" for="trigger-{trigger.id}-type">Sample event type
            <Input id="trigger-{trigger.id}-type" value={trigger.eventType} onValueChange={(eventType) => updateTrigger(trigger, { eventType })} />
          </label>
          <p class="m-0 text-xs text-muted-foreground">Webhook triggers run only against their declared sample payload. They never contact a network.</p>
        {/if}
        <details class="rounded-md border border-border p-3">
          <summary class="cursor-pointer text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring">Advanced trigger configuration</summary>
          <div class="mt-3">
            <TriggerDataEditor fieldId="trigger-{trigger.id}-definition" {trigger} onChange={(next) => updateTrigger(trigger, next)} />
          </div>
        </details>
        <Button variant="destructive" size="sm" onclick={() => apply([{ op: 'remove_trigger', triggerId: trigger.id }])}>Remove trigger</Button>
      </fieldset>
    {/each}
  </section>

  <section class="grid gap-3" aria-labelledby="flow-steps-heading">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h3 id="flow-steps-heading" class="m-0 text-base font-semibold">Steps</h3>
      <Button variant="outline" size="sm" onclick={addReplyStep}>Add reply step</Button>
    </div>
    {#if current.steps.length === 0}<p class="m-0 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">No steps yet. Add a reply step to begin.</p>{/if}
    {#each current.steps as step, index (step.id)}
      <fieldset class="grid gap-3 rounded-lg border border-border p-3">
        <legend class="px-1 text-sm font-medium">Step {index + 1}: {step.type} · {step.id}</legend>
        <div class="grid gap-3 sm:grid-cols-2">
          <label class="grid gap-1 text-sm" for="step-{step.id}-label">Label
            <Input id="step-{step.id}-label" value={step.label ?? ''} maxlength={120} onValueChange={(label) => updateStep(step, { label: label || undefined })} />
          </label>
          <Checkbox checked={step.enabled !== false} label="Step enabled" onCheckedChange={(enabled) => updateStep(step, { enabled })} />
        </div>
        {#if step.type === 'reply' && typeof step.text === 'string'}
          <label class="grid gap-1 text-sm" for="step-{step.id}-text">Reply text
            <Textarea id="step-{step.id}-text" class="min-h-20" value={step.text} maxlength={4000} onValueChange={updateStepText.bind(null, step)} />
          </label>
        {:else if step.type === 'message' && typeof step.text === 'string'}
          <div class="grid gap-3 sm:grid-cols-2">
            <div class="grid gap-1 text-sm">
              <span>Channel</span>
              <RadioGroup
                name="step-{step.id}-channel"
                aria-label="Message channel"
                value={step.channel}
                orientation="horizontal"
                items={[{ value: 'chat', label: 'Chat' }, { value: 'email', label: 'Email' }, { value: 'inbox', label: 'Inbox' }, { value: 'notification', label: 'Notification' }]}
                onValueChange={(channel) => updateStep(step, { channel })}
              />
            </div>
            <label class="grid gap-1 text-sm" for="step-{step.id}-text">Message text
              <Textarea id="step-{step.id}-text" class="min-h-20" value={step.text} maxlength={4000} onValueChange={updateStepText.bind(null, step)} />
            </label>
          </div>
        {:else if step.type === 'approval' && typeof step.prompt === 'string'}
          <label class="grid gap-1 text-sm" for="step-{step.id}-prompt">Approval prompt
            <Textarea id="step-{step.id}-prompt" class="min-h-20" value={step.prompt} maxlength={4000} onValueChange={updateStepText.bind(null, step)} />
          </label>
        {:else if step.type === 'wait'}
          <label class="grid gap-1 text-sm" for="step-{step.id}-minutes">Wait duration in simulated minutes
            <Input id="step-{step.id}-minutes" type="number" min={1} max={525600} value={String(step.minutes)} onValueChange={(minutes) => updateStep(step, { minutes: Number(minutes) })} />
          </label>
        {/if}
        {#if step.type === 'branch'}
          <ConditionEditor fieldId="step-{step.id}-when" label="Branch condition (JSON)" condition={step.when} onChange={(condition) => updateCondition(step, condition)} />
        {:else}
          <ConditionEditor fieldId="step-{step.id}-only" label="Only run when (JSON)" condition={step.only} onChange={(condition) => updateCondition(step, condition)} onRemove={step.only ? () => updateStep(step, { only: undefined }) : undefined} />
        {/if}
        {#if step.type === 'branch'}
          <p class="m-0 text-xs text-muted-foreground">{describeCondition(step.when)}</p>
        {/if}
        <details class="rounded-md border border-border p-3">
          <summary class="cursor-pointer text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring">Advanced step configuration</summary>
          <div class="mt-3">
            <StepDataEditor fieldId="step-{step.id}-definition" {step} onChange={(next) => replaceStep(step, next)} />
          </div>
        </details>
        <Button variant="destructive" size="sm" onclick={() => apply([{ op: 'remove_step', stepId: step.id }])}>Remove step</Button>
      </fieldset>
    {/each}
  </section>

  {#if diagnostics.length}
    <ul class="m-0 grid gap-1 rounded-lg border border-destructive/40 bg-destructive/5 p-3 pl-8 text-sm" aria-label="Flow validation feedback" role="status">
      {#each diagnostics as diagnostic (diagnostic.code + diagnostic.path + diagnostic.message)}
        <li class={diagnostic.severity === 'error' ? 'text-destructive' : 'text-muted-foreground'}>{diagnostic.message}</li>
      {/each}
    </ul>
  {/if}
</section>
