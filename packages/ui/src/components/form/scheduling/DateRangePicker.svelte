<script lang="ts">
import { CalendarDays } from '@lucide/svelte';
import { type DateInvalidReason, DateRangePicker as Picker } from '@texuli/primitives/date-picker';
import { dateCalendarClass, dateFieldClass } from 'texuli/date';
import { Icon } from 'texuli/icons';
import { cn } from '../../../lib/cn.ts';
import {
  DATE_RANGE_MESSAGES,
  type DateRange,
  type DateRangeIssue,
  type IsoDate,
  validateDateRange,
} from './dates.ts';
import {
  segmentsEmpty,
  segmentsPartial,
  texuliUnavailable,
  texuliWeekStart,
  typedIsoText,
} from './texuli-date.ts';
import type { IsoWeekday } from './weekdays.ts';

/**
 * DateRangePicker — Texuli's date range picker
 * (`@texuli/primitives/date-picker`, styled with the `texuli/date` recipes):
 * segmented start and end fields, a calendar button, and a range calendar
 * that picks the range in two clicks (a second click before the first swaps
 * the ends; a range over `maxDays` is refused and announced). It composes the
 * parts so it can sit inside FormField.
 *
 * The bound value only changes to a complete, valid range or to an empty
 * one; any other entry is reported inline (when the fields are left, or at
 * once for a calendar pick) and leaves the value as it was.
 */
interface Props {
  value?: DateRange;
  min?: IsoDate | null;
  max?: IsoDate | null;
  /** Longest allowed range, inclusive, in days. */
  maxDays?: number;
  required?: boolean;
  isDateDisabled?: (date: IsoDate) => boolean;
  /** Today's date for the calendar marker; pass the scenario clock's date (the clock is then never read). */
  today?: IsoDate | null;
  weekStartsOn?: IsoWeekday;
  locale?: string;
  /** Id of the field group, so a `<label for>` or FormField points at it. */
  id?: string;
  name?: string;
  disabled?: boolean;
  /** Group name for assistive tech. */
  label?: string;
  startLabel?: string;
  endLabel?: string;
  calendarLabel?: string;
  'aria-describedby'?: string;
  /** From FormField; treated like `required`. */
  'aria-required'?: boolean | 'true' | 'false';
  'aria-invalid'?: boolean | 'true' | 'false';
  'aria-labelledby'?: string;
  class?: string;
  onValueChange?: (value: DateRange) => void;
  onInvalid?: (issue: DateRangeIssue) => void;
}

const uid = $props.id();

let {
  value = $bindable({ start: null, end: null }),
  min = null,
  max = null,
  maxDays,
  required: requiredProp = false,
  isDateDisabled,
  today = null,
  weekStartsOn = 1,
  locale,
  id = `date-range-${uid}`,
  name,
  disabled = false,
  label = 'Date range',
  startLabel = 'Start date',
  endLabel = 'End date',
  calendarLabel = 'Choose a date range',
  'aria-describedby': describedBy,
  'aria-required': ariaRequired,
  'aria-invalid': ariaInvalid,
  'aria-labelledby': labelledBy,
  class: className,
  onValueChange,
  onInvalid,
}: Props = $props();

const required = $derived(requiredProp || ariaRequired === true || ariaRequired === 'true');

const errorId = $derived(`${id}-issue`);
/** What the fields show; it only becomes `value` once complete and valid. */
let draft = $state<DateRange>({ start: null, end: null });
let issue = $state<DateRangeIssue | null>(null);
/** A refusal Texuli reported while typing, reported when the fields are left. */
let typed = $state<DateRangeIssue | null>(null);
let open = $state(false);
/** A first calendar pick is waiting for the second. */
let picking = $state(false);
let control = $state<HTMLDivElement | null>(null);
/** The date field (start or end) the last keystroke went to. */
let typingIn: 'start' | 'end' = 'start';

$effect(() => {
  draft = { start: value.start, end: value.end };
  issue = null;
  typed = null;
});

// Closing the dialog with half a pick restores the committed range.
$effect(() => {
  if (open || !picking) return;
  picking = false;
  draft = { start: value.start, end: value.end };
});

const invalid = $derived(
  issue !== null || typed !== null || ariaInvalid === true || ariaInvalid === 'true'
);
const describedByAll = $derived(
  [describedBy, issue ? errorId : null].filter(Boolean).join(' ') || undefined
);
const rules = $derived({ min, max, maxDays, required });

