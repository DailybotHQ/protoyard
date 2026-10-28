<script lang="ts">
import { Checkbox, Separator } from '@protoyard/ui';

let semantic = $state(false);
</script>

<div class="grid max-w-md gap-5">
  <div class="rounded-lg border border-border bg-surface p-4 text-sm">
    <p class="font-medium">Protoyard UI</p>
    <p class="text-muted-foreground">Components for prototypes that feel real.</p>
    <Separator class="my-3" decorative={!semantic} />
    <div class="flex h-5 items-center gap-3 text-muted-foreground">
      <span>Docs</span>
      <Separator orientation="vertical" decorative={!semantic} />
      <span>Source</span>
      <Separator orientation="vertical" decorative={!semantic} />
      <span>Changelog</span>
    </div>
  </div>
  <Checkbox bind:checked={semantic} label={'Expose as role="separator" (non-decorative)'} class="text-sm" />
  <p class="text-xs text-muted-foreground">
    Decorative separators are hidden from assistive tech; use the semantic form only when the
    division carries meaning.
  </p>
</div>
