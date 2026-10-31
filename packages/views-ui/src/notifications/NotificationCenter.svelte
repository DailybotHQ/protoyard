<script lang="ts">
import { Bell, Volume2, VolumeX } from '@lucide/svelte';
import { navigate, runService } from '@protoyard/renderer-svelte';
import type { TriggerSnippet } from '@protoyard/ui';
import { BottomSheet, Button, Popover } from '@protoyard/ui';
import { type InboxFilter, NotificationInbox } from '@texuli/data/activity/inbox';
import { onMount } from 'svelte';
import { LucideIcon } from 'texuli/icons/lucide';

/** Blueprint notifications use createdAt/personaId; views rows use at/recipientId. */
export type NotificationItem = {
  id: string;
  kind: string;
  title: string;
  subjectId: string;
  readAt: string | null;
  at?: string;
  createdAt?: string;
  body?: string;
};
type Props = {
  query: {
    readonly current: readonly NotificationItem[] | undefined;
    readonly loading: boolean;
    readonly error: unknown;
  };
  onMarkRead: (id: string) => unknown;
  onMarkAllRead: () => unknown;
  onMuteChange?: (kind: string, muted: boolean) => unknown;
  mutedKinds?: readonly string[];
  hrefFor?: (item: NotificationItem) => string;
  now?: string | number | Date;
  trigger?: TriggerSnippet;
  label?: string;
};
let {
  query,
  onMarkRead,
  onMarkAllRead,
  onMuteChange,
  mutedKinds = [],
  hrefFor = (item) => `/${encodeURIComponent(item.subjectId)}`,
  now = new Date(),
  trigger,
  label = 'Notifications',
}: Props = $props();

type InboxRow = {
  id: string;
  title: string;
  body?: string;
  at: string;
  read: boolean;
  source: NotificationItem;
};

let mobile = $state(false);
let filter = $state<InboxFilter>('unread');
let pendingAll = $state(false);
let pendingIds = $state(new Set<string>());
let pendingMutes = $state(new Set<string>());
let readOverrides = $state<Record<string, string | null>>({});
let localMutes = $state<string[]>([]);
const rows = $derived(query.current ?? []);
const isRead = (row: NotificationItem) => (readOverrides[row.id] ?? row.readAt) != null;
const unreadCount = $derived(rows.filter((row) => !isRead(row)).length);
const muted = (kind: string) => localMutes.includes(kind) || mutedKinds.includes(kind);
// Texuli's inbox (G50) owns the list, the all/unread view, time labels and the
// read toggles; the read state and its persistence stay this host's services.
const items = $derived<InboxRow[]>(
  rows.map((row) => ({
    id: row.id,
    title: row.title,
    ...(row.body ? { body: row.body } : {}),
    at: row.at ?? row.createdAt ?? '',
    read: isRead(row),
    source: row,
  }))
);

onMount(() => {
  const media = window.matchMedia('(max-width: 639px)');
  const update = () => (mobile = media.matches);
  update();
  media.addEventListener('change', update);
  return () => media.removeEventListener('change', update);
});

/** Optimistic read state for `ids`, rolled back when the service fails or returns false. */
async function persistRead(ids: string[], service: () => unknown): Promise<void> {
  const previous = { ...readOverrides };
  const at = new Date(now).toISOString();
  readOverrides = { ...readOverrides, ...Object.fromEntries(ids.map((id) => [id, at])) };
  const result = await runService(service);
  if (!result.ok || result.value === false) readOverrides = previous;
}

async function markRead(id: string) {
  if (pendingAll || pendingIds.has(id)) return;
  pendingIds = new Set(pendingIds).add(id);
  await persistRead([id], () => onMarkRead(id));
  const next = new Set(pendingIds);
  next.delete(id);
  pendingIds = next;
}

async function markAllRead(ids: string[]) {
  if (pendingAll) return;
  pendingAll = true;
  await persistRead(ids, onMarkAllRead);
  pendingAll = false;
}

/** The inbox reports one id for a row (toggle or open) and every unread id for "Mark all". */
function onReadChange(ids: string[], read: boolean) {
  if (!read) return;
  if (ids.length > 1) void markAllRead(ids);
  else if (ids[0]) void markRead(ids[0]);
}

async function toggleMute(kind: string) {
  if (!onMuteChange || pendingMutes.has(kind)) return;
  const wasMuted = muted(kind);
  pendingMutes = new Set(pendingMutes).add(kind);
  localMutes = wasMuted ? localMutes.filter((item) => item !== kind) : [...localMutes, kind];
  const result = await runService(() => onMuteChange(kind, !wasMuted));
  if (!result.ok || result.value === false)
    localMutes = wasMuted
      ? [...new Set([...localMutes, kind])]
      : localMutes.filter((item) => item !== kind);
  const next = new Set(pendingMutes);
  next.delete(kind);
  pendingMutes = next;
}

function openItem(row: InboxRow) {
  const path = hrefFor(row.source);
  if (path.startsWith('#/')) location.hash = path.slice(1);
  else navigate(path);
}
</script>

{#snippet defaultTrigger({ props }: { props: Record<string, unknown> })}
  <!-- The unread badge is the button's only visible text, so the name starts with it (WCAG 2.5.3, label in name). -->
  <Button {...props} variant="ghost" size="icon" aria-label={unreadCount ? `${unreadCount} unread, ${label}` : label} class="relative">
    <LucideIcon icon={Bell} class="size-[18px]"  />
    {#if unreadCount}<span aria-live="polite" aria-atomic="true" class="absolute -top-1 -right-1 grid min-h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] text-destructive-foreground">{unreadCount}</span>{/if}
  </Button>
{/snippet}

{#snippet muteAction(row: InboxRow)}
  {@const kind = row.source.kind}
  <Button size="icon" variant="ghost" aria-label={`${muted(kind) ? 'Unmute' : 'Mute'} ${kind}`} aria-pressed={muted(kind)} disabled={!onMuteChange || pendingMutes.has(kind)} loading={pendingMutes.has(kind)} onclick={() => toggleMute(kind)}>{#if muted(kind)}<LucideIcon icon={VolumeX} class="size-[15px]"  />{:else}<LucideIcon icon={Volume2} class="size-[15px]"  />{/if}</Button>
{/snippet}

{#snippet panel()}
  <div class="grid max-h-[min(70vh,36rem)] min-h-48 overflow-y-auto" aria-busy={pendingAll || pendingIds.size > 0}>
    {#if query.loading && !query.current}<p role="status" class="py-6 text-center text-muted-foreground">Loading notifications…</p>
    {:else if query.error}<p role="alert" class="py-6 text-center text-destructive">Could not load notifications.</p>
    {:else}
      <NotificationInbox
        {items}
        {now}
        bind:filter
        {onReadChange}
        allowMarkUnread={false}
        onOpen={openItem}
        actions={muteAction}
        labels={{ title: label }}
      />
    {/if}
  </div>
{/snippet}

{#if mobile}
  <BottomSheet title={label} description={`${unreadCount} unread`} trigger={trigger ?? defaultTrigger} class="max-h-[90dvh]">
    {@render panel()}
  </BottomSheet>
{:else}
  <Popover trigger={trigger ?? defaultTrigger} class="w-96 p-4">
    {@render panel()}
  </Popover>
{/if}
