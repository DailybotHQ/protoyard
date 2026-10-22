<script lang="ts">
import { cn } from '../../../lib/cn.ts';
import { PASSWORD_SCORE_LEVELS, PASSWORD_SCORE_WORDS, passwordScore } from './password-score.ts';

/**
 * PasswordStrengthMeter — five-segment strength bar under a password field.
 * Simulation only: rates the supplied string in memory. Never stores, hashes
 * or transmits the value. Pair with a real Input type="password"; this meter
 * is display-only.
 */
interface Props {
  /** Password text to rate. Not persisted by this component. */
  value?: string;
  /** Prefer rule keys over human messages in onFeedback. */
  rawFeedbackKeys?: boolean;
  label?: string;
  class?: string;
  onScore?: (score: number) => void;
  onFeedback?: (feedback: string[]) => void;
}

let {
  value = '',
  rawFeedbackKeys = false,
  label = 'Password strength',
  class: className,
  onScore,
  onFeedback,
}: Props = $props();

const result = $derived(passwordScore(value));
const level = $derived(PASSWORD_SCORE_LEVELS[result.score] ?? '');
const word = $derived(PASSWORD_SCORE_WORDS[result.score] ?? 'None');

const segmentClass = $derived.by(() => {
  switch (result.score) {
    case 1:
    case 2:
      return 'bg-destructive';
    case 3:
      return 'bg-warning';
    case 4:
      return 'bg-warning';
    case 5:
      return 'bg-success';
    default:
      return 'bg-border';
  }
});

$effect(() => {
  if (!value) return;
  onScore?.(result.score);
  onFeedback?.(rawFeedbackKeys ? [...result.failed] : result.messages);
});
</script>

<div
  class={cn('grid grid-cols-5 gap-1', className)}
  role="meter"
  aria-label={label}
  aria-valuemin={0}
  aria-valuemax={5}
  aria-valuenow={result.score}
  aria-valuetext={word}
  data-level={level || undefined}
>
  {#each [0, 1, 2, 3, 4] as index (index)}
    <span
      class={cn(
        'h-1 rounded-full transition-colors duration-200 motion-reduce:transition-none',
        index < result.score ? segmentClass : 'bg-border'
      )}
    ></span>
  {/each}
</div>

{#if value && result.messages.length}
  <ul class="mt-1.5 grid gap-0.5 text-xs text-muted-foreground" aria-live="polite">
    {#each result.messages as message (message)}
      <li>{message}</li>
    {/each}
  </ul>
{/if}
