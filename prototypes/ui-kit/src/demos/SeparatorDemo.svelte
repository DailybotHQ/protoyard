<script lang="ts">
import { Input, Separator } from '@protoyard/ui';

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
  <label class="flex items-center gap-2 text-sm">
    <Input type="checkbox" checked={semantic} onchange={(event) => (semantic = event.currentTarget.checked)} />
    Expose as <code>role="separator"</code> (non-decorative)
  </label>
  <p class="text-xs text-muted-foreground">
    Decorative separators are hidden from assistive tech; use the semantic form only when the
    division carries meaning.
  </p>
</div>
