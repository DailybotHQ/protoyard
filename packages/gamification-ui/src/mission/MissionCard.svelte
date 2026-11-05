<script lang="ts">
import type { MissionProgress } from '@protoyard/gamification';
import { Button, Progress } from '@protoyard/ui';
import { useMessages } from 'texuli/i18n';

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

const messages = useMessages();
const M = 'protoyard.gamification.mission-card';
/** `requiresAcceptance: false` missions count as started without an Accept step. */
const started = $derived(mission.accepted || mission.requiresAcceptance === false);
const canAccept = $derived(!started && !mission.expired && !mission.complete);
const status = $derived(
  mission.complete
    ? messages(`${M}.status-complete`, 'Complete')
    : mission.expired
      ? messages(`${M}.status-expired`, 'Expired')
      : started
        ? messages(`${M}.status-in-progress`, 'In progress')
        : messages(`${M}.status-available`, 'Available')
);
const values = $derived({
  progress: String(mission.progress),
  goal: String(mission.goal),
  reward: String(mission.reward),
});

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
    label={messages(`${M}.progress`, 'Progress')}
    showValue={false}
    size="sm"
    ariaLabel={messages(`${M}.progress-value`, '{progress} of {goal}', values)}
  />
  <p class="text-xs text-muted-foreground tabular-nums">
    {mission.progress} / {mission.goal}
    <span class="mx-1 text-border">·</span>
    {messages(`${M}.reward`, 'Reward {reward} points', values)}
  </p>

  {#if canAccept && onAccept}
    <Button size="sm" class="self-start" onclick={() => handleAccept()}
      >{messages(`${M}.accept`, 'Accept mission')}</Button
    >
  {:else if mission.accepted && !mission.complete}
    <p class="text-xs font-medium text-primary">{messages(`${M}.accepted`, 'Accepted')}</p>
  {:else if mission.complete}
    <p class="text-xs font-medium text-success">{messages(`${M}.completed`, 'Completed')}</p>
  {/if}
</article>
