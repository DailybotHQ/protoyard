<script lang="ts" generics="T extends import('@protoyard/views/activity').ActivityItem">
/**
 * Host adapter over `@texuli/data/activity` `ActivityFeed`.
 */
import type { ActivityFilter, ActivityItem } from '@protoyard/views/activity';
import { ActivityFeed as TexuliFeed } from '@texuli/data/activity';
import QueryState from '../states/QueryState.svelte';
import type { ActivityPerson } from './types.ts';

let {
  query,
  now = new Date(),
  people = [],
  records: _records = [],
  timeZone = 'UTC',
  locale = 'en-US',
  filter,
  onFilterChange,
  onRetry,
  label = 'Activity',
  class: className,
  getActorName,
  getActorSrc,
  personaId,
  onReactionToggle,
  ..._rest
}: {
  query: {
    readonly current: T[] | undefined;
    readonly loading: boolean;
    readonly error: unknown;
  };
  now?: string | number | Date;
  people?: readonly ActivityPerson[];
  records?: readonly unknown[];
  timeZone?: string;
  locale?: string;
  filter?: ActivityFilter;
  onFilterChange?: (filter: ActivityFilter) => void;
  onRetry?: () => unknown;
  label?: string;
  class?: string;
  getActorName?: (item: T) => string;
  getActorSrc?: (item: T) => string | undefined | null;
  personaId?: string;
  onReactionToggle?: (
    item: T,
    emoji: string,
    next: Record<string, string[]>
  ) => void | Promise<void>;
} = $props();

const byId = $derived(new Map(people.map((p) => [p.id, p])));
const actorName = getActorName ?? ((item: T) => byId.get(item.actorId)?.name ?? item.actorId);
const actorSrc =
  getActorSrc ??
  ((item: T) => {
    const person = byId.get(item.actorId);
    return person?.avatar ?? null;
  });
</script>

<QueryState {query} label={`Loading ${label.toLowerCase()}`} onRetry={onRetry ? () => { void onRetry(); } : undefined} isEmpty={() => false}>
  {#snippet children(items)}
    <TexuliFeed
      {items}
      {now}
      {timeZone}
      {locale}
      getActorName={actorName}
      getActorSrc={actorSrc}
      {personaId}
      {filter}
      {onFilterChange}
      {onReactionToggle}
      class={className}
    />
  {/snippet}
</QueryState>
