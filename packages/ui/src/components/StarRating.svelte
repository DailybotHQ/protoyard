<script lang="ts">
/**
 * Accessible star rating as a radiogroup. Arrow keys move with wrap (via
 * `rovingKeydown`); selection follows focus. Theme tokens only.
 */
import { Star } from '@lucide/svelte';
import { cn } from '../lib/cn.ts';
import { type RovingEntry, rovingKeydown, rovingTabIndex } from '../lib/roving.ts';

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

const uid = $props.id();
const groupName = $derived(name ?? `star-rating-${uid}`);
const count = $derived(Math.min(10, Math.max(2, Math.floor(maxStars) || 5)));
const ratings = $derived(Array.from({ length: count }, (_, i) => i + 1));
const entries = $derived<RovingEntry[]>(
  ratings.map((rating) => ({ value: String(rating), disabled }))
);
const currentKey = $derived(value > 0 ? String(value) : '');

function select(rating: number): void {
  if (disabled) return;
  const next = Math.min(count, Math.max(0, Math.floor(rating)));
  if (next === value) return;
  value = next;
  onchange?.(next);
}

function onStarKeydown(event: KeyboardEvent, rating: number): void {
  if (disabled) return;
  rovingKeydown(event, entries, currentKey || String(rating), (next) => {
    select(Number(next));
  });
}
</script>

<fieldset class={cn('grid gap-2', className)} {disabled}>
  <legend class={cn('text-sm font-medium text-foreground', hideLabel && 'sr-only')}>{label}</legend>
  <div role="radiogroup" aria-label={label} class="flex flex-wrap items-center gap-0.5">
    {#each ratings as rating (rating)}
      {@const selected = value === rating}
      {@const filled = value >= rating}
      <button
        type="button"
        role="radio"
        aria-checked={selected}
        aria-label={`${rating} of ${count} stars`}
        data-value={String(rating)}
        tabindex={disabled ? -1 : rovingTabIndex(currentKey, String(rating), entries)}
        disabled={disabled}
        onclick={() => select(rating)}
        onkeydown={(event) => onStarKeydown(event, rating)}
        class={cn(
          'inline-flex size-11 min-h-touch min-w-[44px] items-center justify-center rounded-md text-muted-foreground transition-colors',
          'hover:text-warning focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          'disabled:pointer-events-none disabled:opacity-50 sm:size-9 sm:min-h-0 sm:min-w-0',
          filled && 'text-warning'
        )}
      >
        <Star
          aria-hidden="true"
          class="size-7 sm:size-6"
          fill={filled ? 'currentColor' : 'none'}
          stroke-width={filled ? 0 : 1.75}
        />
      </button>
    {/each}
    <output aria-live="polite" class="ml-2 text-sm font-medium text-muted-foreground">
      {value > 0 ? `${value} of ${count}` : 'Not rated'}
    </output>
  </div>
</fieldset>
