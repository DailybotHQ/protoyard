<script lang="ts">
import type { LeaderboardRow } from '@protoyard/gamification';
import { Button, EmptyState, Switch } from '@protoyard/ui';

/**
 * Ranked list that only shows opted-in rows (callers pass filtered rows from
 * rankLeaderboard). Optional opt-in control for the current person.
 */
let {
  rows,
  emptyTitle = 'Nobody is on the board yet',
  emptyDescription = 'The leaderboard only shows people who choose to appear.',
  currentSubjectId,
  rankingOptIn = $bindable<boolean | undefined>(undefined),
  onRankingOptInChange,
  class: className = '',
}: {
  rows: readonly LeaderboardRow[];
  emptyTitle?: string;
  emptyDescription?: string;
  /** When set with rankingOptIn, highlights "you" and shows the privacy switch. */
  currentSubjectId?: string;
  rankingOptIn?: boolean;
  /** Return a promise for pending feedback on the save path. */
  onRankingOptInChange?: (optIn: boolean) => unknown | Promise<unknown>;
  class?: string;
} = $props();

let pending = $state(false);
const showPrivacy = $derived(
  currentSubjectId !== undefined && rankingOptIn !== undefined && onRankingOptInChange !== undefined
);

async function setOptIn(next: boolean) {
  if (!onRankingOptInChange || pending) return;
  const previous = rankingOptIn;
  rankingOptIn = next;
  pending = true;
  try {
    await Promise.resolve(onRankingOptInChange(next));
  } catch (error) {
    rankingOptIn = previous;
    throw error;
  } finally {
    pending = false;
  }
}
</script>

<section class="grid gap-4 {className}" data-py-leaderboard aria-label="Leaderboard">
  {#if showPrivacy}
    <div
      class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2"
    >
      <div class="min-w-0">
        <p class="text-sm font-medium text-foreground">Appear on the leaderboard</p>
        <p class="text-xs text-muted-foreground">Optional. Simulated ranking only — not security.</p>
      </div>
      <div class="flex items-center gap-2">
        <Switch
          checked={rankingOptIn ?? false}
          disabled={pending}
          label="Appear on the leaderboard"
          onCheckedChange={(value) => {
            void setOptIn(Boolean(value));
          }}
        />
        {#if pending}
          <span class="text-xs text-muted-foreground" role="status">Saving…</span>
        {/if}
      </div>
    </div>
  {/if}

  {#if rows.length === 0}
    <div class="grid gap-3">
      <EmptyState title={emptyTitle} description={emptyDescription} />
      {#if rankingOptIn === false && onRankingOptInChange}
        <div class="flex justify-center">
          <Button size="sm" loading={pending} onclick={() => setOptIn(true)}>Show me on the board</Button>
        </div>
      {/if}
    </div>
  {:else}
    <ol class="m-0 flex list-none flex-col gap-1 p-0">
      {#each rows as row (row.subjectId)}
        {@const isYou = currentSubjectId !== undefined && row.subjectId === currentSubjectId}
        <li
          class="flex min-h-12 items-center gap-3 rounded-lg px-2 py-2 {isYou
            ? 'border border-primary/30 bg-primary/5'
            : ''}"
          data-py-leaderboard-row={row.subjectId}
          data-you={isYou ? 'true' : undefined}
        >
          <span
            class="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold tabular-nums text-foreground"
            aria-label={`Position ${row.position}`}
          >
            {row.position}
          </span>
          <span class="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
            {row.displayName}{#if isYou}<span class="text-muted-foreground"> (you)</span>{/if}
          </span>
          <span
            class="shrink-0 text-sm font-semibold tabular-nums text-foreground"
            aria-label={`${row.points} points`}
          >
            {row.points}
          </span>
        </li>
      {/each}
    </ol>
  {/if}
</section>
