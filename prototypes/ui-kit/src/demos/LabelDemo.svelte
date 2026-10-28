<script lang="ts">
import { Input, Label } from '@protoyard/ui';

let title = $state('');
let locked = $state(true);
</script>

<div class="grid max-w-md gap-5">
  <div class="grid gap-1.5">
    <Label for="label-demo-title" required>Project title</Label>
    <Input id="label-demo-title" bind:value={title} required placeholder="Click the label to focus me" />
    <p class="text-xs text-muted-foreground">
      The asterisk is visual only; <code>required</code> on the input carries the semantics.
    </p>
  </div>

  <div class="grid gap-1.5">
    <div class="flex items-center gap-3">
      <Input id="label-demo-locked" class="peer max-w-48" disabled={locked} value="read-only value" />
      <Label for="label-demo-locked">Dims with a disabled peer</Label>
    </div>
    <label class="flex items-center gap-2 text-xs text-muted-foreground">
      <Input type="checkbox" checked={locked} onchange={(event) => (locked = event.currentTarget.checked)} />
      Disable the input
    </label>
  </div>
</div>
