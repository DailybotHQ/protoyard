<script lang="ts">
import { WindowChrome, type WindowChromeState } from '@protoyard/ui';
import { type FrameProps, windowVariant } from './registry.ts';

/**
 * Desktop-app shell: the app in a generic window (mac-like or windows-like
 * title bar from `@protoyard/ui` WindowChrome) on a neutral wallpaper with a
 * dock or taskbar. ShellHost reserves the title bar (screenInset.top = 40)
 * and keeps the app mounted while the window is minimized or closed. Every
 * control works: minimize hides the window to the dock, the dock button
 * restores or reopens it, maximize fills the stage, and close shows a
 * reopen prompt.
 */
let {
  chrome,
  app = { name: 'App' },
  maximized = false,
  setMaximized = () => {},
  setScreenHidden = () => {},
}: FrameProps = $props();

const variant = $derived(windowVariant(chrome?.os));
let windowState = $state<WindowChromeState>('open');
let title = $state(typeof document === 'undefined' ? '' : document.title);

/** Theme-token gradients (no images), so the wallpaper follows the theme and mode. */
const wallpaper =
  'radial-gradient(60% 50% at 30% 30%, color-mix(in oklab, var(--color-primary) 25%, transparent), transparent), linear-gradient(160deg, var(--color-muted), var(--color-background))';

// The router sets document.title on every navigation; the title bar follows it.
$effect(() => {
  const sync = () => {
    title = document.title;
  };
  sync();
  const observer = new MutationObserver(sync);
  observer.observe(document.head, { subtree: true, childList: true, characterData: true });
  return () => observer.disconnect();
});

$effect(() => {
  setScreenHidden(windowState !== 'open');
});
$effect(() => () => setScreenHidden(false));

const appLabel = $derived(app.name);
const dockLabel = $derived(
  `${windowState === 'open' ? 'Minimize' : windowState === 'minimized' ? 'Restore' : 'Open'} ${appLabel}`
);

function toggleFromDock(): void {
  windowState = windowState === 'open' ? 'minimized' : 'open';
}
</script>

<!-- Wallpaper behind the screen (the device box isolates it, the stage clips it). -->
<div
  aria-hidden="true"
  data-py-wallpaper
  class="pointer-events-none absolute -z-10 bg-(image:--py-wallpaper)"
  style:inset="-200vmax"
  style:--py-wallpaper={wallpaper}
></div>

{#if windowState !== 'minimized'}
  <WindowChrome
    bind:state={windowState}
    bind:maximized={() => maximized, (value: boolean) => setMaximized(value)}
    {title}
    {appLabel}
    {variant}
    class={windowState === 'open'
      ? 'pointer-events-none absolute inset-0 bg-transparent [&_[data-window-titlebar]]:pointer-events-auto'
      : 'pointer-events-auto absolute inset-0 m-auto h-fit max-w-sm bg-surface/95 shadow-float'}
    contentClass="pointer-events-none"
  />
{/if}

{#if !maximized}
  <div
    data-py-dock={variant === 'mac-like' ? 'dock' : 'taskbar'}
    class={[
      'absolute top-[calc(100%+14px)] flex h-12 items-center gap-2 border border-border/60 bg-surface/70 px-2 shadow-float backdrop-blur-md',
      variant === 'mac-like' ? 'left-1/2 -translate-x-1/2 rounded-2xl' : 'inset-x-0 rounded-lg',
    ]}
  >
    <button
      type="button"
      class="relative grid size-9 place-items-center rounded-xl bg-background text-lg shadow-soft focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      aria-label={dockLabel}
      onclick={toggleFromDock}
      data-py-dock-app
    >
      <span aria-hidden="true">{app.icon ?? appLabel.slice(0, 1).toUpperCase()}</span>
      {#if windowState !== 'closed'}
        <span aria-hidden="true" class="absolute -bottom-1 size-1 rounded-full bg-foreground/70"></span>
      {/if}
    </button>
  </div>
{/if}
