<script lang="ts">
import { type Condition, ConditionSchema } from '@protoyard/flows/model';
import { Button } from 'texuli/button';
import { Textarea } from 'texuli/input';

let {
  condition,
  fieldId,
  label,
  onChange,
  onRemove,
}: {
  condition?: Condition;
  fieldId: string;
  label: string;
  onChange: (condition: Condition) => void;
  onRemove?: () => void;
} = $props();

let source = $state('');
let error = $state('');

$effect(() => {
  source = condition ? JSON.stringify(condition, null, 2) : '';
  error = '';
});

function edit(value: string): void {
  source = value;
  try {
    const parsed = ConditionSchema.safeParse(JSON.parse(source));
    if (!parsed.success) {
      error = parsed.error.issues[0]?.message ?? 'Enter a valid condition.';
      return;
    }
    error = '';
    onChange(parsed.data);
  } catch {
    error = 'Enter a valid JSON condition.';
  }
}

function addCondition(): void {
  onChange({ type: 'test', subject: { from: 'trigger', path: ['approved'] }, test: 'true' });
}
</script>

<div class="grid gap-2">
  {#if condition}
    <label class="grid gap-1 text-sm font-medium text-foreground" for={fieldId}>{label}</label>
    <Textarea
      id={fieldId}
      class="min-h-28 w-full rounded-md border border-border bg-background p-2 font-mono text-xs text-foreground focus-visible:outline-2 focus-visible:outline-ring"
      value={source}
      rows={5}
      spellcheck="false"
      aria-invalid={error ? 'true' : undefined}
      aria-describedby={error ? `${fieldId}-error` : undefined}
      onValueChange={edit}
    />
    {#if error}
      <p id="{fieldId}-error" class="m-0 text-sm text-destructive" role="alert">{error}</p>
    {/if}
    {#if onRemove}
      <Button
        class="min-h-9 justify-self-start rounded-md border border-border px-3 text-sm text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
        onclick={onRemove}
      >Remove condition</Button>
    {/if}
  {:else}
    <Button
      class="min-h-9 justify-self-start rounded-md border border-border px-3 text-sm text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
      onclick={addCondition}
    >Add condition</Button>
  {/if}
</div>
