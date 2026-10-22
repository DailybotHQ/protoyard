<script lang="ts">
import { LoaderCircle } from '@lucide/svelte';
import {
  type ApprovalActor,
  mayDecide,
  type Suggestion,
  type SuggestionTarget,
  statusLine,
} from '@protoyard/ai';
import { modeNeedsApproval, SUGGESTION_STATUS_LABELS } from './labels.ts';

/**
 * Evidence-backed suggestion card. Every decision is an explicit callback the
 * prototype routes through its services. Pending feedback is local UI only.
 * Simulated — not real authority or security.
 */
type Decision = 'confirm' | 'approve' | 'dismiss' | 'edit';

let {
  suggestion,
  viewer,
  targets = [],
  notified = false,
  resultHref,
  onConfirm,
  onApprove,
  onDismiss,
  onEdit,
  class: className = '',
}: {
  suggestion: Suggestion;
  viewer: ApprovalActor;
  /** Optional retarget choices for Edit. */
  targets?: readonly SuggestionTarget[];
  /** Whether a notify audit row already exists (status line wording). */
  notified?: boolean;
  resultHref?: string;
  onConfirm?: (suggestion: Suggestion) => unknown | Promise<unknown>;
  onApprove?: (suggestion: Suggestion) => unknown | Promise<unknown>;
  onDismiss?: (suggestion: Suggestion) => unknown | Promise<unknown>;
  onEdit?: (suggestion: Suggestion, target: SuggestionTarget) => unknown | Promise<unknown>;
  class?: string;
} = $props();

let pending = $state<Decision | null>(null);
let error = $state('');
let editOpen = $state(false);
let pickedId = $state<string | null>(null);

const needsApproval = $derived(modeNeedsApproval(suggestion.mode));
const waiting = $derived(suggestion.status === 'pending');
const canConfirm = $derived(waiting && !needsApproval && mayDecide(viewer, suggestion, 'confirm'));
const canApprove = $derived(waiting && needsApproval && mayDecide(viewer, suggestion, 'approve'));
const canDismiss = $derived(waiting && mayDecide(viewer, suggestion, 'dismiss'));
const canEdit = $derived(waiting && mayDecide(viewer, suggestion, 'edit') && targets.length > 0);
const line = $derived(statusLine(suggestion, viewer, notified));
const busy = $derived(pending !== null);

async function run(decision: Decision, work: () => unknown | Promise<unknown>): Promise<void> {
  if (busy) return;
  pending = decision;
  error = '';
  try {
    await Promise.resolve(work());
  } catch (err) {
    error = err instanceof Error ? err.message : 'The action could not be completed.';
  } finally {
    pending = null;
  }
}

function openEdit(): void {
  pickedId = suggestion.targetId ?? targets[0]?.targetId ?? null;
  editOpen = true;
}

function saveEdit(): void {
  const target = targets.find((row) => row.targetId === pickedId);
  if (!target || !onEdit) return;
  void run('edit', () => onEdit(suggestion, target)).then(() => {
    if (!error) editOpen = false;
  });
}
</script>

<article
  class="grid gap-3 rounded-xl border border-border bg-surface p-4 text-surface-foreground shadow-soft {className}"
  data-py-suggestion-card
  data-status={suggestion.status}
  data-mode={suggestion.mode}
  aria-labelledby="suggestion-{suggestion.id}-title"
