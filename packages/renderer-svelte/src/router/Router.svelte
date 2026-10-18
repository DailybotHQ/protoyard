<script lang="ts">
import { ErrorState, LoadingState } from '@protoyard/ui';
import NotFound from './NotFound.svelte';
import type { Router } from './router.svelte.ts';

/** Renders the component matching the current hash; extra props are forwarded. */
let { router, ...rest }: { router: Router; [key: string]: unknown } = $props();

const match = $derived(router.current);

/**
 * Bumped on retry so `{#await}` re-subscribes after `invalidate` clears a
 * failed lazy cache entry. Reset when the matched route path changes.
 */
let loadAttempt = $state(0);
let focusedPath = $state<string | null>(null);

const page = $derived.by(() => {
  void loadAttempt;
  if (!match.route) return router.notFound ?? NotFound;
  return router.resolve(match.route);
});

const routeKey = $derived(match.route?.path ?? '__not-found__');

$effect(() => {
  // Reset the retry counter when navigation changes the matched route.
  void routeKey;
  loadAttempt = 0;
  focusedPath = null;
});

function retryLoad(): void {
  if (match.route) router.invalidate(match.route);
  loadAttempt += 1;
}

/** Move keyboard focus into the outlet after a screen (or not-found) mounts. */
function focusOutlet(node: HTMLElement): void {
  const path = routeKey;
  if (focusedPath === path) return;
  focusedPath = path;
  queueMicrotask(() => {
    if (document.activeElement === node) return;
    node.focus({ preventScroll: true });
  });
}
</script>

{#key `${routeKey}:${loadAttempt}`}
  {#if page instanceof Promise}
    {#await page}
      <LoadingState label="Loading screen" class="py-16" />
    {:then Page}
      <div
        class="outline-none"
        tabindex="-1"
        data-py-router-outlet=""
        {@attach focusOutlet}
      >
        <Page params={match.params} query={match.query} path={match.path} {...rest} />
      </div>
    {:catch error}
      <ErrorState
        title="This screen could not be loaded"
        message={error instanceof Error ? error.message : String(error)}
        onRetry={retryLoad}
        retryLabel="Try again"
      />
    {/await}
  {:else}
    {@const Page = page}
    <div
      class="outline-none"
      tabindex="-1"
      data-py-router-outlet=""
      {@attach focusOutlet}
    >
      <Page params={match.params} query={match.query} path={match.path} {...rest} />
    </div>
  {/if}
{/key}
