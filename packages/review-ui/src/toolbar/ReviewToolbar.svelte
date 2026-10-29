<script lang="ts">
import { onMount, tick } from 'svelte';
import { Button } from 'texuli/button';
import { Input } from 'texuli/input';
import type { ReviewToolbarProps } from './types.ts';

/**
 * The floating review toolbar. Collapsed it is one small launcher button, which
 * the host places where it covers no app control and not the demo badge;
 * expanded (or while commenting) it shows the actions, growing away from its
 * corner. Escape collapses it.
 */
let {
  adapter,
  count,
  commentMode = false,
  panelOpen = false,
  onCommentModeChange,
  onPanelChange,
  onExport,
  onImport,
  showPanelButton = true,
  place,
  expanded = $bindable(false),
}: ReviewToolbarProps = $props();
let pending = $state(0);
let busyAction = $state<'comment' | 'panel' | 'export' | 'import' | undefined>();
let actionError = $state('');
let fileInput: HTMLElement | null = $state(null);
let toolbar: HTMLElement | null = $state(null);
let launcher: HTMLButtonElement | null = $state(null);
let placement: ReturnType<NonNullable<ReviewToolbarProps['place']>> | undefined;

/**
 * Without a host placer, sit above a fixed bottom nav (`data-py-bottom-nav`,
 * as the DevTools launcher does), measured against the *visible* bottom, so
 * the toolbar never covers a phone tab bar. The right edge follows
 * `--tx-fixed-right-edge` in CSS.
 */
let navOffset = $state(0);
let rightOffset = $state(0);
$effect(() => {
  if (place) return;
  let frame = 0;
  const measure = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const vv = window.visualViewport;
      const visibleBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
      const visibleRight = vv ? vv.offsetLeft + vv.width : window.innerWidth;
      let offset = 0;
      for (const nav of document.querySelectorAll<HTMLElement>('[data-py-bottom-nav]')) {
        const rect = nav.getBoundingClientRect();
        if (
          getComputedStyle(nav).position === 'fixed' &&
          rect.height > 0 &&
          rect.bottom >= visibleBottom - 1
        ) {
          offset = Math.max(offset, Math.round(visibleBottom - rect.top));
        }
      }
      navOffset = offset;
      rightOffset = Math.max(0, Math.round(window.innerWidth - visibleRight));
    });
  };
  measure();
  // App DOM changes only; the toolbar's own action row never moves it.
  const observer = new MutationObserver((mutations) => {
    if (mutations.some(({ target }) => !toolbar?.contains(target))) measure();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener('resize', measure);
  window.visualViewport?.addEventListener('resize', measure);
  return () => {
    cancelAnimationFrame(frame);
    observer.disconnect();
    window.removeEventListener('resize', measure);
    window.visualViewport?.removeEventListener('resize', measure);
  };
});

function refreshPending(): void {
  pending = Math.max(0, adapter.pendingCount?.() ?? 0);
}

onMount(() => {
  refreshPending();
  const unsubscribe = adapter.subscribePending?.(refreshPending);
  placement = toolbar && place ? place(toolbar, { handle: () => launcher ?? null }) : undefined;
  return () => {
    unsubscribe?.();
    placement?.destroy();
    placement = undefined;
  };
});

// The open action row is wider than the launcher and may now cover the target
// the reviewer is about to pin, or run past the visible edge: re-place once it
// has rendered.
$effect(() => {
  if (!open || !placement) return;
  const frame = requestAnimationFrame(() => placement?.update());
  return () => cancelAnimationFrame(frame);
});

async function run(
  action: NonNullable<typeof busyAction>,
  callback: (() => void | Promise<void>) | undefined
): Promise<void> {
  if (!callback || busyAction) return;
  busyAction = action;
  actionError = '';
  try {
    await callback();
  } catch (error) {
    actionError = error instanceof Error ? error.message : 'The review action failed.';
  } finally {
    busyAction = undefined;
  }
}

async function readImport(file?: File): Promise<void> {
  if (!file || !onImport) return;
  await run('import', async () => onImport(await file.text()));
  if (fileInput) (fileInput as HTMLInputElement).value = '';
}

/** `showPicker` throws without user activation or in some frames; `click` is the fallback. */
function openImportPicker(): void {
  const input = fileInput as HTMLInputElement | undefined;
  if (!input) return;
  try {
    if (typeof input.showPicker === 'function') {
      input.showPicker();
      return;
    }
  } catch {
    // Fall through to the classic click.
  }
  input.click();
}

/** The launcher collapses an open bar; while commenting, it stops comment mode instead. */
async function toggleToolbar(): Promise<void> {
  if (commentMode) {
    await run('comment', () => onCommentModeChange?.(false));
    return;
  }
  if (open) await collapse();
  else expanded = true;
}

async function collapse(): Promise<void> {
  expanded = false;
  await tick();
  launcher?.focus();
}

const open = $derived(expanded || commentMode);
const pendingLabel = $derived(
  pending === 0
    ? 'All comments synced'
    : `${pending} comment${pending === 1 ? '' : 's'} waiting to sync`
);
const adapterLabel = $derived.by(() => {
  const info = adapter.info();
  return `${info.kind}${info.shared ? ' · shared' : ' · this browser only'}${info.live ? ' · live' : ' · sync on refresh'}`;
});
</script>

<svelte:window
  onkeydown={(event) => {
    if (event.key === 'Escape' && expanded && !commentMode && toolbar?.contains(document.activeElement)) {
      event.preventDefault();
      void collapse();
    }
  }}
/>

