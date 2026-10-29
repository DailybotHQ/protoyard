<script lang="ts">
import { Checkbox, SafeArea } from '@protoyard/ui';

type Edge = 'top' | 'right' | 'bottom' | 'left';
const all: Edge[] = ['top', 'right', 'bottom', 'left'];
let edges = $state<Edge[]>(['top', 'bottom']);

function toggle(edge: Edge, on: boolean): void {
  edges = on ? all.filter((e) => e === edge || edges.includes(e)) : edges.filter((e) => e !== edge);
}
</script>

<div class="grid gap-4">
  <fieldset class="flex flex-wrap gap-4 text-sm">
    <legend class="mb-2 text-xs text-muted-foreground">Edges that get env(safe-area-inset-*) padding</legend>
    {#each all as edge (edge)}
      <Checkbox
        class="capitalize"
        label={edge}
        checked={edges.includes(edge)}
        onCheckedChange={(checked) => toggle(edge, checked)}
      />
    {/each}
  </fieldset>
  <div class="mx-auto w-full max-w-[390px] rounded-[2rem] border-4 border-border bg-muted p-1">
    <SafeArea {edges} class="min-h-48 rounded-[1.6rem] bg-background outline-2 outline-dashed outline-primary/40">
      <div class="m-1 rounded-xl bg-surface p-4 text-sm">
        <p class="font-medium">App content</p>
        <p class="text-muted-foreground">
          Classes: <code>{edges.map((edge) => `p${edge[0]}-safe`).join(' ') || 'none'}</code>
        </p>
      </div>
    </SafeArea>
  </div>
  <p class="text-xs text-muted-foreground">
    Insets are 0 on screens without notches or home indicators, so on a desktop the padding is
    invisible. On an iPhone (with <code>viewport-fit=cover</code>) content clears the notch.
  </p>
</div>
