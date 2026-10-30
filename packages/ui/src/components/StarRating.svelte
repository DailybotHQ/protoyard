<script lang="ts">
import type { HTMLAttributes } from 'svelte/elements';
import { Rating } from 'texuli/rating';

/**
 * Accessible star rating as a radio group: a thin adapter over Texuli's
 * `Rating` (`texuli/rating`), keeping Protoyard's `maxStars` and `onchange`.
 */
interface OwnProps {
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
  /** The rendered root element (bindable). */
  ref?: HTMLElement | null;
}

/** Extra attributes: `aria-*`, `data-*` reach the radio group, the rest the root (as in Texuli). */
type Props = OwnProps & Omit<HTMLAttributes<HTMLDivElement>, keyof OwnProps | 'children'>;

let {
  value = $bindable(0),
  label = 'Rating',
  maxStars = 5,
  disabled = false,
  hideLabel = false,
  name,
  class: className,
  onchange,
  ref = $bindable(null),
  ...rest
}: Props = $props();

const count = $derived(Math.min(10, Math.max(2, Math.floor(maxStars) || 5)));
</script>

<Rating
  {...rest}
  bind:ref
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
