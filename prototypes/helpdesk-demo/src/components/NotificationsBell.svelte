<script lang="ts">
import { Bell } from '@lucide/svelte';
import { createNotificationService } from '@protoyard/blueprint';
import { liveQuery } from '@protoyard/renderer-svelte';
import { Button } from '@protoyard/ui';
import { LucideIcon } from 'texuli/icons/lucide';
import { useCrudApp } from '../lib/context.ts';

const { runtime } = useCrudApp();
const notifications = createNotificationService(runtime);

let open = $state(false);

const unread = liveQuery(() => notifications.unreadCount(), {
  initial: 0,
  deps: () => [],
});
const list = liveQuery(() => notifications.list(), {
  initial: [],
  deps: () => [open],
});
</script>

<div class="relative">
  <Button
    size="sm"
    variant="ghost"
    aria-label="Notifications"
    aria-expanded={open}
    onclick={() => (open = !open)}
  >
    <LucideIcon icon={Bell} class="size-4" />
    {#if (unread.current ?? 0) > 0}
      <span
        class="absolute -top-0.5 -right-0.5 grid min-w-4 place-items-center rounded-full bg-destructive px-1 text-[0.65rem] text-destructive-foreground"
      >
        {unread.current}
      </span>
    {/if}
  </Button>
  {#if open}
    <div
      class="absolute right-0 z-20 mt-1 w-72 rounded-lg border border-border bg-card p-2 shadow-soft"
      role="dialog"
      aria-label="Notification inbox"
    >
      <div class="mb-2 flex items-center justify-between gap-2 px-1">
        <p class="text-xs font-semibold">Notifications</p>
        <Button
          size="sm"
          variant="ghost"
          class="text-xs"
          onclick={() => notifications.markAllRead()}
        >
          Mark all read
        </Button>
      </div>
      <ul class="max-h-64 space-y-1 overflow-y-auto text-sm">
        {#each list.current ?? [] as row (row.id)}
          <li class="rounded-md px-2 py-1.5 hover:bg-muted/50">
            <Button
              type="button"
              variant="ghost"
              class="flex w-full flex-col items-start whitespace-normal text-left"
              onclick={() => notifications.markRead(String(row.id))}
            >
              <p class="font-medium {row.readAt ? 'text-muted-foreground' : ''}">{String(row.title)}</p>
              <p class="text-[0.65rem] text-muted-foreground">{String(row.kind)}</p>
            </Button>
          </li>
        {:else}
          <li class="px-2 py-3 text-xs text-muted-foreground">No notifications yet.</li>
        {/each}
      </ul>
    </div>
  {/if}
</div>
