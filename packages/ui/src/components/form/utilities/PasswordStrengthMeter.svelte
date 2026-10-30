<script lang="ts">
import type { HTMLAttributes } from 'svelte/elements';
import { cx } from 'texuli/cx';
import { Progress } from 'texuli/feedback';
import { PASSWORD_SCORE_LEVELS, PASSWORD_SCORE_WORDS, passwordScore } from './password-score.ts';

/**
 * PasswordStrengthMeter — five-segment strength bar under a password field.
 * Simulation only: rates the supplied string in memory. Never stores, hashes
 * or transmits the value. Pair with a real Input type="password"; this meter
 * is display-only.
 */
interface OwnProps {
  /** Password text to rate. Not persisted by this component. */
  value?: string;
  /** Prefer rule keys over human messages in onFeedback. */
  rawFeedbackKeys?: boolean;
  label?: string;
  class?: string;
  onScore?: (score: number) => void;
  onFeedback?: (feedback: string[]) => void;
  /** The meter element (bindable). The rule messages, when shown, follow it as a sibling. */
  ref?: HTMLElement | null;
}

/** Extra attributes (`data-*`, `aria-describedby`, handlers…) land on the meter element. */
type Props = OwnProps &
  Omit<
    HTMLAttributes<HTMLDivElement>,
    | keyof OwnProps
    | 'children'
    | 'role'
    | 'aria-label'
    | 'aria-valuemin'
    | 'aria-valuemax'
    | 'aria-valuenow'
    | 'aria-valuetext'
  >;

let {
  value = '',
  rawFeedbackKeys = false,
  label = 'Password strength',
  class: className,
  onScore,
  onFeedback,
  ref = $bindable(null),
  ...rest
}: Props = $props();

const result = $derived(passwordScore(value));
const level = $derived(PASSWORD_SCORE_LEVELS[result.score] ?? '');
const word = $derived(PASSWORD_SCORE_WORDS[result.score] ?? 'None');

// Texuli's Progress draws the bar; its tone follows the score.
const tone = $derived(
  result.score >= 5
    ? 'success'
    : result.score >= 3
      ? 'warning'
      : result.score > 0
        ? 'destructive'
        : 'neutral'
);

$effect(() => {
  if (!value) return;
  onScore?.(result.score);
  onFeedback?.(rawFeedbackKeys ? [...result.failed] : result.messages);
});
</script>

<!-- A meter (the score is a measurement, not progress); the bar inside is Texuli's Progress, hidden from assistive tech. -->
<div
  {...rest}
  bind:this={ref}
  class={cx('ui-password-meter', className)}
  role="meter"
  aria-label={label}
  aria-valuemin={0}
  aria-valuemax={5}
  aria-valuenow={result.score}
  aria-valuetext={word}
  data-level={level || undefined}
>
  <Progress value={result.score} max={5} {tone} size="sm" aria-hidden="true" />
</div>

{#if value && result.messages.length}
  <ul class="ui-password-meter__messages" aria-live="polite">
    {#each result.messages as message (message)}
      <li>{message}</li>
    {/each}
  </ul>
{/if}

<style>
  .ui-password-meter__messages {
    display: grid;
    gap: 0.125rem;
    margin: 0.375rem 0 0;
    padding: 0;
    list-style: none;
    color: var(--tx-muted-foreground, GrayText);
    font-size: var(--tx-font-size-xs, 0.75rem);
  }
</style>