<nav
  bind:this={toolbar}
  class="review-toolbar"
  class:review-toolbar--placed={Boolean(place)}
  data-py-review-toolbar={open ? 'expanded' : 'collapsed'}
  style:bottom={!place && navOffset > 0 ? `${navOffset + 12}px` : undefined}
  style:--review-right-edge={`${rightOffset}px`}
  aria-label="Prototype review toolbar"
>
  <Button
    bind:ref={launcher}
    variant="outline"
    size="sm"
    type="button"
    class="review-toolbar__launcher"
    aria-expanded={open}
    aria-controls="review-toolbar-actions"
    aria-label={`Review: ${count} comment thread${count === 1 ? '' : 's'}${pending ? `, ${pending} waiting to sync` : ''}`}
    title="Review comments"
    onclick={toggleToolbar}
  >
    <span aria-hidden="true">💬</span><span class="review-toolbar__badge" aria-hidden="true">{count}</span>{#if pending}<span class="review-toolbar__dot" aria-hidden="true"></span>{/if}
  </Button>
  <div id="review-toolbar-actions" class="review-toolbar__actions" hidden={!open}>
    <Button variant="outline" size="sm" type="button" aria-pressed={commentMode} aria-busy={busyAction === 'comment'} disabled={!onCommentModeChange || Boolean(busyAction)} onclick={() => run('comment', () => onCommentModeChange?.(!commentMode))}>
      {commentMode ? 'Stop commenting' : 'Comment'}
    </Button>
    <span class="review-toolbar__count" aria-label={`${count} comment threads`}>{count} comments</span>
    {#if showPanelButton}
      <Button variant="outline" size="sm" type="button" aria-expanded={panelOpen} aria-controls="review-comments-panel" aria-busy={busyAction === 'panel'} disabled={!onPanelChange || Boolean(busyAction)} onclick={() => run('panel', () => onPanelChange?.(!panelOpen))}>Comments</Button>
    {/if}
    {#if onExport}<Button variant="outline" size="sm" type="button" disabled={Boolean(busyAction)} aria-busy={busyAction === 'export'} onclick={() => run('export', onExport)}>Export</Button>{/if}
    {#if onImport}<Button variant="outline" size="sm" type="button" disabled={Boolean(busyAction)} aria-busy={busyAction === 'import'} onclick={openImportPicker}>Import</Button>{/if}
    <span class="review-toolbar__adapter" title={adapterLabel}>{adapterLabel}</span>
    {#if open}<span class="review-toolbar__pending" role="status" aria-live="polite">{pendingLabel}</span>{/if}
  </div>
  {#if onImport}<Input bind:ref={fileInput} class="review-toolbar__sr" type="file" accept="application/json,.json" aria-hidden="true" tabindex={-1} onchange={(event) => readImport(event.currentTarget.files?.[0])} />{/if}
  {#if !open}<span class="review-toolbar__sr" role="status" aria-live="polite">{pendingLabel}</span>{/if}
  {#if actionError}<span class="review-toolbar__error" role="alert">{actionError}</span>{/if}
</nav>

<style>
  .review-toolbar{position:fixed;z-index:2147482998;right:calc(.75rem + var(--review-right-edge,0px));bottom:calc(.75rem + env(safe-area-inset-bottom,0px));display:flex;max-width:calc(100vw - 1.5rem - var(--review-right-edge,0px));align-items:center;gap:.35rem;color:var(--tx-foreground,#18181b);font:inherit}
  .review-toolbar--placed{right:auto;bottom:auto}
  .review-toolbar:global([data-py-float-x="right"]),.review-toolbar:not(.review-toolbar--placed){flex-direction:row-reverse}
  .review-toolbar :global(button){flex:none;white-space:nowrap}
  .review-toolbar :global(.review-toolbar__launcher){position:relative;display:inline-flex;min-width:2.25rem;height:2.25rem;align-items:center;justify-content:center;gap:.25rem;border-radius:999px;padding:0 .6rem;box-shadow:0 3px 14px rgb(0 0 0 / .2);font-size:.8rem;font-weight:600}
  .review-toolbar__badge{font-variant-numeric:tabular-nums}
  .review-toolbar__dot{position:absolute;top:.1rem;right:.1rem;width:.55rem;height:.55rem;border:2px solid var(--tx-surface,#fff);border-radius:999px;background:var(--tx-warning,#f59e0b)}
  .review-toolbar__actions{display:flex;min-width:0;align-items:center;gap:.35rem;overflow-x:auto;border:1px solid var(--tx-border,#d4d4d8);border-radius:.75rem;background:var(--tx-surface,#fff);padding:.4rem;box-shadow:0 3px 14px rgb(0 0 0 / .2)}
  .review-toolbar__actions[hidden]{display:none}
  .review-toolbar :global(button[aria-pressed="true"]){background:var(--tx-primary,#6d28d9);color:var(--tx-primary-foreground,#fff)}.review-toolbar :global(button:focus-visible){outline:3px solid var(--tx-ring,#7c3aed);outline-offset:2px}.review-toolbar :global(button:disabled){opacity:.55;cursor:not-allowed}
  .review-toolbar__count,.review-toolbar__adapter,.review-toolbar__pending{flex:none;font-size:.72rem;white-space:nowrap}.review-toolbar__adapter{color:var(--tx-muted-foreground,#52525b)}
  .review-toolbar__pending{color:var(--tx-foreground,#18181b)}
  .review-toolbar__error{position:absolute;bottom:100%;right:0;margin-bottom:.3rem;border-radius:.375rem;background:var(--tx-destructive,#b91c1c);padding:.35rem .5rem;color:#fff;font-size:.75rem}
  :global(.review-toolbar__sr){position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;clip-path:inset(50%)}
  @media(max-width:40rem){.review-toolbar__adapter,.review-toolbar__count{display:none}}
</style>
