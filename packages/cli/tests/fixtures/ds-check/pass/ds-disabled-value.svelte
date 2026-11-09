<script lang="ts">
import { Button, type ButtonVariant } from 'texuli/button';

let { onSave, variant = 'outline' }: { onSave: () => Promise<void>; variant?: ButtonVariant } =
  $props();
</script>

<div class="flex justify-end gap-2">
  <Button variant="outline" onclick={onSave}>Save</Button>
  <Button {variant} onclick={onSave}>Save as</Button>
  <Button variant="outline" tone="success" onclick={onSave}>Publish</Button>
</div>