function fields(): [Element | null, Element | null] {
  const all = control?.querySelectorAll('[data-tx-date-field-root]') ?? [];
  return [all[0] ?? null, all[1] ?? null];
}

function report(found: DateRangeIssue) {
  issue = found;
  onInvalid?.(found);
}

function apply(next: DateRange): boolean {
  const found = validateDateRange(next, rules);
  if (found) {
    report(found);
    return false;
  }
  issue = null;
  typed = null;
  draft = { start: next.start, end: next.end };
  if (next.start !== value.start || next.end !== value.end) {
    value = next;
    onValueChange?.(next);
  }
  return true;
}

function commit() {
  if (typed) {
    report(typed);
    return;
  }
  const [startField, endField] = fields();
  if (segmentsPartial(startField)) return report('invalid-start');
  if (segmentsPartial(endField)) return report('invalid-end');
  const next: DateRange = {
    start: segmentsEmpty(startField) ? null : draft.start,
    end: segmentsEmpty(endField) ? null : draft.end,
  };
  if (next.start === value.start && next.end === value.end) return;
  // A half-filled range waits for the other field without nagging.
  if ((next.start === null) !== (next.end === null) && !required) {
    issue = null;
    return;
  }
  apply(next);
}

function texuliInvalid(text: string, reason: DateInvalidReason) {
  let found: DateRangeIssue;
  if (reason === 'too-long') found = 'too-long';
  else if (reason === 'invalid') found = typingIn === 'start' ? 'invalid-start' : 'invalid-end';
  else {
    // Out of range: past the other end, or outside min/max.
    const iso = typedIsoText(text, locale);
    const reversed =
      iso !== null &&
      (typingIn === 'start'
        ? draft.end !== null && iso > draft.end
        : draft.start !== null && iso < draft.start);
    found = reversed ? 'end-before-start' : 'out-of-bounds';
  }
  // A refused calendar pick is reported at once; typing waits for blur or Enter.
  if (open) report(found);
  else typed = found;
}

const hint = $derived(
  picking && draft.start
    ? `Start ${draft.start}. Now choose the end date.`
    : 'Choose the start date.'
);
</script>

<div
  class={cn(dateFieldClass(), 'tx-date--range ui-date-range-picker', className)}
  data-tx-date
  data-invalid={invalid ? 'true' : undefined}
  data-disabled={disabled ? 'true' : undefined}
>
  <Picker.Root
    bind:value={draft}
    bind:open
    {...locale ? { locale } : {}}
    {...min ? { minValue: min } : {}}
    {...max ? { maxValue: max } : {}}
    {...isDateDisabled ? { isDateUnavailable: texuliUnavailable(isDateDisabled) } : {}}
    {...today ? { today } : {}}
    weekStartsOn={texuliWeekStart(weekStartsOn)}
    {...maxDays !== undefined ? { maxDays } : {}}
    {disabled}
    labels={{
      trigger: calendarLabel,
      triggerWithValue: `${calendarLabel}, {date}`,
      dialog: calendarLabel,
      start: startLabel,
      end: endLabel,
    }}
    onInvalid={texuliInvalid}
    onValueChange={(next) => {
      if (!open) {
        if (next.start !== null && next.end !== null) typed = null;
        return;
      }
      // Calendar picks: the first sets the start, the second completes the range.
      if (next.end === null) {
        picking = true;
        return;
      }
      picking = false;
      apply(next);
    }}
  >
    <div bind:this={control} class="tx-date__control ui-input">
      <Picker.Field
        class="tx-date__field"
        {id}
        {label}
        aria-labelledby={labelledBy}
        aria-describedby={describedByAll}
        aria-invalid={invalid || undefined}
        {...name ? { startName: `${name}.start`, endName: `${name}.end` } : {}}
        oninputcapture={(event) => {
          const [startField] = fields();
          typingIn = startField?.contains(event.target as Node) ? 'start' : 'end';
        }}
        onfocusout={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) commit();
        }}
        onkeydown={(event) => {
          if (event.key === 'Enter') commit();
        }}
      />
      <Picker.Trigger class="tx-date__trigger">
        <Icon icon={CalendarDays} size="sm" aria-hidden="true" />
      </Picker.Trigger>
    </div>
    <Picker.Content class="tx-date__panel">
      <Picker.Calendar class={dateCalendarClass()} />
      <p class="tx-date__description" aria-live="polite">{hint}</p>
    </Picker.Content>
  </Picker.Root>
  {#if issue}
    <p id={errorId} class="tx-date__error">{DATE_RANGE_MESSAGES[issue]}</p>
  {/if}
</div>
