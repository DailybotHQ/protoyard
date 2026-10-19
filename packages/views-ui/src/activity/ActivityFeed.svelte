<script lang="ts">
import { runService } from '@protoyard/renderer-svelte';
import { Avatar, Button } from '@protoyard/ui';
import {
  type ActivityItem,
  type ActivityKind,
  filterActivity,
  groupByDay,
  plainText,
  sortActivity,
  tokenize,
} from '@protoyard/views/activity';
import QueryState from '../states/QueryState.svelte';
import { type ActivityPerson, type ActivityRecord, personImage } from './types.ts';

/**
 * A history feed: newest first, grouped by day relative to the runtime clock,
 * filtered by kind and person, a page at a time. Items are plain text, so
 * they are safe for any stored data. Build items with `auditToActivity` from
 * blueprint audit rows, or from comments.
 */
let {
  query,
  people,
  records = [],
  now,
  timeZone = 'UTC',
  locale = 'en-US',
  pageSize = 20,
  hasMore = false,
  onLoadMore,
  onOpenRecord,
  avatarSrc,
  showFilters = true,
  label = 'Activity',
  onRetry,
}: {
  query: {
    readonly current: ActivityItem[] | undefined;
    readonly loading: boolean;
    readonly error: unknown;
  };
  people: readonly ActivityPerson[];
  /** Names for `#` references inside comment items. */
  records?: readonly ActivityRecord[];
  /** The runtime clock's now ("Today" is relative to it). */
  now: string | number | Date;
  timeZone?: string;
  locale?: string;
  /** Items shown per page (default 20). */
  pageSize?: number;
  /** More items exist beyond `query.current`; with `onLoadMore`, the last page asks for them. */
  hasMore?: boolean;
  onLoadMore?: () => unknown;
  onOpenRecord?: (item: ActivityItem) => void;
  /** Overrides how a person's image resolves (default: `persona.avatar` through the renderer's `avatarImage`). */
  avatarSrc?: (person: ActivityPerson) => string | null | undefined;
  showFilters?: boolean;
  label?: string;
  onRetry?: () => void | Promise<void>;
} = $props();

const uid = $props.id();
const KIND_FILTERS: Record<string, { label: string; kinds: ActivityKind[] }> = {
  all: { label: 'All activity', kinds: [] },
  comments: { label: 'Comments', kinds: ['comment'] },
  changes: {
    label: 'Changes',
    kinds: ['create', 'update', 'delete', 'restore', 'purge', 'import'],
  },
};
let kind = $state('all');
let actorId = $state('');
// svelte-ignore state_referenced_locally
let limit = $state(pageSize);

const byId = $derived(new Map(people.map((p) => [p.id, p])));
const recordById = $derived(new Map(records.map((r) => [r.id, r])));
const all = $derived(sortActivity(query.current ?? []));
const actors = $derived(
  [...new Set(all.map((item) => item.actorId))].map((id) => ({
    id,
    name: byId.get(id)?.name ?? 'Someone',
  }))
);
const filtered = $derived(
  filterActivity(all, { kinds: KIND_FILTERS[kind]?.kinds ?? [], actorId: actorId || null })
);
const days = $derived(
  groupByDay(filtered.slice(0, limit), { at: (item) => item.at, now, timeZone, locale })
);
const timeFormat = $derived(
  new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone })
);

function text(item: ActivityItem): string {
  if (item.kind === 'comment' && item.body !== undefined) {
    const said = plainText(
      tokenize(item.body, {
        person: (id) => byId.get(id)?.name,
        record: (id) => recordById.get(id)?.label,
      })
    );
    return `commented: “${said.length > 140 ? `${said.slice(0, 139)}…` : said}”`;
  }
  return item.lines.join('; ');
}
</script>

<section aria-label={label} class="grid gap-3">
  {#if showFilters}
    <div class="flex flex-wrap items-center gap-3 text-sm">
      <span class="flex items-center gap-2 text-muted-foreground">
        <label for={`feed-${uid}-kind`}>Show</label>
        <select
          id={`feed-${uid}-kind`} class="h-9 rounded-md border border-input bg-surface px-2 text-foreground" value={kind}
          onchange={(event) => {
            kind = (event.currentTarget as HTMLSelectElement).value;
            limit = pageSize;
          }}>
          {#each Object.entries(KIND_FILTERS) as [value, option] (value)}<option {value}>{option.label}</option>{/each}
        </select>
      </span>
      <span class="flex items-center gap-2 text-muted-foreground">
        <label for={`feed-${uid}-actor`}>By</label>
        <select
          id={`feed-${uid}-actor`} class="h-9 rounded-md border border-input bg-surface px-2 text-foreground" value={actorId}
          onchange={(event) => {
            actorId = (event.currentTarget as HTMLSelectElement).value;
            limit = pageSize;
          }}>
          <option value="">Everyone</option>
          {#each actors as actor (actor.id)}<option value={actor.id}>{actor.name}</option>{/each}
        </select>
      </span>
    </div>
  {/if}

  <QueryState {query} label={`Loading ${label.toLowerCase()}`} emptyTitle="No activity yet" {onRetry}>
    {#snippet children()}
      {#if filtered.length === 0}
        <p class="text-sm text-muted-foreground" role="status">Nothing matches these filters.</p>
      {/if}
      {#each days as day (day.day)}
        <section aria-labelledby={`feed-${uid}-${day.day}`} class="grid gap-2">
          <h3 id={`feed-${uid}-${day.day}`} class="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{day.label}</h3>
          <ol class="grid gap-2">
            {#each day.items as item (item.id)}
              {@const who = byId.get(item.actorId)}
              <li class="flex gap-3 text-sm">
                <Avatar name={who?.name ?? 'Someone'} {...personImage(who, avatarSrc)} size="sm" decorative />
                <p class="min-w-0 flex-1 break-words">
                  <span class="font-medium">{who?.name ?? 'Someone'}</span>
                  {text(item)}
                  {#if item.recordLabel}
                    {#if onOpenRecord}
                      on <button type="button" class="font-medium text-primary underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none" onclick={() => onOpenRecord(item)}>{item.recordLabel}</button>
                    {:else}
                      on <span class="font-medium">{item.recordLabel}</span>
                    {/if}
                  {/if}
                  <time class="block text-xs text-muted-foreground" datetime={item.at}>{timeFormat.format(Date.parse(item.at))}</time>
                </p>
              </li>
            {/each}
          </ol>
        </section>
      {/each}
      {#if filtered.length > limit}
        <Button variant="outline" size="sm" onclick={() => (limit += pageSize)}>Show more ({filtered.length - limit} more)</Button>
      {:else if hasMore && onLoadMore}
        <Button
          variant="outline"
          size="sm"
          onclick={async () => {
            const result = await runService(() => onLoadMore());
            if (result.ok) limit += pageSize;
          }}
        >Load older activity</Button>
      {/if}
    {/snippet}
  </QueryState>
</section>
