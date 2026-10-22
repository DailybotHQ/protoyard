<script lang="ts">
import { cn } from '../../../lib/cn.ts';
import { fieldClasses } from '../../input/input-classes.ts';
import {
  type DayPeriod,
  formatTimeOfDay,
  fromTwelveHour,
  minuteSteps,
  parseTimeOfDay,
  type TimeFormat,
  type TimeOfDay,
  toTwelveHour,
} from './time.ts';

/**
 * TimeInput — hour, minute and (in the 12-hour format) AM/PM as native selects
 * in one labelled group, so arrows, typing and mobile pickers all work. The
 * value is always 24-hour `HH:mm`, or `null` until hour and minute are chosen.
 * A value off the minute step keeps its minute as an extra option.
 */
interface Props {
  value?: TimeOfDay | null;
  format?: TimeFormat;
  /** Minute step; must divide 60, otherwise 15. */
  intervalMinutes?: number;
  /** Id of the hour select, so a `<label for>` or FormField focuses it. */
  id?: string;
  /** Group name for assistive tech (FormField's label is linked through `aria-labelledby`). */
  label?: string;
  name?: string;
  disabled?: boolean;
  required?: boolean;
  'aria-describedby'?: string;
  /** From FormField; treated like `required`. */
  'aria-required'?: boolean | 'true' | 'false';
  'aria-invalid'?: boolean | 'true' | 'false';
  'aria-labelledby'?: string;
  class?: string;
  onValueChange?: (value: TimeOfDay) => void;
}

const uid = $props.id();

let {
  value = $bindable(null),
  format = 12,
  intervalMinutes = 15,
  id = `time-${uid}`,
  label = 'Time',
  name,
  disabled = false,
  required: requiredProp = false,
  'aria-describedby': describedBy,
  'aria-required': ariaRequired,
  'aria-invalid': ariaInvalid,
  'aria-labelledby': labelledBy,
  class: className,
  onValueChange,
}: Props = $props();

const required = $derived(requiredProp || ariaRequired === true || ariaRequired === 'true');

let hour = $state('');
let minute = $state('');
let period = $state<DayPeriod>('AM');

// Each select reads its own change event (a `bind:value` would update after
// `onchange` runs). Mirror the bound value into the three parts whenever it changes from outside.
$effect(() => {
  const parts = parseTimeOfDay(value);
  if (!parts) {
    hour = '';
    minute = '';
    return;
  }
  if (format === 12) {
    const twelve = toTwelveHour(parts.hour);
    hour = String(twelve.hour);
    period = twelve.period;
  } else {
    hour = String(parts.hour);
  }
  minute = String(parts.minute);
});

const pad = (n: number) => String(n).padStart(2, '0');
const hours = $derived(
  format === 12
    ? Array.from({ length: 12 }, (_, i) => i + 1)
    : Array.from({ length: 24 }, (_, i) => i)
);
const minutes = $derived.by(() => {
  const steps = minuteSteps(intervalMinutes);
  const current = parseTimeOfDay(value)?.minute;
  return current === undefined || steps.includes(current)
    ? steps
    : [...steps, current].sort((a, b) => a - b);
});
const invalid = $derived(ariaInvalid === true || ariaInvalid === 'true');

function commit() {
  if (hour === '' || minute === '') return;
  const h = format === 12 ? fromTwelveHour(Number(hour), period) : Number(hour);
  const next = formatTimeOfDay({ hour: h, minute: Number(minute) });
  if (next === value) return;
  value = next;
  onValueChange?.(next);
}

const selectClasses = cn(
  fieldClasses,
  'h-9 min-h-touch w-auto cursor-pointer px-2 py-1 tabular-nums sm:min-h-0'
);
</script>

<div
  role="group"
  aria-label={labelledBy ? undefined : label}
  aria-labelledby={labelledBy}
  aria-describedby={describedBy}
  class={cn('ui-time-input inline-flex items-center gap-1', className)}
>
  <select
    {id}
    class={selectClasses}
    aria-label="Hour"
    aria-invalid={invalid || undefined}
    aria-describedby={describedBy}
    {disabled}
    {required}
    value={hour}
    onchange={(event) => {
      hour = event.currentTarget.value;
      commit();
    }}
  >
    <option value="" disabled>hh</option>
    {#each hours as h (h)}
      <option value={String(h)}>{pad(h)}</option>
    {/each}
  </select>
  <span class="text-muted-foreground" aria-hidden="true">:</span>
  <select
    id={`${id}-minute`}
    class={selectClasses}
    aria-label="Minute"
    aria-invalid={invalid || undefined}
    {disabled}
    {required}
    value={minute}
    onchange={(event) => {
      minute = event.currentTarget.value;
      commit();
    }}
  >
    <option value="" disabled>mm</option>
    {#each minutes as m (m)}
      <option value={String(m)}>{pad(m)}</option>
    {/each}
  </select>
  {#if format === 12}
    <select
      id={`${id}-period`}
      class={selectClasses}
      aria-label="AM or PM"
      {disabled}
      value={period}
      onchange={(event) => {
        period = event.currentTarget.value === 'PM' ? 'PM' : 'AM';
        commit();
      }}
    >
      <option value="AM">AM</option>
      <option value="PM">PM</option>
    </select>
  {/if}
  {#if name}
    <input type="hidden" {name} value={value ?? ''} />
  {/if}
</div>
