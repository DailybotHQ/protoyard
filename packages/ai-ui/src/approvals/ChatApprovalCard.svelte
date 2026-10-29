<script lang="ts">
import { type ApprovalActor, mayDecide, type Suggestion } from '@protoyard/ai';
import { Button } from 'texuli/button';
import { Card } from 'texuli/card';
import { modeNeedsApproval } from './labels.ts';

/**
 * Compact chat-row approval for a pending suggestion. Same decision callbacks
 * as SuggestionCard; designed to sit inside a message list. Texuli card and
 * buttons; a decision shows its pending state on its own button.
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

<Card
  class="grid gap-2 p-3 text-sm {className}"
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
        <Button
          size="sm"
          variant="default"
          autoLoading={false}
          loading={pending === 'approve'}
          disabled={pending !== null}
          onclick={() => run('approve', () => onApprove(suggestion))}
        >
          Approve
        </Button>
      {:else if !needsApproval && mayDecide(viewer, suggestion, 'confirm') && onConfirm}
        <Button
          size="sm"
          variant="default"
          autoLoading={false}
          loading={pending === 'confirm'}
          disabled={pending !== null}
          onclick={() => run('confirm', () => onConfirm(suggestion))}
        >
          Confirm
        </Button>
      {:else if needsApproval && !viewer.canApprove}
        <span class="text-xs text-muted-foreground" role="status">Waiting for an approver</span>
      {/if}
      {#if mayDecide(viewer, suggestion, 'dismiss') && onDismiss}
        <Button
          size="sm"
          variant="outline"
          autoLoading={false}
          loading={pending === 'dismiss'}
          disabled={pending !== null}
          onclick={() => run('dismiss', () => onDismiss(suggestion))}
        >
          Dismiss
        </Button>
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
</Card>
