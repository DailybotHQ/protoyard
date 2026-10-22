<script lang="ts">
import { LoaderCircle } from '@lucide/svelte';
import { type ApprovalActor, mayDecide, type Suggestion } from '@protoyard/ai';
import { modeNeedsApproval } from './labels.ts';

/**
 * Compact chat-row approval for a pending suggestion. Same decision callbacks
 * as SuggestionCard; designed to sit inside a message list.
 */
let {
  suggestion,
  viewer,
  onConfirm,
  onApprove,
  onDismiss,
  class: className = '',
}: {
  suggestion: Suggestion;
  viewer: ApprovalActor;
  onConfirm?: (suggestion: Suggestion) => unknown | Promise<unknown>;
  onApprove?: (suggestion: Suggestion) => unknown | Promise<unknown>;
  onDismiss?: (suggestion: Suggestion) => unknown | Promise<unknown>;
  class?: string;
} = $props();

let pending = $state<'confirm' | 'approve' | 'dismiss' | null>(null);
let error = $state('');

const needsApproval = $derived(modeNeedsApproval(suggestion.mode));
const waiting = $derived(suggestion.status === 'pending');

async function run(
  kind: 'confirm' | 'approve' | 'dismiss',
  work: () => unknown | Promise<unknown>
): Promise<void> {
  if (pending) return;
  pending = kind;
  error = '';
  try {
    await Promise.resolve(work());
  } catch (err) {
    error = err instanceof Error ? err.message : 'The action could not be completed.';
  } finally {
    pending = null;
  }
}
</script>

<div
  class="grid gap-2 rounded-lg border border-border bg-elevated p-3 text-sm shadow-soft {className}"
  data-py-chat-approval
  data-status={suggestion.status}
  role="group"
  aria-label="Simulated approval request"
>
  <p class="m-0 font-medium text-foreground">{suggestion.summary}</p>
  {#if suggestion.preparedApplySummary}
    <p class="m-0 text-xs text-muted-foreground">
      Prepared: {suggestion.preparedApplySummary}
    </p>
  {/if}
  <p class="m-0 text-[0.7rem] text-muted-foreground">Simulated approval · not security</p>

  {#if waiting}
    <div class="flex flex-wrap gap-2" aria-label="Approval actions">
      {#if needsApproval && mayDecide(viewer, suggestion, 'approve') && onApprove}
        <button
          type="button"
          class="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
          disabled={pending !== null}
          aria-busy={pending === 'approve' ? 'true' : undefined}
          onclick={() => run('approve', () => onApprove(suggestion))}
        >
          {#if pending === 'approve'}
            <LoaderCircle class="size-3.5 motion-safe:animate-spin" aria-hidden="true" />
          {/if}
          Approve
        </button>
      {:else if !needsApproval && mayDecide(viewer, suggestion, 'confirm') && onConfirm}
        <button
          type="button"
          class="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
          disabled={pending !== null}
          aria-busy={pending === 'confirm' ? 'true' : undefined}
          onclick={() => run('confirm', () => onConfirm(suggestion))}
        >
          {#if pending === 'confirm'}
            <LoaderCircle class="size-3.5 motion-safe:animate-spin" aria-hidden="true" />
          {/if}
          Confirm
        </button>
      {:else if needsApproval && !viewer.canApprove}
        <span class="text-xs text-muted-foreground" role="status">Waiting for an approver</span>
      {/if}
      {#if mayDecide(viewer, suggestion, 'dismiss') && onDismiss}
        <button
          type="button"
          class="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium disabled:opacity-50"
          disabled={pending !== null}
          aria-busy={pending === 'dismiss' ? 'true' : undefined}
          onclick={() => run('dismiss', () => onDismiss(suggestion))}
        >
          {#if pending === 'dismiss'}
            <LoaderCircle class="size-3.5 motion-safe:animate-spin" aria-hidden="true" />
          {/if}
          Dismiss
        </button>
      {/if}
    </div>
  {:else}
    <p class="m-0 text-xs text-muted-foreground" role="status">
      {suggestion.status === 'confirmed' || suggestion.status === 'auto'
        ? 'Decided'
        : suggestion.status === 'dismissed'
          ? 'Dismissed'
          : suggestion.status}
    </p>
  {/if}
  {#if error}
    <p class="m-0 text-xs text-destructive" role="alert">{error}</p>
  {/if}
</div>
