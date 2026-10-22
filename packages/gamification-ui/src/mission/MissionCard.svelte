<script lang="ts">
import type { MissionProgress } from '@protoyard/gamification';
import { Button, Progress } from '@protoyard/ui';

/**
 * Mission summary with progress and an Accept control. `onAccept` should return
 * a promise so the Button shows pending feedback (AGENTS.md async rule).
 */
let {
  mission,
  onAccept,
  class: className = '',
}: {
  mission: MissionProgress;
  /** Called when the person accepts; return a promise for pending UI. */
  onAccept?: (missionId: string) => unknown | Promise<unknown>;
  class?: string;
} = $props();

const canAccept = $derived(!mission.accepted && !mission.expired && !mission.complete);
const status = $derived(
  mission.complete
    ? 'Complete'
    : mission.expired
      ? 'Expired'
      : mission.accepted
        ? 'In progress'
        : 'Available'
);

function handleAccept() {
  return onAccept?.(mission.id);
}
</script>

<article
  class="flex flex-col gap-3 rounded-xl border bg-surface p-4 text-surface-foreground shadow-soft {mission.accepted
    ? 'border-primary/40'
    : 'border-border'} {className}"
  data-py-mission-card
  data-mission-id={mission.id}
  aria-labelledby="mission-{mission.id}-title"
>
  <header class="flex items-start justify-between gap-3">
    <div class="min-w-0 space-y-1">
      <h3 id="mission-{mission.id}-title" class="text-sm font-semibold text-foreground">
        {mission.title}
      </h3>
      <p class="text-xs leading-5 text-muted-foreground">{mission.description}</p>
    </div>
    <span
      class="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[0.65rem] font-medium text-muted-foreground"
      >{status}</span
    >
  </header>

  <Progress
    value={mission.progress}
    max={mission.goal}
    label="Progress"
    showValue={false}
    size="sm"
    ariaLabel={`${mission.progress} of ${mission.goal}`}
  />
  <p class="text-xs text-muted-foreground tabular-nums">
    {mission.progress} / {mission.goal}
    <span class="mx-1 text-border">·</span>
    Reward {mission.reward} points
  </p>

  {#if canAccept && onAccept}
    <Button size="sm" class="self-start" onclick={() => handleAccept()}>Accept mission</Button>
  {:else if mission.accepted && !mission.complete}
    <p class="text-xs font-medium text-primary">Accepted</p>
  {:else if mission.complete}
    <p class="text-xs font-medium text-success">Completed</p>
  {/if}
</article>
