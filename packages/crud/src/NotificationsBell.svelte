<script lang="ts">
import { Bell } from '@lucide/svelte';
import { type BlueprintNotificationService, createNotificationService } from '@protoyard/blueprint';
import type { PrototypeRuntime, Row } from '@protoyard/core';
import { liveQuery, runService, usePrincipal } from '@protoyard/renderer-svelte';
import { Button, Popover } from '@protoyard/ui';
import { LucideIcon } from 'texuli/icons/lucide';

/**
 * Header bell for blueprint notifications: unread badge, list, mark read / all.
 * Reads via liveQuery so the badge updates when rules write rows.
 */
let {
  runtime,
  service: serviceProp,
  class: className,
}: {
  runtime: PrototypeRuntime;
  /** Optional override (tests). */
  service?: BlueprintNotificationService;
  class?: string;
} = $props();

const service = $derived(serviceProp ?? createNotificationService(runtime));
const principal = usePrincipal(runtime);
const personaId = $derived(principal.current?.persona.id ?? '');

let open = $state(false);

const unreadQuery = liveQuery(
  async () => {
    if (!personaId) return 0;
    return service.unreadCount();
  },
  { initial: 0, deps: () => [personaId, service] }
);

const listQuery = liveQuery(
  async (): Promise<Row[]> => {
    if (!personaId || !open) return [];
    return service.list();
  },
  { initial: [], deps: () => [personaId, open, service] }
);

const unread = $derived(unreadQuery.current ?? 0);
const items = $derived(listQuery.current ?? []);
const loading = $derived(listQuery.loading && open);

async function markRead(id: string) {
  await runService(() => service.markRead(id));
}

async function markAll() {
  await runService(() => service.markAllRead());
}

// mark* use runService for offline/failure toasts; liveQuery refreshes the badge.

function titleOf(row: Row): string {
  return typeof row.title === 'string' && row.title ? row.title : 'Notification';
}

function isUnread(row: Row): boolean {
  return row.readAt === null || row.readAt === undefined;
}

function whenOf(row: Row): string {
  const at = typeof row.createdAt === 'string' ? row.createdAt : '';
  if (!at) return '';
  try {
    return new Date(at).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return at;
  }
}
</script>

{#if personaId}
  <div class={className} data-testid="notifications-bell">
    <Popover bind:open side="bottom" align="end" class="w-80 p-0">
      {#snippet trigger({ props })}
        <Button
          {...props}
          type="button"
          variant="ghost"
          size="icon"
          class="relative"
          aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
          data-testid="notifications-bell-trigger"
        >
          <LucideIcon icon={Bell} />
          {#if unread > 0}
            <span
              class="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground"
              data-testid="notifications-unread-badge"
            >
              {unread > 99 ? '99+' : unread}
            </span>
          {/if}
        </Button>
      {/snippet}

      <div class="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <p class="text-sm font-semibold">Notifications</p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          class="h-8 text-xs"
          disabled={unread === 0}
          data-testid="notifications-mark-all"
          onclick={() => markAll()}
        >
          Mark all read
        </Button>
      </div>

      <div class="max-h-80 overflow-y-auto" data-testid="notifications-list" aria-live="polite">
        {#if loading && items.length === 0}
          <p class="px-3 py-6 text-center text-sm text-muted-foreground">Loading…</p>
        {:else if items.length === 0}
          <p class="px-3 py-6 text-center text-sm text-muted-foreground" data-testid="notifications-empty">
            No notifications yet.
          </p>
        {:else}
          <ul class="divide-y divide-border">
            {#each items as row (String(row.id))}
              <li>
                <Button
                  type="button"
                  variant="ghost"
                  class={[
                    'flex w-full flex-col items-start whitespace-normal break-words select-text gap-0.5 px-3 py-2.5 text-left hover:bg-muted',
                    isUnread(row) && 'bg-muted',
                  ]}
                  data-testid="notification-item"
                  data-notification-id={String(row.id)}
                  data-unread={isUnread(row) ? 'true' : 'false'}
                  onclick={() => markRead(String(row.id))}
                >
                  <span class="text-sm font-medium text-foreground">{titleOf(row)}</span>
                  <span class="text-xs text-muted-foreground">{whenOf(row)}</span>
                  {#if isUnread(row)}
                    <span class="sr-only">Unread. Activate to mark as read.</span>
                  {/if}
                </Button>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    </Popover>
  </div>
{/if}
