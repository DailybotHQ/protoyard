<script lang="ts">
import { Info } from '@lucide/svelte';
import { Badge, Button, Checkbox, Popover } from '@protoyard/ui';

const statuses = ['Open', 'In review', 'Blocked', 'Done'];
let selected = $state<string[]>(['Open', 'In review']);
let open = $state(false);

function toggle(status: string, value: boolean): void {
  selected = value ? [...selected, status] : selected.filter((s) => s !== status);
}
</script>

<div class="grid gap-4">
  <div class="flex flex-wrap items-center gap-3">
    <Popover bind:open align="start">
      {#snippet trigger({ props })}
        <Button {...props} variant="outline">
          Status filter
          <Badge variant="secondary">{selected.length}</Badge>
        </Button>
      {/snippet}
      <div class="grid gap-3">
        <p class="font-medium">Show issues that are…</p>
        {#each statuses as status (status)}
          <Checkbox
            label={status}
            bind:checked={() => selected.includes(status), (value) => toggle(status, value)}
          />
        {/each}
        <div class="flex justify-between gap-2 pt-1">
          <Button size="sm" variant="ghost" onclick={() => (selected = [])}>Clear</Button>
          <Button size="sm" onclick={() => (open = false)}>Done</Button>
        </div>
      </div>
    </Popover>

    <Popover side="right">
      {#snippet trigger({ props })}
        <Button {...props} size="icon" variant="ghost" aria-label="About billing cycles">
          <Info aria-hidden="true" />
        </Button>
      {/snippet}
      <p class="text-muted-foreground">
        Billing cycles start on the day you upgraded. Prorated charges appear on the next invoice.
      </p>
    </Popover>
  </div>
  <p class="text-xs text-muted-foreground" aria-live="polite">
    Filter: {selected.length ? selected.join(', ') : 'none'}
  </p>
</div>
