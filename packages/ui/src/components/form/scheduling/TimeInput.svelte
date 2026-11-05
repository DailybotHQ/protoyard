<script lang="ts">
import type { HTMLAttributes } from 'svelte/elements';
import { TimeField } from 'texuli/date';
import { useMessages } from 'texuli/i18n';
import { cn } from '../../../lib/cn.ts';
import { isTimeOfDay, minuteSteps, type TimeFormat, type TimeOfDay } from './time.ts';

/**
 * TimeInput — Texuli's styled `texuli/date` `TimeField`: hour and minute
 * spinbuttons and, in the 12-hour format, an AM/PM select, in one labelled
 * group. ArrowUp/ArrowDown spin a segment (the minute by `intervalMinutes`),
 * Home/End jump to the ends, digits type a value. `id` lands on the first
 * segment and `aria-describedby`/`aria-invalid` on every segment, so it sits
 * inside FormField like any input: the FormField (Texuli `Field`) label names
 * the group (G91) and its error marks the control invalid (G90).
 *
 * The value is always 24-hour `HH:mm`, or `null` until hour and minute are
 * chosen; an incomplete entry leaves the value as it was. A value off the
 * minute step shows its own minute.
 */
interface OwnProps {
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
  /** The rendered root element (bindable). */
  ref?: HTMLElement | null;
}

/**
 * Extra attributes (`data-*`, `aria-label`, handlers…) land on the time group,
 * the control inside the root.
 */
type Props = OwnProps & Omit<HTMLAttributes<HTMLDivElement>, keyof OwnProps | 'children'>;

const uid = $props.id();

let {
  value = $bindable(null),
  format = 12,
  intervalMinutes = 15,
  id = `time-${uid}`,
  label: labelProp,
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
  ref = $bindable(null),
  ...rest
}: Props = $props();

// Labels resolve through Texuli's dictionary (mountPrototype({ i18n })); props still win.
const messages = useMessages();
const label = $derived(labelProp ?? messages('protoyard.ui.time-input.label', 'Time'));

const required = $derived(requiredProp || ariaRequired === true || ariaRequired === 'true');
const invalid = $derived(ariaInvalid === true || ariaInvalid === 'true');
/** `minuteSteps` falls back to 15 when the interval does not divide 60. */
const minuteStep = $derived(minuteSteps(intervalMinutes)[1] ?? 60);

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

<TimeField
  {...rest}
  bind:ref
  bind:value={draft}
  class={cn('ui-time-input', className)}
  {id}
  {label}
  hideLabel
  {locale}
  hourCycle={format}
  {minuteStep}
  {disabled}
  {required}
  {...name ? { name } : {}}
  aria-labelledby={labelledBy}
  aria-describedby={describedBy}
  aria-invalid={invalid ? 'true' : undefined}
  onValueChange={change}
/>
