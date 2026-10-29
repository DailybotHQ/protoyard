<script lang="ts">
import { ErrorState, LoadingState } from '@protoyard/ui';
import { chromeMessages } from '../messages.ts';
// Aliased: the emitted Router.svelte.d.ts declares the component as `Router`.
import type { Router as HashRouter } from './hash-router.svelte.ts';
import NotFound from './NotFound.svelte';

const messages = chromeMessages().router;

/**
 * Renders the component matching the current hash; extra props are forwarded.
 * An overlay route (`overlay: true`) renders over the last full-screen route,
 * which stays mounted underneath (its state and scroll survive), and the
 * overlay outlet loads only when one opens.
 */
let { router, ...rest }: { router: HashRouter; [key: string]: unknown } = $props();

const match = $derived(router.background);
const overlay = $derived(router.overlay);
const overlayKey = $derived(
  overlay ? `${overlay.route?.path ?? ''}:${overlay.path}?${overlay.query.toString()}` : null
);

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

/**
 * The focus outlet wraps every screen, so it must not break the app's height
 * chain: a screen whose root is `h-full` / `flex-1` (a chat thread with its
 * composer pinned under a scrolling list) needs a definite height from here.
 * The outlet stays a block (screens keep normal flow and `mx-auto` widths) but
 * fills a definite parent, flexes inside a flex parent, and may shrink so the
 * screen's own scroll region scrolls instead of growing past the viewport.
 * In a parent with auto height `h-full` resolves to auto, as before.
 */
const OUTLET_CLASS = 'block h-full min-h-0 min-w-0 flex-auto outline-none';

/** Move keyboard focus into the outlet after a screen (or not-found) mounts. */
function focusOutlet(node: HTMLElement): void {
  const path = routeKey;
  if (focusedPath === path) return;
  focusedPath = path;
  requestAnimationFrame(() => {
    if (focusedPath !== path || !node.isConnected) return;
    if (document.activeElement === node) return;
    node.focus({ preventScroll: true });
  });
}
</script>

{#key `${routeKey}:${loadAttempt}`}
  {#if page instanceof Promise}
    {#await page}
      <LoadingState label={messages.loadingScreen} class="py-16" />
    {:then Page}
      <div
        class={OUTLET_CLASS}
        tabindex="-1"
        data-py-router-outlet=""
        {@attach focusOutlet}
      >
        <Page params={match.params} query={match.query} path={match.path} {...rest} />
      </div>
    {:catch error}
      <ErrorState
        title={messages.loadFailedTitle}
        message={error instanceof Error ? error.message : String(error)}
        onRetry={retryLoad}
        retryLabel={messages.retry}
      />
    {/await}
  {:else}
    {@const Page = page}
    <div
      class={OUTLET_CLASS}
      tabindex="-1"
      data-py-router-outlet=""
      {@attach focusOutlet}
    >
      <Page
        params={match.params}
        query={match.query}
        path={match.path}
        {...rest}
        {...(match.error ? { error: match.error } : {})}
      />
    </div>
  {/if}
{/key}

{#if overlay && overlayKey}
  {#key overlayKey}
    {#await import('./OverlayOutlet.svelte') then { default: OverlayOutlet }}
      <OverlayOutlet {router} match={overlay} {rest} />
    {:catch error}
      <ErrorState
        title={messages.openFailedTitle}
        message={error instanceof Error ? error.message : String(error)}
        onRetry={() => router.closeOverlay()}
        retryLabel={messages.close}
      />
    {/await}
  {/key}
{/if}
