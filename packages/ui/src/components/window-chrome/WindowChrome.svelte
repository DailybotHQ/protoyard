<script lang="ts">
import Copy from '@lucide/svelte/icons/copy';
import Minus from '@lucide/svelte/icons/minus';
import Square from '@lucide/svelte/icons/square';
import X from '@lucide/svelte/icons/x';
import type { Snippet } from 'svelte';
import type { HTMLAttributes } from 'svelte/elements';
import { Button } from 'texuli/button';
import { Icon } from 'texuli/icons';
import { cn } from '../../lib/cn.ts';
import type { WindowChromeState, WindowChromeVariant } from './types.ts';

type Props = Omit<HTMLAttributes<HTMLDivElement>, 'title' | 'class' | 'children'> & {
  /** Window title shown in the title bar and on the minimized pill. */
  title?: string;
  /** Visual chrome style (`mac-like` traffic lights, `windows-like` caption buttons). */
  variant?: WindowChromeVariant;
  /** open · minimized (dock/taskbar pill) · closed (reopen prompt). */
  state?: WindowChromeState;
  /** Fills the host when true; toggled by maximize or double-clicking the title. */
  maximized?: boolean;
  /** Optional row under the title bar (toolbars, tabs…). */
  toolbar?: Snippet;
  children?: Snippet;
  /** Accessible name for the closed / minimized chrome when title is empty. */
  appLabel?: string;
  class?: string;
  contentClass?: string;
  /** Classes for the minimized dock/taskbar pill host. */
  pillClass?: string;
  /** The rendered root element of the current state (bindable). */
  ref?: HTMLElement | null;
};

let {
  title = 'App',
  variant = 'mac-like',
  state = $bindable('open'),
  maximized = $bindable(false),
  toolbar,
  children,
  appLabel,
  class: className,
  contentClass,
  pillClass,
  ref = $bindable(null),
  ...rest
}: Props = $props();

const label = $derived(title.trim() || appLabel || 'App');

function minimize(): void {
  state = 'minimized';
}

function restore(): void {
  state = 'open';
}

function closeWindow(): void {
  state = 'closed';
}

function reopen(): void {
  state = 'open';
}

function toggleMaximize(): void {
  maximized = !maximized;
}

function onTitleDblClick(event: MouseEvent): void {
  // Ignore double-clicks that started on a control inside the title bar.
  if (event.target instanceof Element && event.target.closest('button')) return;
  toggleMaximize();
}

const controlClass =
  'inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

const trafficBase =
  'group inline-flex size-3 items-center justify-center rounded-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background focus-visible:outline-none';
</script>

<!--
  A fake desktop window (a legitimate Protoyard host chrome): the traffic
  lights and caption buttons imitate an operating system on purpose, so they
  stay native buttons; glyphs come through Texuli's Icon and the reopen action
  is Texuli's Button.
