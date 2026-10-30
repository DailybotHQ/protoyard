<script lang="ts">
import { TimeField } from '@texuli/primitives/date-field';
import { dateFieldClass } from 'texuli/date';
import { cn } from '../../../lib/cn.ts';
import { groupLabelFor } from './texuli-date.ts';
import { isTimeOfDay, minuteSteps, type TimeFormat, type TimeOfDay } from './time.ts';

/**
 * TimeInput — Texuli's time field (`@texuli/primitives/date-field`
 * `TimeField`, styled with the `texuli/date` recipe): hour and minute
 * spinbuttons and, in the 12-hour format, an AM/PM select, in one labelled
 * group. ArrowUp/ArrowDown spin a segment (the minute by `intervalMinutes`),
 * Home/End jump to the ends, digits type a value. `id` lands on the first
 * segment and `aria-describedby`/`aria-invalid` on every segment, so it sits
 * inside FormField like any input; the FormField label names the group.
 *
 * It composes the primitive rather than the styled `texuli/date` `TimeField`
 * only because that one marks its bordered control invalid from its own
 * `error` text, not from a FormField's `aria-invalid`.
 *
 * The value is always 24-hour `HH:mm`, or `null` until hour and minute are
 * chosen; an incomplete entry leaves the value as it was. A value off the
 * minute step shows its own minute.
 */
interface Props {
  value?: TimeOfDay | null;
  format?: TimeFormat;
  /** Minute step of the arrow keys; must divide 60, otherwise 15. */
  intervalMinutes?: number;
  /** Id of the first segment, so a `<label for>` or FormField reaches the focusable control. */
  id?: string;
  /** Group name for assistive tech (inside FormField, the FormField label names the group). */
  label?: string;
  name?: string;
  disabled?: boolean;
  required?: boolean;
  /** Segment order and digits; `en-US` (hh:mm AM/PM) by default. */
  locale?: string;
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
  locale = 'en-US',
  'aria-describedby': describedBy,
  'aria-required': ariaRequired,
  'aria-invalid': ariaInvalid,
  'aria-labelledby': labelledBy,
  class: className,
  onValueChange,
}: Props = $props();

const required = $derived(requiredProp || ariaRequired === true || ariaRequired === 'true');
const invalid = $derived(ariaInvalid === true || ariaInvalid === 'true');
/** `minuteSteps` falls back to 15 when the interval does not divide 60. */
const minuteStep = $derived(minuteSteps(intervalMinutes)[1] ?? 60);

let control = $state<HTMLDivElement | null>(null);
let fieldLabelId = $state<string | undefined>(undefined);
// FormField's `<label for={id}>` names the first segment; it names the group too.
$effect(() => {
  fieldLabelId = groupLabelFor(control, id).id;
});

/** What the field shows; an incomplete entry never reaches `value`. */
let draft = $state<TimeOfDay | null>(null);
$effect(() => {
  draft = value;
});

function change(next: string | null) {
  if (!isTimeOfDay(next) || next === value) return;
  value = next;
  onValueChange?.(next);
}
</script>

<div
  class={cn(dateFieldClass(), 'tx-date--time ui-time-input', className)}
  data-tx-time
  data-invalid={invalid ? 'true' : undefined}
  data-disabled={disabled ? 'true' : undefined}
>
  <div bind:this={control} class="tx-date__control">
    <TimeField.Root
      class="tx-date__field"
      bind:value={draft}
      inputId={id}
      {label}
      {locale}
      hourCycle={format}
      {minuteStep}
      {disabled}
      {required}
      {...name ? { name } : {}}
      aria-labelledby={labelledBy ?? fieldLabelId}
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      onValueChange={change}
    />
  </div>
</div>
