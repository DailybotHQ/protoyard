<script lang="ts" generics="T">
/**
 * Shared loading / empty / error shell for views-ui adapters.
 * Uses texuli EmptyState/ErrorState (cx, no tailwind-merge) so every view that
 * mounts QueryState does not pull `@protoyard/ui`'s cn into the first screen.
 */
import { Lock } from '@lucide/svelte';
import type { Component, Snippet } from 'svelte';
import { EmptyState, ErrorState } from 'texuli/empty';
import { classifyQueryError } from './classify.ts';

type IconComponent = Component<{ class?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>;

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
  onRetry?: () => unknown;
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
  emptyIcon: EmptyIcon,
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

<div
  class={className}
  aria-busy={query.loading || undefined}
  data-query-state={failure ? failure.kind : waiting ? 'loading' : 'ready'}
>
  {#if failure}
    {#if failure.kind === 'denied'}
      <EmptyState role="alert" aria-label={failure.title} title={failure.title} description={failure.message}>
        {#snippet illustration()}
          <Lock class="size-6" aria-hidden="true" />
        {/snippet}
      </EmptyState>
    {:else}
      <ErrorState
        aria-label={failure.title}
        title={failure.title}
        message={failure.message}
        onRetry={onRetry ? () => { void onRetry(); } : undefined}
      />
    {/if}
  {:else if waiting}
    {#if showSkeleton}
      {#if loading}
        <div role="status" aria-label={label}>{@render loading()}</div>
      {:else}
        <div role="status" aria-live="polite" aria-label={label} class="grid w-full gap-2" data-loading-skeleton>
          {#each Array.from({ length: rows }, (_, i) => i) as index (index)}
            <div
              class="h-4 animate-pulse rounded bg-muted {index === rows - 1 ? 'w-2/3' : 'w-full'}"
              aria-hidden="true"
            ></div>
          {/each}
        </div>
      {/if}
    {/if}
  {:else if query.current === undefined || isEmpty(query.current)}
    <EmptyState
      role="status"
      aria-label={emptyTitle}
      title={emptyTitle}
      description={emptyDescription}
      action={emptyAction}
    >
      {#snippet illustration()}
        {#if EmptyIcon}
          <EmptyIcon class="size-6" aria-hidden="true" />
        {/if}
      {/snippet}
    </EmptyState>
  {:else}
    {@render children(query.current)}
  {/if}
</div>