-->
{#if state === 'minimized'}
  <div
    {...rest}
    bind:this={ref}
    class={cn('flex items-end justify-center p-3', pillClass)}
    data-window-chrome=""
    data-variant={variant}
    data-state="minimized"
    data-maximized={maximized ? 'true' : 'false'}
  >
    <button
      type="button"
      class="inline-flex max-w-xs items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground shadow-float transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      aria-label={`Restore ${label}`}
      onclick={restore}
      data-window-control="restore"
    >
      <span
        class="size-2 shrink-0 rounded-full bg-primary"
        aria-hidden="true"
      ></span>
      <span class="truncate">{label}</span>
    </button>
  </div>
{:else if state === 'closed'}
  <div
    {...rest}
    bind:this={ref}
    class={cn(
      'flex flex-col items-center justify-center gap-3 border border-dashed border-border bg-muted/40 px-6 py-12 text-center',
      maximized ? 'h-full w-full rounded-none' : 'min-h-48 rounded-xl',
      className
    )}
    data-window-chrome=""
    data-variant={variant}
    data-state="closed"
    data-maximized={maximized ? 'true' : 'false'}
    role="status"
  >
    <p class="font-heading text-base font-semibold text-foreground">Window closed</p>
    <p class="max-w-sm text-sm text-muted-foreground">
      {label} is closed. Reopen it to continue.
    </p>
    <Button aria-label={`Reopen ${label}`} onclick={reopen} data-window-control="reopen">Reopen</Button>
  </div>
{:else}
  <div
    {...rest}
    bind:this={ref}
    class={cn(
      'flex flex-col overflow-hidden border border-border bg-background text-foreground shadow-float',
      maximized ? 'h-full w-full rounded-none' : 'h-full w-full rounded-xl',
      className
    )}
    data-window-chrome=""
    data-variant={variant}
    data-state="open"
    data-maximized={maximized ? 'true' : 'false'}
  >
    <!-- Title bar is purely visual (no -webkit-app-region). -->
    <div
      class="relative flex h-10 shrink-0 select-none items-center gap-2 border-b border-border bg-surface/90 px-3"
      data-window-titlebar
      ondblclick={onTitleDblClick}
      role="presentation"
    >
      {#if variant === 'mac-like'}
        <div class="relative z-10 flex items-center gap-1.5" data-window-controls="mac-like">
          <button
            type="button"
            class={cn(trafficBase, 'bg-[#ff5f57] text-[#4d0000]')}
            aria-label="Close"
            onclick={closeWindow}
            data-window-control="close"
          >
            <Icon icon={X} size="xs" class="size-2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden="true" />
          </button>
          <button
            type="button"
            class={cn(trafficBase, 'bg-[#febc2e] text-[#5a3a00]')}
            aria-label="Minimize"
            onclick={minimize}
            data-window-control="minimize"
          >
            <Icon icon={Minus} size="xs" class="size-2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden="true" />
          </button>
          <button
            type="button"
            class={cn(trafficBase, 'bg-[#28c840] text-[#0b3d12]')}
            aria-label={maximized ? 'Restore' : 'Maximize'}
            aria-pressed={maximized}
            onclick={toggleMaximize}
            data-window-control="maximize"
          >
            {#if maximized}
              <Icon icon={Copy} size="xs" class="size-2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden="true" />
            {:else}
              <Icon icon={Square} size="xs" class="size-1.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden="true" />
            {/if}
          </button>
        </div>
        <p
          class="pointer-events-none absolute inset-0 flex items-center justify-center truncate px-16 text-center text-xs font-medium text-muted-foreground"
          data-window-title
        >
          {label}
        </p>
        <div class="relative z-10 ml-auto w-[52px] shrink-0" aria-hidden="true"></div>
      {:else}
        <p class="min-w-0 flex-1 truncate pr-2 text-left text-xs font-medium text-foreground" data-window-title>
          {label}
        </p>
        <div class="flex items-center gap-0.5" data-window-controls="windows-like">
          <button
            type="button"
            class={controlClass}
            aria-label="Minimize"
            onclick={minimize}
            data-window-control="minimize"
          >
            <Icon icon={Minus} size="xs" class="size-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            class={controlClass}
            aria-label={maximized ? 'Restore' : 'Maximize'}
            aria-pressed={maximized}
            onclick={toggleMaximize}
            data-window-control="maximize"
          >
            {#if maximized}
              <Icon icon={Copy} size="xs" class="size-3.5" aria-hidden="true" />
            {:else}
              <Icon icon={Square} size="xs" class="size-3.5" aria-hidden="true" />
            {/if}
          </button>
          <button
            type="button"
            class={cn(controlClass, 'hover:bg-destructive hover:text-destructive-foreground')}
            aria-label="Close"
            onclick={closeWindow}
            data-window-control="close"
          >
            <Icon icon={X} size="xs" class="size-3.5" aria-hidden="true" />
          </button>
        </div>
      {/if}
    </div>

    {#if toolbar}
      <div class="shrink-0 border-b border-border bg-background" data-window-toolbar>
        {@render toolbar()}
      </div>
    {/if}

    <div class={cn('min-h-0 flex-1 overflow-auto', contentClass)} data-window-content>
      {@render children?.()}
    </div>
  </div>
{/if}