>
  <header class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
    <span
      class="rounded-full bg-muted px-2 py-0.5 font-semibold text-foreground"
      data-py-agent-chip>Simulated agent</span
    >
    <span>{SUGGESTION_STATUS_LABELS[suggestion.status]}</span>
    <span class="ml-auto text-[0.7rem]">Simulated · no real authority</span>
  </header>

  <h3 id="suggestion-{suggestion.id}-title" class="m-0 text-base font-semibold text-foreground">
    {suggestion.summary}
  </h3>

  {#if suggestion.targetLabel || suggestion.targetKey}
    <p class="m-0 text-sm text-muted-foreground">
      Target:
      <span class="font-medium text-foreground"
        >{suggestion.targetLabel ?? suggestion.targetKey}</span
      >
      {#if suggestion.targetKey && suggestion.targetLabel}
        <span class="text-muted-foreground"> ({suggestion.targetKey})</span>
      {/if}
    </p>
  {/if}

  {#if suggestion.preparedApplySummary || suggestion.preparedNotifySummary}
    <dl class="m-0 grid gap-1 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
      {#if suggestion.preparedApplySummary}
        <div>
          <dt class="font-medium text-foreground">Prepared change</dt>
          <dd class="m-0 text-muted-foreground">{suggestion.preparedApplySummary}</dd>
        </div>
      {/if}
      {#if suggestion.preparedNotifySummary}
        <div>
          <dt class="font-medium text-foreground">Prepared notification</dt>
          <dd class="m-0 text-muted-foreground">{suggestion.preparedNotifySummary}</dd>
        </div>
      {/if}
    </dl>
  {/if}

  {#if waiting && needsApproval && !viewer.canApprove}
    <p class="m-0 text-sm text-muted-foreground" role="status">Waiting for an approver.</p>
  {/if}

  {#if waiting && (canApprove || canConfirm || canDismiss || canEdit)}
    <div class="flex flex-wrap gap-2" aria-label="Suggestion actions">
      {#if canApprove && onApprove}
        <button
          type="button"
          class="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          disabled={busy}
          aria-busy={pending === 'approve' ? 'true' : undefined}
          onclick={() => run('approve', () => onApprove(suggestion))}
        >
          {#if pending === 'approve'}
            <LoaderCircle class="size-4 motion-safe:animate-spin" aria-hidden="true" />
          {/if}
          Approve
        </button>
      {:else if canConfirm && onConfirm}
        <button
          type="button"
          class="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          disabled={busy}
          aria-busy={pending === 'confirm' ? 'true' : undefined}
          onclick={() => run('confirm', () => onConfirm(suggestion))}
        >
          {#if pending === 'confirm'}
            <LoaderCircle class="size-4 motion-safe:animate-spin" aria-hidden="true" />
          {/if}
          Confirm
        </button>
      {/if}
      {#if canEdit && onEdit}
        <button
          type="button"
          class="inline-flex min-h-10 items-center justify-center rounded-lg border border-border bg-surface px-3 text-sm font-medium text-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          disabled={busy}
          onclick={openEdit}
        >
          Edit
        </button>
      {/if}
      {#if canDismiss && onDismiss}
        <button
          type="button"
          class="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm font-medium text-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          disabled={busy}
          aria-busy={pending === 'dismiss' ? 'true' : undefined}
          onclick={() => run('dismiss', () => onDismiss(suggestion))}
        >
          {#if pending === 'dismiss'}
            <LoaderCircle class="size-4 motion-safe:animate-spin" aria-hidden="true" />
          {/if}
          Dismiss
        </button>
      {/if}
    </div>
  {:else if !waiting}
    <p class="m-0 text-sm text-muted-foreground" role="status">
      {#if suggestion.status === 'confirmed' && resultHref}
        <a class="font-medium text-primary underline" href={resultHref}>View result</a>
      {:else}
        {line}
      {/if}
    </p>
  {/if}

  {#if pending}
    <p class="m-0 text-xs text-muted-foreground" role="status" aria-live="polite">
      {pending === 'approve'
        ? 'Approving…'
        : pending === 'dismiss'
          ? 'Dismissing…'
          : pending === 'edit'
            ? 'Saving…'
            : 'Confirming…'}
    </p>
  {/if}
  {#if error}
    <p class="m-0 text-sm text-destructive" role="alert">{error}</p>
  {/if}

  {#if editOpen}
    <div
      class="grid gap-3 rounded-lg border border-border bg-muted/30 p-3"
      data-py-suggestion-edit
    >
      <label class="grid gap-1 text-sm" for="suggestion-edit-{suggestion.id}">
        <span class="font-medium text-foreground">Link to target</span>
        <select
          id="suggestion-edit-{suggestion.id}"
          class="h-10 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={pickedId ?? undefined}
          onchange={(event) => {
            pickedId = event.currentTarget.value;
          }}
        >
          {#each targets as target (target.targetId)}
            <option value={target.targetId}
              >{target.targetKey} — {target.targetLabel}</option
            >
          {/each}
        </select>
      </label>
      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          class="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
          disabled={busy || !pickedId}
          aria-busy={pending === 'edit' ? 'true' : undefined}
          onclick={saveEdit}
        >
          {#if pending === 'edit'}
            <LoaderCircle class="size-4 motion-safe:animate-spin" aria-hidden="true" />
          {/if}
          Save
        </button>
        <button
          type="button"
          class="inline-flex min-h-10 items-center rounded-lg border border-border px-3 text-sm"
          disabled={busy}
          onclick={() => (editOpen = false)}
        >
          Cancel
        </button>
      </div>
    </div>
  {/if}
</article>
