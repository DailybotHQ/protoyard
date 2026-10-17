<script lang="ts">
import { CircleAlert, CircleCheck } from '@lucide/svelte';
import { Badge, type BadgeVariant, Button } from '@protoyard/ui';

const variants: BadgeVariant[] = [
  'default',
  'secondary',
  'outline',
  'success',
  'warning',
  'destructive',
  'info',
];
let unread = $state(3);
</script>

<div class="grid gap-5">
  <div class="flex flex-wrap items-center gap-2">
    {#each variants as variant (variant)}
      <Badge {variant}>{variant}</Badge>
    {/each}
  </div>
  <div class="flex flex-wrap items-center gap-2">
    <Badge variant="success"><CircleCheck aria-hidden="true" /> Paid</Badge>
    <Badge variant="destructive"><CircleAlert aria-hidden="true" /> Overdue</Badge>
    <Badge variant="outline">v2.4.0</Badge>
  </div>
  <div class="flex flex-wrap items-center gap-3">
    <span class="inline-flex items-center gap-2 text-sm font-medium">
      Inbox
      {#if unread > 0}
        <Badge variant={unread > 9 ? 'destructive' : 'default'}>
          {unread > 99 ? '99+' : unread}<span class="sr-only"> unread</span>
        </Badge>
      {/if}
    </span>
    <Button size="sm" variant="outline" onclick={() => (unread += 1)}>+1</Button>
    <Button size="sm" variant="outline" onclick={() => (unread += 10)}>+10</Button>
    <Button size="sm" variant="ghost" onclick={() => (unread = 0)} disabled={unread === 0}>
      Mark all read
    </Button>
  </div>
  <p class="text-xs text-muted-foreground">
    Semantic badges use filled token pairs so small text keeps AA contrast.
  </p>
</div>
