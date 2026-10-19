<script lang="ts">
import { Bell, CheckCheck, Volume2, VolumeX } from '@lucide/svelte';
import { navigate, runService } from '@protoyard/renderer-svelte';
import type { TriggerSnippet } from '@protoyard/ui';
import { BottomSheet, Button, Popover } from '@protoyard/ui';
import { onMount } from 'svelte';

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

let mobile = $state(false);
let unreadOnly = $state(true);
let pendingAll = $state(false);
let pendingIds = $state(new Set<string>());
let pendingMutes = $state(new Set<string>());
let readOverrides = $state<Record<string, string | null>>({});
let localMutes = $state<string[]>([]);
const rows = $derived(query.current ?? []);
const unreadCount = $derived(
  rows.filter((row) => (readOverrides[row.id] ?? row.readAt) == null).length
);
const muted = (kind: string) => localMutes.includes(kind) || mutedKinds.includes(kind);
const hrefDate = (row: NotificationItem) => row.at ?? row.createdAt ?? '';
const isRead = (row: NotificationItem) => (readOverrides[row.id] ?? row.readAt) != null;
const shown = $derived(rows.filter((row) => !unreadOnly || !isRead(row)));
const today = $derived(new Date(now).toISOString().slice(0, 10));
const groups = $derived.by(() => {
  const byDay = new Map<string, NotificationItem[]>();
  for (const row of shown) {
    const day = hrefDate(row).slice(0, 10) || 'unknown';
    byDay.set(day, [...(byDay.get(day) ?? []), row]);
  }
  return [...byDay]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([day, items]) => ({
      day,
      label:
        day === today
          ? 'Today'
          : day === new Date(new Date(today).getTime() - 86400000).toISOString().slice(0, 10)
            ? 'Yesterday'
            : day === 'unknown'
              ? 'Earlier'
              : new Date(`${day}T12:00:00`).toLocaleDateString(undefined, {
                  weekday: 'long',
                  month: 'short',
                  day: 'numeric',
                }),
      items,
    }));
});

onMount(() => {
  const media = window.matchMedia('(max-width: 639px)');
  const update = () => (mobile = media.matches);
  update();
  media.addEventListener('change', update);
  return () => media.removeEventListener('change', update);
});

async function markRead(row: NotificationItem) {
  if (isRead(row) || pendingIds.has(row.id)) return;
  const previous = readOverrides[row.id];
  pendingIds = new Set(pendingIds).add(row.id);
  readOverrides = { ...readOverrides, [row.id]: new Date(now).toISOString() };
  const result = await runService(() => onMarkRead(row.id));
  if (!result.ok || result.value === false) {
    const next = { ...readOverrides };
    if (previous === undefined) delete next[row.id];
    else next[row.id] = previous;
    readOverrides = next;
  }
  const nextPending = new Set(pendingIds);
  nextPending.delete(row.id);
  pendingIds = nextPending;
}

async function markAllRead() {
  if (pendingAll || unreadCount === 0) return;
  const previous = { ...readOverrides };
  pendingAll = true;
  readOverrides = {
    ...readOverrides,
    ...Object.fromEntries(
      rows.filter((row) => !isRead(row)).map((row) => [row.id, new Date(now).toISOString()])
    ),
  };
  const result = await runService(onMarkAllRead);
  if (!result.ok || result.value === false) readOverrides = previous;
  pendingAll = false;
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

function openItem(item: NotificationItem) {
  if (!isRead(item)) void markRead(item);
  const path = hrefFor(item);
  if (path.startsWith('#/')) location.hash = path.slice(1);
  else navigate(path);
}
</script>

{#snippet defaultTrigger({ props }: { props: Record<string, unknown> })}
  <Button {...props} variant="ghost" size="icon" aria-label={label} class="relative">
    <Bell size={18} />
    {#if unreadCount}<span aria-live="polite" aria-atomic="true" class="absolute -top-1 -right-1 grid min-h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] text-destructive-foreground">{unreadCount}</span>{/if}
  </Button>
{/snippet}

{#snippet panel()}
  <section aria-label={label} class="grid max-h-[min(70vh,36rem)] min-h-48 gap-3 overflow-y-auto">
    <header class="flex items-center justify-between gap-2">
      <h2 class="font-semibold">{label}</h2>
      <Button size="sm" variant="ghost" disabled={pendingAll || unreadCount === 0} loading={pendingAll} onclick={markAllRead}><CheckCheck size={15} /> Mark all read</Button>
    </header>
    <div role="tablist" aria-label="Notification filter" class="flex gap-1 border-b border-border">
      <Button role="tab" aria-selected={unreadOnly} variant={unreadOnly ? 'secondary' : 'ghost'} size="sm" onclick={() => (unreadOnly = true)}>Unread <span aria-live="polite" class="ml-1 tabular-nums">{unreadCount}</span></Button>
      <Button role="tab" aria-selected={!unreadOnly} variant={!unreadOnly ? 'secondary' : 'ghost'} size="sm" onclick={() => (unreadOnly = false)}>All</Button>
    </div>
    {#if query.loading && !query.current}<p role="status" class="py-6 text-center text-muted-foreground">Loading notifications…</p>
    {:else if query.error}<p role="alert" class="py-6 text-center text-destructive">Could not load notifications.</p>
    {:else if shown.length === 0}<p class="py-8 text-center text-sm text-muted-foreground">{unreadOnly ? 'You’re all caught up.' : 'No notifications yet.'}</p>
    {:else}
      {#each groups as group (group.day)}
        <div class="grid gap-1"><h3 class="px-1 text-xs font-semibold text-muted-foreground">{group.label}</h3>
          {#each group.items as item (item.id)}
            <article class="flex items-start gap-2 rounded-md p-2" class:bg-muted={!isRead(item)}>
              <button type="button" class="min-w-0 flex-1 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none" aria-label={`Open ${item.title}`} onclick={() => openItem(item)}>
                <span class="block font-medium">{item.title}</span>
                {#if item.body}<span class="mt-0.5 block text-xs text-muted-foreground">{item.body}</span>{/if}
                <time class="mt-1 block text-xs text-muted-foreground" datetime={hrefDate(item)}>{new Date(hrefDate(item)).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</time>
              </button>
              {#if !isRead(item)}<Button size="icon" variant="ghost" aria-label={`Mark ${item.title} read`} disabled={pendingIds.has(item.id)} loading={pendingIds.has(item.id)} onclick={() => markRead(item)}><CheckCheck size={15} /></Button>{/if}
              <Button size="icon" variant="ghost" aria-label={`${muted(item.kind) ? 'Unmute' : 'Mute'} ${item.kind}`} aria-pressed={muted(item.kind)} disabled={!onMuteChange || pendingMutes.has(item.kind)} loading={pendingMutes.has(item.kind)} onclick={() => toggleMute(item.kind)}>{#if muted(item.kind)}<VolumeX size={15} />{:else}<Volume2 size={15} />{/if}</Button>
            </article>
          {/each}
        </div>
      {/each}
    {/if}
  </section>
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
