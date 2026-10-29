<script lang="ts">
import { cx } from 'texuli/cx';
import { ToggleGroup, ToggleGroupItem } from 'texuli/toggle';
import {
  type IsoWeekday,
  normalizeWeekdays,
  orderedWeekdays,
  type WeekdayStyle,
  weekdayName,
} from './weekdays.ts';

/**
 * WeekdayPicker — a set of days of the week as toggle buttons in one group:
 * a thin adapter over Texuli's `ToggleGroup` (`texuli/toggle`). The group is
 * a single tab stop: arrows (and Home/End) move between days, Space or Enter
 * toggles one. The value is a sorted list of ISO weekdays
 * (1 = Monday … 7 = Sunday). For a single weekday use `Select` with
 * `weekdayOptions()`.
 */
interface Props {
  value?: IsoWeekday[];
  weekStartsOn?: IsoWeekday;
  locale?: string;
  /** Visible label style on each toggle; the accessible name is always the long name. */
  labelStyle?: WeekdayStyle;
  /** Group name for assistive tech. */
  label?: string;
  id?: string;
  name?: string;
  disabled?: boolean;
  'aria-describedby'?: string;
  /** From FormField; treated like `required`. */
  'aria-required'?: boolean | 'true' | 'false';
  'aria-invalid'?: boolean | 'true' | 'false';
  'aria-labelledby'?: string;
  class?: string;
  onValueChange?: (value: IsoWeekday[]) => void;
}

const uid = $props.id();

let {
  value = $bindable([]),
  weekStartsOn = 1,
  locale,
  labelStyle = 'short',
  label = 'Days of the week',
  id = `weekdays-${uid}`,
  name,
  disabled = false,
  'aria-describedby': describedBy,
  // A set of toggles has no required state; FormField's flag is accepted and ignored.
  'aria-required': _ariaRequired,
  'aria-invalid': ariaInvalid,
  'aria-labelledby': labelledBy,
  class: className,
  onValueChange,
}: Props = $props();

const days = $derived(
  orderedWeekdays(weekStartsOn).map((day) => ({
    day,
    text: weekdayName(day, locale, labelStyle),
    long: weekdayName(day, locale, 'long'),
  }))
);
const selected = $derived(normalizeWeekdays(value));
const invalid = $derived(ariaInvalid === true || ariaInvalid === 'true');

function commit(next: string | string[]): void {
  const days = normalizeWeekdays((Array.isArray(next) ? next : [next]).map(Number));
  value = days;
  onValueChange?.(days);
}
</script>

<!-- Texuli's ToggleGroup is the named, described group FormField points at, and submits one entry per day. -->
<ToggleGroup
  type="multiple"
  {id}
  aria-label={labelledBy ? undefined : label}
  aria-labelledby={labelledBy}
  aria-describedby={describedBy}
  {name}
  value={selected.map(String)}
  onValueChange={commit}
  {disabled}
  wrap
  class={cx('ui-weekday-picker', className)}
  data-invalid={invalid ? '' : undefined}
>
  {#each days as entry (entry.day)}
    <ToggleGroupItem value={String(entry.day)} aria-label={entry.long} data-weekday={entry.day}>
      {entry.text}
    </ToggleGroupItem>
  {/each}
</ToggleGroup>

<style>
  :global(.ui-weekday-picker[data-invalid] [aria-pressed='false']) {
    border-color: var(--tx-destructive, crimson);
  }
</style>
