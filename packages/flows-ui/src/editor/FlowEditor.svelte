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
import ConditionEditor from './ConditionEditor.svelte';
import StepDataEditor from './StepDataEditor.svelte';
import TriggerDataEditor from './TriggerDataEditor.svelte';

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

$effect(() => {
  current = flow;
  nameDraft = flow.name;
  diagnostics = [];
});

function apply(operations: FlowOperation[]): void {
  const result = applyOperations(current, operations);
  diagnostics = result.diagnostics;
  if (!result.ok) return;
  current = result.flow;
  onChange?.(result.flow, operations);
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

  <div class="grid gap-4 sm:grid-cols-2">
    <label class="grid gap-1 text-sm font-medium" for="flow-name">Name
      <input
        id="flow-name"
        class="min-h-10 rounded-md border border-border bg-background px-3 text-foreground focus-visible:outline-2 focus-visible:outline-ring"
        value={nameDraft}
        maxlength="80"
        aria-invalid={diagnostics.some((item) => item.severity === 'error') ? 'true' : undefined}
        oninput={(event) => {
          nameDraft = event.currentTarget.value;
          apply([{ op: 'update_flow', patch: { name: nameDraft } }]);
        }}
      />
    </label>
    <label class="grid gap-1 text-sm font-medium" for="flow-status">Status
      <select
        id="flow-status"
        class="min-h-10 rounded-md border border-border bg-background px-3 text-foreground focus-visible:outline-2 focus-visible:outline-ring"
        value={current.status}
        onchange={(event) => apply([{ op: 'set_status', status: event.currentTarget.value as Flow['status'] }])}
      >
        <option value="draft">Draft</option>
        <option value="active">Active</option>
        <option value="paused">Paused</option>
      </select>
    </label>
  </div>

  <section class="grid gap-3" aria-labelledby="flow-triggers-heading">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h3 id="flow-triggers-heading" class="m-0 text-base font-semibold">Triggers</h3>
      <button type="button" class="min-h-9 rounded-md border border-border px-3 text-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring" onclick={addManualTrigger}>Add manual trigger</button>
    </div>
    {#each current.triggers as trigger (trigger.id)}
      <fieldset class="grid gap-3 rounded-lg border border-border p-3">
        <legend class="px-1 text-sm font-medium">{trigger.type} · {trigger.id}</legend>
        {#if trigger.type === 'manual'}
          <label class="grid gap-1 text-sm" for="trigger-{trigger.id}-label">Button label
            <input id="trigger-{trigger.id}-label" class="min-h-10 rounded-md border border-border bg-background px-3" value={trigger.label} maxlength="80" oninput={(event) => updateTrigger(trigger, { label: event.currentTarget.value })} />
          </label>
        {:else if trigger.type === 'event'}
          <label class="grid gap-1 text-sm" for="trigger-{trigger.id}-event">Event name
            <input id="trigger-{trigger.id}-event" class="min-h-10 rounded-md border border-border bg-background px-3" value={trigger.event} oninput={(event) => updateTrigger(trigger, { event: event.currentTarget.value })} />
          </label>
          <label class="grid gap-1 text-sm" for="trigger-{trigger.id}-source">Source
            <select id="trigger-{trigger.id}-source" class="min-h-10 rounded-md border border-border bg-background px-3" value={trigger.source ?? ''} onchange={(event) => updateTrigger(trigger, { source: (event.currentTarget.value || undefined) as typeof trigger.source })}>
              <option value="">Any source</option><option value="records">Records</option><option value="people">People</option><option value="app">App</option><option value="integration">Integration</option>
            </select>
          </label>
          <ConditionEditor fieldId="trigger-{trigger.id}-filter" label="Event filter condition (JSON)" condition={trigger.filter} onChange={(condition) => updateTrigger(trigger, { filter: condition })} onRemove={trigger.filter ? () => updateTrigger(trigger, { filter: undefined }) : undefined} />
        {:else if trigger.type === 'schedule'}
          <div class="grid gap-3 sm:grid-cols-2">
            <label class="grid gap-1 text-sm" for="trigger-{trigger.id}-time">Time
              <input id="trigger-{trigger.id}-time" type="time" class="min-h-10 rounded-md border border-border bg-background px-3" value={trigger.time} oninput={(event) => updateTrigger(trigger, { time: event.currentTarget.value })} />
            </label>
            <label class="grid gap-1 text-sm" for="trigger-{trigger.id}-zone">Time zone
              <input id="trigger-{trigger.id}-zone" class="min-h-10 rounded-md border border-border bg-background px-3" value={trigger.timezone} oninput={(event) => updateTrigger(trigger, { timezone: event.currentTarget.value })} />
            </label>
          </div>
          <div class="flex flex-wrap gap-x-4 gap-y-2" aria-label="Schedule days">
            {#each ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as day}
              <label class="inline-flex items-center gap-2 text-sm capitalize"><input type="checkbox" checked={trigger.days.includes(day as (typeof trigger.days)[number])} onchange={(event) => updateTrigger(trigger, { days: event.currentTarget.checked ? [...trigger.days, day as (typeof trigger.days)[number]] : trigger.days.filter((item) => item !== day) })} />{day}</label>
            {/each}
          </div>
        {:else}
          <label class="grid gap-1 text-sm" for="trigger-{trigger.id}-type">Sample event type
            <input id="trigger-{trigger.id}-type" class="min-h-10 rounded-md border border-border bg-background px-3" value={trigger.eventType} oninput={(event) => updateTrigger(trigger, { eventType: event.currentTarget.value })} />
          </label>
          <p class="m-0 text-xs text-muted-foreground">Webhook triggers run only against their declared sample payload. They never contact a network.</p>
        {/if}
        <details class="rounded-md border border-border p-3">
          <summary class="cursor-pointer text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring">Advanced trigger configuration</summary>
          <div class="mt-3">
            <TriggerDataEditor fieldId="trigger-{trigger.id}-definition" {trigger} onChange={(next) => updateTrigger(trigger, next)} />
          </div>
        </details>
        <button type="button" class="min-h-9 justify-self-start rounded-md border border-border px-3 text-sm text-destructive focus-visible:outline-2 focus-visible:outline-ring" onclick={() => apply([{ op: 'remove_trigger', triggerId: trigger.id }])}>Remove trigger</button>
      </fieldset>
    {/each}
  </section>

  <section class="grid gap-3" aria-labelledby="flow-steps-heading">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h3 id="flow-steps-heading" class="m-0 text-base font-semibold">Steps</h3>
      <button type="button" class="min-h-9 rounded-md border border-border px-3 text-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring" onclick={addReplyStep}>Add reply step</button>
    </div>
    {#if current.steps.length === 0}<p class="m-0 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">No steps yet. Add a reply step to begin.</p>{/if}
    {#each current.steps as step, index (step.id)}
      <fieldset class="grid gap-3 rounded-lg border border-border p-3">
        <legend class="px-1 text-sm font-medium">Step {index + 1}: {step.type} · {step.id}</legend>
        <div class="grid gap-3 sm:grid-cols-2">
          <label class="grid gap-1 text-sm" for="step-{step.id}-label">Label
            <input id="step-{step.id}-label" class="min-h-10 rounded-md border border-border bg-background px-3" value={step.label ?? ''} maxlength="120" oninput={(event) => updateStep(step, { label: event.currentTarget.value || undefined })} />
          </label>
          <label class="inline-flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" checked={step.enabled !== false} onchange={(event) => updateStep(step, { enabled: event.currentTarget.checked })} />Step enabled</label>
        </div>
        {#if step.type === 'reply' && typeof step.text === 'string'}
          <label class="grid gap-1 text-sm" for="step-{step.id}-text">Reply text
            <textarea id="step-{step.id}-text" class="min-h-20 rounded-md border border-border bg-background p-2" value={step.text} maxlength="4000" oninput={(event) => updateStepText(step, event.currentTarget.value)}></textarea>
          </label>
        {:else if step.type === 'message' && typeof step.text === 'string'}
          <div class="grid gap-3 sm:grid-cols-2">
            <label class="grid gap-1 text-sm" for="step-{step.id}-channel">Channel
              <select id="step-{step.id}-channel" class="min-h-10 rounded-md border border-border bg-background px-3" value={step.channel} onchange={(event) => updateStep(step, { channel: event.currentTarget.value })}>
                <option value="chat">Chat</option><option value="email">Email</option><option value="inbox">Inbox</option><option value="notification">Notification</option>
              </select>
            </label>
            <label class="grid gap-1 text-sm" for="step-{step.id}-text">Message text
              <textarea id="step-{step.id}-text" class="min-h-20 rounded-md border border-border bg-background p-2" value={step.text} maxlength="4000" oninput={(event) => updateStepText(step, event.currentTarget.value)}></textarea>
            </label>
          </div>
        {:else if step.type === 'approval' && typeof step.prompt === 'string'}
          <label class="grid gap-1 text-sm" for="step-{step.id}-prompt">Approval prompt
            <textarea id="step-{step.id}-prompt" class="min-h-20 rounded-md border border-border bg-background p-2" value={step.prompt} maxlength="4000" oninput={(event) => updateStepText(step, event.currentTarget.value)}></textarea>
          </label>
        {:else if step.type === 'wait'}
          <label class="grid gap-1 text-sm" for="step-{step.id}-minutes">Wait duration in simulated minutes
            <input id="step-{step.id}-minutes" type="number" min="1" max="525600" class="min-h-10 rounded-md border border-border bg-background px-3" value={step.minutes} oninput={(event) => updateStep(step, { minutes: Number(event.currentTarget.value) })} />
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
        <button type="button" class="min-h-9 justify-self-start rounded-md border border-border px-3 text-sm text-destructive focus-visible:outline-2 focus-visible:outline-ring" onclick={() => apply([{ op: 'remove_step', stepId: step.id }])}>Remove step</button>
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
