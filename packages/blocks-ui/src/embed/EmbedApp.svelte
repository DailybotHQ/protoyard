<script lang="ts">
import type { EmbedAppBlock } from '@protoyard/blocks';
import { cn } from '@protoyard/ui';
import { onDestroy } from 'svelte';
import { getBlockHost } from '../host.ts';
import { DECK_INTERACTIVE_ATTRIBUTE } from '../lib/deck-interactive.ts';

/**
 * Framed preview for an embed-app block. The host's `mountEmbed` is called
 * only after the user starts the app, so no app code loads with the deck.
 * Unmount releases the runtime. Slide keyboard focus stays outside the frame
 * until the app is running; then the frame traps Tab within itself.
 */
interface Props {
  block: EmbedAppBlock;
}

let { block }: Props = $props();

const host = getBlockHost();
const startLabel = $derived(block.startLabel?.trim() || 'Start the app');
const heightClass = $derived(
  block.height === 'sm' ? 'min-h-40' : block.height === 'lg' ? 'min-h-96' : 'min-h-64'
);

let started = $state(false);
let pending = $state(false);
let error = $state<string | null>(null);
let mountEl = $state<HTMLDivElement | undefined>(undefined);
let cleanup: (() => void) | null = null;
let mountedOnce = $state(false);

async function start() {
  if (pending || started) return;
  const mountEmbed = host.mountEmbed;
  if (!mountEmbed) {
    error = 'This host cannot start embedded apps.';
    return;
  }
  if (!mountEl) {
    error = 'The app frame is not ready.';
    return;
  }
  pending = true;
  error = null;
  try {
    const result = await Promise.resolve(mountEmbed(mountEl, block.app));
    if (typeof result === 'function') cleanup = result;
    started = true;
    mountedOnce = true;
  } catch (cause) {
    const message =
      cause instanceof Error && cause.message.trim()
        ? cause.message.trim().slice(0, 200)
        : 'The embedded app could not be started.';
    error = message;
    started = false;
  } finally {
    pending = false;
  }
}

function release() {
  const stop = cleanup;
  cleanup = null;
  try {
    stop?.();
  } catch {
    // Host cleanup must not break the surrounding deck.
  }
  if (mountEl) mountEl.replaceChildren();
  started = false;
  pending = false;
}

/** Keep Tab inside the running frame so deck arrow keys are not stolen mid-type. */
function onFrameKeydown(event: KeyboardEvent) {
  if (!started || event.key !== 'Tab' || !mountEl) return;
  const focusable = [
    ...mountEl.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    ),
  ].filter((el) => !el.hasAttribute('disabled') && el.tabIndex >= 0);
  if (focusable.length === 0) {
    event.preventDefault();
    mountEl.focus();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (!first || !last) return;
  const active = document.activeElement;
  if (event.shiftKey && (active === first || active === mountEl)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}

onDestroy(() => {
  release();
});
</script>

<section
  class={cn(
    'overflow-hidden rounded-lg border border-border bg-surface shadow-soft',
    heightClass
  )}
  data-py-block="embed-app"
  data-py-embed-app={block.id}
  data-py-embed-started={started ? 'true' : 'false'}
  {...{ [DECK_INTERACTIVE_ATTRIBUTE]: '' }}
  aria-label={block.title}
>
  <header
    class="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/40 px-3 py-2"
  >
    <h3 class="text-sm font-semibold text-foreground">{block.title}</h3>
    {#if started}
      <button
        type="button"
        class="inline-flex h-8 items-center rounded-md border border-border px-2.5 text-xs font-medium text-muted-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        onclick={release}
      >
        Close app
      </button>
    {/if}
  </header>

  <div class="relative grid min-h-[inherit] place-items-stretch p-3">
    {#if !host.mountEmbed}
      <p
        class="m-auto max-w-sm rounded-md border border-border bg-muted/50 p-4 text-center text-sm text-muted-foreground"
        role="note"
      >
        Embedded apps need a host that provides mountEmbed. This preview cannot start the app.
      </p>
    {:else if !started}
      <div class="m-auto grid max-w-sm gap-3 place-items-center text-center">
        <p class="text-sm text-muted-foreground">
          Level-1 app preview. Nothing loads until you start it.
        </p>
        <button
          type="button"
          class="inline-flex min-h-touch items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50 sm:min-h-0"
          disabled={pending}
          aria-busy={pending || undefined}
          onclick={() => void start()}
        >
          {pending ? 'Starting…' : startLabel}
        </button>
        {#if error}
          <p class="text-sm text-destructive" role="alert">{error}</p>
        {/if}
      </div>
    {:else if error}
      <p class="m-auto text-sm text-destructive" role="alert">{error}</p>
    {/if}

    <!-- Mount target stays in the DOM so the host can attach; hidden until start. -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div
      bind:this={mountEl}
      class={cn(
        'min-h-48 w-full overflow-auto rounded-md border border-dashed border-border bg-background outline-none focus-visible:ring-2 focus-visible:ring-ring',
        !started && 'hidden'
      )}
      data-py-embed-mount
      data-py-embed-mounted={mountedOnce ? 'true' : 'false'}
      tabindex={started ? 0 : -1}
      role="region"
      aria-label={`${block.title} app`}
      onkeydown={onFrameKeydown}
    ></div>
  </div>
</section>
