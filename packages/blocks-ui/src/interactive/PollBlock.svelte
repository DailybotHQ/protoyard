<script lang="ts">
import type { PollBlock as PollBlockType } from '@protoyard/blocks';
import { pollResults } from '@protoyard/blocks/interactive';
import { Button, Progress } from '@protoyard/ui';
import { DECK_INTERACTIVE_ATTRIBUTE } from '../lib/deck-interactive.ts';
import { useBlockState } from './use-block-state.svelte.ts';

let { block }: { block: PollBlockType } = $props();

const ctl = useBlockState(() => block);
const maxChoices = $derived(block.maxChoices ?? 1);
const resultsMode = $derived(block.results ?? 'after-vote');

let draft = $state<string[]>([]);
const results = $derived(pollResults(block, ctl.state, ctl.viewerId));
const hasVoted = $derived(results.mine !== null);
const showResults = $derived(
  resultsMode === 'always' || (resultsMode === 'after-vote' && hasVoted)
);

/** The viewer's stored vote, as a value that only changes when the vote does. */
const mine = $derived(results.mine ? results.mine.join('\u0000') : null);

// Follow the stored vote, not every state update: a host attaching or another
// viewer voting must not wipe a choice the viewer has not submitted yet.
$effect(() => {
  draft = mine === null ? [] : mine.split('\u0000');
});

function toggle(optionId: string) {
  if (hasVoted && resultsMode === 'after-vote') return;
  if (maxChoices === 1) {
    draft = [optionId];
    return;
  }
  if (draft.includes(optionId)) {
    draft = draft.filter((id) => id !== optionId);
  } else if (draft.length < maxChoices) {
    draft = [...draft, optionId];
  }
}

function vote() {
  if (draft.length === 0) return Promise.resolve(null);
  return ctl.dispatch({ type: 'vote', viewer: ctl.viewerId, options: [...draft] });
}

function clearVote() {
  return ctl.dispatch({ type: 'clear-vote', viewer: ctl.viewerId });
}
</script>

<section
  class="grid gap-3 rounded-lg border border-border bg-card p-4"
  data-py-block="poll"
  {...{ [DECK_INTERACTIVE_ATTRIBUTE]: '' }}
  data-block-id={block.id}
  aria-labelledby="poll-q-{block.id}"
>
  <h3 class="text-base font-semibold text-foreground" id="poll-q-{block.id}">{block.question}</h3>
  <p class="text-xs text-muted-foreground">
    {maxChoices === 1 ? 'Choose one option.' : `Choose up to ${maxChoices} options.`}
  </p>

  <ul class="grid gap-2" role="list">
    {#each block.options as option (option.id)}
      {@const selected = draft.includes(option.id)}
      {@const row = results.options.find((o) => o.id === option.id)}
      <li>
        <!-- Outline variant: foreground text on the surface (AA); selected adds a primary tint. -->
        <Button
          type="button"
          variant="outline"
          class="flex h-auto w-full flex-col items-stretch gap-1 rounded-md px-3 py-2 text-left text-sm
            {selected ? 'border-primary bg-primary/10 ring-1 ring-primary' : ''}"
          aria-pressed={selected}
          disabled={ctl.pending || (hasVoted && resultsMode === 'after-vote')}
          onclick={() => toggle(option.id)}
        >
          <span class="font-medium text-foreground">{option.label}</span>
          {#if showResults && row}
            <Progress
              value={Math.round(row.share * 100)}
              max={100}
              size="sm"
              tone="primary"
              ariaLabel="{option.label}: {row.votes} vote{row.votes === 1 ? '' : 's'}"
              showValue={false}
            />
            <span class="text-xs text-muted-foreground">
              {row.votes} vote{row.votes === 1 ? '' : 's'}
              ({Math.round(row.share * 100)}%)
            </span>
          {/if}
        </Button>
      </li>
    {/each}
  </ul>

  <div class="flex flex-wrap items-center gap-2">
    {#if !hasVoted || resultsMode !== 'after-vote'}
      <Button
        size="sm"
        loading={ctl.pending}
        loadingLabel="Saving vote"
        disabled={draft.length === 0}
        onclick={() => vote()}
      >
        {hasVoted ? 'Update vote' : 'Vote'}
      </Button>
    {/if}
    {#if hasVoted}
      <Button size="sm" variant="outline" loading={ctl.pending} onclick={() => clearVote()}>
        Clear my vote
      </Button>
    {/if}
  </div>

  <div class="sr-only" aria-live="polite" aria-atomic="true">
    {#if hasVoted}
      Vote saved. {results.voters} viewer{results.voters === 1 ? '' : 's'} have voted.
    {/if}
    {#if ctl.error}{ctl.error}{/if}
  </div>
  {#if ctl.error}
    <p class="text-sm text-destructive" role="alert">{ctl.error}</p>
  {/if}
</section>
