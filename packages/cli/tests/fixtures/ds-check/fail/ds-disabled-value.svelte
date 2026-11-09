<script lang="ts">
import { Button } from 'texuli/button';

let { onSave }: { onSave: () => Promise<void> } = $props();
</script>

<div class="flex justify-end gap-2">
  <Button variant="ghost" onclick={onSave}>Save</Button>
  <Button variant="outline" tone="destructive" onclick={onSave}>Delete</Button>
</div>
