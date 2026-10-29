<script lang="ts">
import { Rating } from 'texuli/rating';

/**
 * Accessible star rating as a radio group: a thin adapter over Texuli's
 * `Rating` (`texuli/rating`), keeping Protoyard's `maxStars` and `onchange`.
 */
interface Props {
  /** Selected rating from 1…maxStars, or 0 when none. */
  value?: number;
  /** Accessible and visible label for the group. */
  label?: string;
  /** Number of stars (2–10). Default 5. */
  maxStars?: number;
  disabled?: boolean;
  /** Hide the legend visually while keeping it for assistive tech. */
  hideLabel?: boolean;
  name?: string;
  class?: string;
  onchange?: (value: number) => void;
}

let {
  value = $bindable(0),
  label = 'Rating',
  maxStars = 5,
  disabled = false,
  hideLabel = false,
  name,
  class: className,
  onchange,
}: Props = $props();

const count = $derived(Math.min(10, Math.max(2, Math.floor(maxStars) || 5)));
</script>

<Rating
  bind:value
  max={count}
  {disabled}
  {hideLabel}
  {name}
  showValue
  labels={{ label }}
  onValueChange={onchange}
  class={className}
/>
