<script lang="ts">
import { Bell, Volume2, VolumeX } from '@lucide/svelte';
import { navigate, runService } from '@protoyard/renderer-svelte';
import type { TriggerSnippet } from '@protoyard/ui';
import { BottomSheet, Button, Popover } from '@protoyard/ui';
import {
  DEFAULT_INBOX_LABELS,
  type InboxFilter,
  NotificationInbox,
  type NotificationInboxLabels,
} from '@texuli/data/activity/inbox';
import { onMount } from 'svelte';
import { useMessages } from 'texuli/i18n';
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
/** NotificationCenter's own words, next to Texuli's inbox labels. */
export type NotificationCenterOwnLabels = {
  markingAll: string;
  marking: string;
  loading: string;
  loadFailed: string;
  /** The trigger's name when there are unread items (starts with the badge number). */
  unreadTrigger: (count: number, label: string) => string;
  /** The phone sheet's description. */
  unreadDescription: (count: number) => string;
  mute: (kind: string) => string;
  unmute: (kind: string) => string;
};
/** Every label: Texuli's inbox labels (forwarded whole) plus this host's own. */
export type NotificationCenterLabels = NotificationInboxLabels & NotificationCenterOwnLabels;
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
  /** The panel title (wins over `labels.title`). */
  label?: string;
  /**
   * Overrides any label. Defaults come from the prototype's dictionary
   * (`protoyard.views.notification-center.*`), then English.
   */
  labels?: Partial<NotificationCenterLabels>;
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
  label: labelProp,
  labels: labelOverrides = {},
}: Props = $props();

// Labels resolve through Texuli's dictionary (mountPrototype({ i18n })); Texuli's
// inbox takes a labels prop only, so its words are bridged under `.inbox.*` ids.
const messages = useMessages();
const M = 'protoyard.views.notification-center';
const kebab = (key: string) => key.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);
const text = $derived.by((): NotificationCenterLabels => {
  const inbox = { ...DEFAULT_INBOX_LABELS } as Record<string, unknown>;
  for (const [key, value] of Object.entries(DEFAULT_INBOX_LABELS)) {
    if (typeof value === 'string') inbox[key] = messages(`${M}.inbox.${kebab(key)}`, value);
  }
  const resolved: NotificationCenterLabels = {
    ...(inbox as unknown as NotificationInboxLabels),
    title: messages(`${M}.label`, 'Notifications'),
    unreadCount: (count) =>
      messages(`${M}.inbox.unread-count`, ', {count} unread', { count: String(count) }),
    markReadItem: (title) =>
      messages(`${M}.inbox.mark-read-item`, 'Mark as read: {title}', { title }),
    markUnreadItem: (title) =>
      messages(`${M}.inbox.mark-unread-item`, 'Mark as unread: {title}', { title }),
    arrived: (count) =>
      count === 1
        ? messages(`${M}.inbox.arrived-one`, '1 new notification.')
        : messages(`${M}.inbox.arrived`, '{count} new notifications.', { count: String(count) }),
    markingAll: messages(`${M}.marking-all`, 'Marking all as read…'),
    marking: messages(`${M}.marking`, 'Marking as read…'),
    loading: messages(`${M}.loading`, 'Loading notifications…'),
    loadFailed: messages(`${M}.load-failed`, 'Could not load notifications.'),
    unreadTrigger: (count, name) =>
      messages(`${M}.unread-trigger`, '{count} unread, {label}', {
        count: String(count),
        label: name,
      }),
    unreadDescription: (count) =>
      messages(`${M}.unread-description`, '{count} unread', { count: String(count) }),
    mute: (kind) => messages(`${M}.mute`, 'Mute {kind}', { kind }),
    unmute: (kind) => messages(`${M}.unmute`, 'Unmute {kind}', { kind }),
  };
  return {
    ...resolved,
    ...labelOverrides,
    ...(labelProp !== undefined ? { title: labelProp } : {}),
  };
});
const label = $derived(text.title);

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

// Texuli's inbox (G106) routes "Mark all as read" to `onMarkAllRead` and a row
// toggle or open to `onReadChange`; each returns the save's promise, so the
// control that started it shows as pending (aria-disabled) until it settles.
function onReadChange(ids: string[], read: boolean): Promise<void> | undefined {
  if (!read || !ids[0]) return undefined;
  return markRead(ids[0]);
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
  <Button {...props} variant="ghost" size="icon" aria-label={unreadCount ? text.unreadTrigger(unreadCount, label) : label} class="relative">
    <LucideIcon icon={Bell} class="size-[18px]"  />
    {#if unreadCount}<span aria-live="polite" aria-atomic="true" class="absolute -top-1 -right-1 grid min-h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] text-destructive-foreground">{unreadCount}</span>{/if}
  </Button>
{/snippet}

{#snippet muteAction(row: InboxRow)}
  {@const kind = row.source.kind}
  <Button size="icon" variant="ghost" aria-label={muted(kind) ? text.unmute(kind) : text.mute(kind)} aria-pressed={muted(kind)} disabled={!onMuteChange || pendingMutes.has(kind)} loading={pendingMutes.has(kind)} onclick={() => toggleMute(kind)}>{#if muted(kind)}<LucideIcon icon={VolumeX} class="size-[15px]"  />{:else}<LucideIcon icon={Volume2} class="size-[15px]"  />{/if}</Button>
{/snippet}

{#snippet panel()}
  <div class="grid max-h-[min(70vh,36rem)] min-h-48 overflow-y-auto" aria-busy={pendingAll || pendingIds.size > 0}>
    {#if pendingAll || pendingIds.size > 0}<p role="status" class="text-xs text-muted-foreground" data-notifications-pending>{pendingAll ? text.markingAll : text.marking}</p>{/if}
    {#if query.loading && !query.current}<p role="status" class="py-6 text-center text-muted-foreground">{text.loading}</p>
    {:else if query.error}<p role="alert" class="py-6 text-center text-destructive">{text.loadFailed}</p>
    {:else}
      <NotificationInbox
        {items}
        {now}
        bind:filter
        {onReadChange}
        onMarkAllRead={markAllRead}
        allowMarkUnread={false}
        onOpen={openItem}
        actions={muteAction}
        labels={text}
      />
    {/if}
  </div>
{/snippet}

{#if mobile}
  <BottomSheet title={label} description={text.unreadDescription(unreadCount)} trigger={trigger ?? defaultTrigger} class="max-h-[90dvh]">
    {@render panel()}
  </BottomSheet>
{:else}
  <Popover trigger={trigger ?? defaultTrigger} class="w-96 p-4">
    {@render panel()}
  </Popover>
{/if}
