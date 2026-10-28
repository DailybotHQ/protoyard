<script lang="ts">
import { type Step, StepSchema } from '@protoyard/flows/model';
import { Textarea } from 'texuli/input';

let { step, fieldId, onChange }: { step: Step; fieldId: string; onChange: (step: Step) => void } =
  $props();

let source = $state('');
let error = $state('');

$effect(() => {
  source = JSON.stringify(step, null, 2);
  error = '';
});

function edit(value: string): void {
  source = value;
  try {
    const parsed = StepSchema.safeParse(JSON.parse(source));
    if (!parsed.success) {
      error = parsed.error.issues[0]?.message ?? 'Enter a valid step definition.';
      return;
    }
    error = '';
    onChange(parsed.data);
  } catch {
    error = 'Enter a valid JSON step definition.';
  }
}
</script>

<div class="grid gap-2">
  <label class="grid gap-1 text-sm font-medium" for={fieldId}>Step definition (JSON)</label>
  <Textarea
    id={fieldId}
    class="min-h-40 w-full rounded-md border border-border bg-background p-2 font-mono text-xs text-foreground focus-visible:outline-2 focus-visible:outline-ring"
    value={source}
    rows={8}
    spellcheck="false"
    aria-invalid={error ? 'true' : undefined}
    aria-describedby={error ? `${fieldId}-error` : undefined}
    onValueChange={edit}
  />
  {#if error}<p id="{fieldId}-error" class="m-0 text-sm text-destructive" role="alert">{error}</p>{/if}
  <p class="m-0 text-xs text-muted-foreground">Strict step schema only; executable expressions are not accepted.</p>
</div>
