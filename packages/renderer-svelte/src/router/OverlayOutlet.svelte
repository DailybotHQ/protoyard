<script lang="ts">
import { AdaptiveOverlay, buttonVariants, Spinner } from '@protoyard/ui';
import { chromeMessages } from '../messages.ts';
import type { RouteMatch, Router } from './hash-router.svelte.ts';
import { routeOverlay } from './hash-router.svelte.ts';

/**
 * Renders an overlay route (`overlay: true`) over the screen underneath: a
 * bottom sheet on narrow hosts, a dialog or side panel on wide ones, through
 * the shared AdaptiveOverlay (focus trap, Escape, labelling). Closing it, by
 * Escape, the close button, the backdrop or the screen's own `close` prop,
 * goes through `router.closeOverlay()`, so history stays in step. `<Router>`
 * loads this file only when an overlay route opens.
 */
let {
  router,
  match,
  rest = {},
}: { router: Router; match: RouteMatch; rest?: Record<string, unknown> } = $props();

let attempt = $state(0);
const options = $derived(routeOverlay(match.route) ?? {});
const title = $derived(match.route?.title ?? match.route?.name ?? 'Details');
const page = $derived.by(() => {
  void attempt;
  return match.route ? router.resolve(match.route) : null;
});
const close = () => router.closeOverlay();

// Focus goes back where it was when the overlay opened (the link or button
// that opened it), or to the screen underneath when that element is gone.
// Read at init, before the overlay's own focus trap moves focus into it.
const active = document.activeElement;
const opener = active instanceof HTMLElement && active !== document.body ? active : null;
$effect(() => {
  return () => {
    const target = opener?.isConnected
      ? opener
      : document.querySelector<HTMLElement>('[data-py-router-outlet]');
    queueMicrotask(() => target?.focus({ preventScroll: true }));
  };
});

const messages = chromeMessages().router;

function retry() {
  if (match.route) router.invalidate(match.route);
  attempt += 1;
}
</script>

<AdaptiveOverlay
  open={true}
  {title}
  kind={options.desktop ?? 'dialog'}
  size={options.size ?? 'md'}
  onOpenChange={(next) => {
    if (!next) close();
  }}
>
  <div data-py-overlay-route={match.route?.path ?? ''}>
    {#if page instanceof Promise}
      {#await page}
        <p class="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground" role="status"><Spinner class="size-4" />{messages.loadingScreen}…</p>
      {:then Page}
        <Page params={match.params} query={match.query} path={match.path} {close} {...rest} />
      {:catch error}
        <div class="grid justify-items-start gap-2 py-4" role="alert">
          <p class="font-medium">{messages.loadFailedTitle}</p>
          <p class="text-sm text-muted-foreground">{error instanceof Error ? error.message : String(error)}</p>
          <button type="button" class={buttonVariants({ variant: 'outline', size: 'sm' })} onclick={retry}>{messages.retry}</button>
        </div>
      {/await}
    {:else if page}
      {@const Page = page}
      <Page params={match.params} query={match.query} path={match.path} {close} {...rest} />
    {/if}
  </div>
</AdaptiveOverlay>
