<script lang="ts">
import { onMount } from 'svelte';
import type { ReviewToolbarProps } from './types.ts';

let {
  adapter,
  count,
  commentMode = false,
  panelOpen = false,
  onCommentModeChange,
  onPanelChange,
  onExport,
  onImport,
}: ReviewToolbarProps = $props();
let pending = $state(0);
let busyAction = $state<'comment' | 'panel' | 'export' | 'import' | undefined>();
let actionError = $state('');
let fileInput: HTMLInputElement;

function refreshPending(): void {
  pending = Math.max(0, adapter.pendingCount?.() ?? 0);
}

onMount(() => {
  refreshPending();
  return adapter.subscribePending?.(refreshPending);
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
  if (fileInput) fileInput.value = '';
}

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

<nav class="review-toolbar" aria-label="Prototype review toolbar">
  <button type="button" aria-pressed={commentMode} aria-busy={busyAction === 'comment'} disabled={!onCommentModeChange || Boolean(busyAction)} onclick={() => run('comment', () => onCommentModeChange?.(!commentMode))}>
    {commentMode ? 'Stop commenting' : 'Comment'}
  </button>
  <span class="review-toolbar__count" aria-label={`${count} comment threads`}>{count} comments</span>
  <button type="button" aria-expanded={panelOpen} aria-controls="review-comments-panel" aria-busy={busyAction === 'panel'} disabled={!onPanelChange || Boolean(busyAction)} onclick={() => run('panel', () => onPanelChange?.(!panelOpen))}>Comments</button>
  <button type="button" disabled={!onExport || Boolean(busyAction)} aria-busy={busyAction === 'export'} onclick={() => run('export', onExport)}>Export</button>
  <button type="button" disabled={!onImport || Boolean(busyAction)} aria-busy={busyAction === 'import'} onclick={() => fileInput?.click()}>Import</button>
  <input bind:this={fileInput} class="review-toolbar__file" type="file" accept="application/json,.json" aria-hidden="true" tabindex="-1" onchange={(event) => readImport(event.currentTarget.files?.[0])} />
  <span class="review-toolbar__adapter" title={adapterLabel}>{adapterLabel}</span>
  <span class="review-toolbar__pending" role="status" aria-live="polite">{pendingLabel}</span>
  {#if actionError}<span class="review-toolbar__error" role="alert">{actionError}</span>{/if}
</nav>

<style>
  .review-toolbar{position:fixed;z-index:2147482998;top:calc(.75rem + env(safe-area-inset-top,0px));right:.75rem;display:flex;max-width:min(calc(100vw - 1.5rem),34rem);align-items:center;gap:.35rem;overflow-x:auto;border:1px solid var(--py-border,#d4d4d8);border-radius:.75rem;background:var(--py-surface,#fff);padding:.4rem;box-shadow:0 3px 14px rgb(0 0 0 / .2);color:var(--py-foreground,#18181b);font:inherit}
  .review-toolbar button{flex:none;border:1px solid var(--py-border,#d4d4d8);border-radius:.45rem;background:var(--py-surface,#fff);padding:.4rem .55rem;color:inherit;font:inherit;font-size:.8rem;white-space:nowrap;cursor:pointer}.review-toolbar button[aria-pressed="true"]{background:var(--py-primary,#6d28d9);color:var(--py-primary-foreground,#fff)}.review-toolbar button:focus-visible{outline:3px solid var(--py-ring,#7c3aed);outline-offset:2px}.review-toolbar button:disabled{opacity:.55;cursor:not-allowed}
  .review-toolbar__count,.review-toolbar__adapter,.review-toolbar__pending{flex:none;font-size:.72rem;white-space:nowrap}.review-toolbar__adapter{color:var(--py-muted-foreground,#52525b)}.review-toolbar__pending{color:var(--py-warning-foreground,#854d0e)}.review-toolbar__error{position:absolute;top:100%;right:0;margin-top:.3rem;border-radius:.375rem;background:var(--py-destructive,#b91c1c);padding:.35rem .5rem;color:#fff;font-size:.75rem}.review-toolbar__file{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;clip-path:inset(50%)}
  /* While a review session runs on a full-bleed page (no device frame), the toolbar is a
     bar docked at the top that takes real space: the page starts below it and full-screen
     apps (h-app) shrink to fit, so it never covers the app's own header controls. */
  :global(html[data-py-review]:not([data-py-shell])){--py-review-bar:calc(2.9rem + env(safe-area-inset-top,0px));--py-app-height:calc(100dvh - var(--py-review-bar))}
  :global(html[data-py-review]:not([data-py-shell]) body){padding-top:var(--py-review-bar)}
  :global(html[data-py-review]:not([data-py-shell])) .review-toolbar{top:0;right:0;left:0;height:var(--py-review-bar);max-width:none;border-width:0 0 1px;border-radius:0;box-shadow:none;padding:calc(.35rem + env(safe-area-inset-top,0px)) .75rem .35rem}
  @media(max-width:40rem){.review-toolbar{top:calc(.5rem + env(safe-area-inset-top,0px));right:calc(.5rem + env(safe-area-inset-right,0px));bottom:auto;left:calc(.5rem + env(safe-area-inset-left,0px));max-width:none;justify-content:flex-start;border-radius:.7rem}.review-toolbar__adapter{display:none}}
</style>
