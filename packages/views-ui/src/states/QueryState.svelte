<script lang="ts" generics="T">
import { Lock } from '@lucide/svelte';
import { EmptyState, ErrorState, type IconComponent, LoadingState } from '@protoyard/ui';
import type { Snippet } from 'svelte';
import { classifyQueryError } from './classify.ts';

interface Props {
  /** A renderer `liveQuery` result (or anything with `current`, `loading` and `error`). */
  query: { readonly current: T | undefined; readonly loading: boolean; readonly error: unknown };
  /** What is loading, for screen readers: "Loading deals…". */
  label: string;
  /** Renders the data. */
  children: Snippet<[T]>;
  /** Whether the data counts as empty (default: undefined, null or an empty array). */
  isEmpty?: (value: T) => boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyIcon?: IconComponent;
  /** The empty state's primary action, e.g. a "New deal" button wired to a service. */
  emptyAction?: Snippet;
  /** Retries the query (re-run it, e.g. by bumping a key in its `deps`). Shown for retryable errors. */
  onRetry?: () => void | Promise<void>;
  /** Wait before showing the skeleton, so fast loads never flash (default 150 ms, like the pending bar). */
  delayMs?: number;
  /** Skeleton lines (default 3), or replace the skeleton with `loading`. */
  rows?: number;
  loading?: Snippet;
  class?: string;
}

let {
  query,
  label,
  children,
  isEmpty = (value: T) =>
    value === undefined || value === null || (Array.isArray(value) && value.length === 0),
  emptyTitle = 'Nothing here yet',
  emptyDescription,
  emptyIcon,
  emptyAction,
  onRetry,
  delayMs = 150,
  rows = 3,
  loading,
  class: className,
}: Props = $props();

// The first result has not arrived: a reload later keeps showing the data it has.
let settled = $state(false);
let showSkeleton = $state(false);

$effect(() => {
  if (!query.loading) settled = true;
});

const waiting = $derived(query.loading && !settled && query.error === undefined);

$effect(() => {
  if (!waiting) {
    showSkeleton = false;
    return;
  }
  const timer = setTimeout(() => (showSkeleton = true), delayMs);
  return () => clearTimeout(timer);
});

const failure = $derived(
  query.error === undefined || query.error === null ? null : classifyQueryError(query.error)
);
</script>

<div class={className} aria-busy={query.loading || undefined} data-query-state={failure ? failure.kind : waiting ? 'loading' : 'ready'}>
  {#if failure}
    {#if failure.kind === 'denied'}
      <EmptyState role="alert" aria-label={failure.title} icon={Lock} title={failure.title} description={failure.message} />
    {:else}
      <!-- Offline and other failures can be retried. -->
      <ErrorState aria-label={failure.title} title={failure.title} message={failure.message} {onRetry} />
    {/if}
  {:else if waiting}
    {#if showSkeleton}
      {#if loading}
        <div role="status" aria-label={label}>{@render loading()}</div>
      {:else}
        <LoadingState variant="skeleton" {rows} label={label} aria-label={label} />
      {/if}
    {/if}
  {:else if query.current === undefined || isEmpty(query.current)}
    <EmptyState role="status" aria-label={emptyTitle} icon={emptyIcon} title={emptyTitle} description={emptyDescription} action={emptyAction} />
  {:else}
    {@render children(query.current)}
  {/if}
</div>
