<script lang="ts">
import { CalendarDays } from '@lucide/svelte';
import {
  type DateInvalidDetail,
  type DateInvalidReason,
  DateRangePicker as Picker,
} from '@texuli/primitives/date-picker';
import type { HTMLAttributes } from 'svelte/elements';
import { dateCalendarClass, dateFieldClass } from 'texuli/date';
import { Icon } from 'texuli/icons';
import { cn } from '../../../lib/cn.ts';
import { chainHandlers, composeHandlers } from '../../../lib/handlers.ts';
import {
  DATE_RANGE_MESSAGES,
  type DateRange,
  type DateRangeIssue,
  type IsoDate,
  validateDateRange,
} from './dates.ts';
import {
  groupLabelFor,
  segmentsEmpty,
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
 * the ends; a range over `maxDays` is refused and announced). `id` lands on
 * the start date's first segment, `aria-describedby`/`aria-invalid` on every
 * segment and `required` on both dates, so it sits inside FormField. It
 * composes the parts rather than the styled `texuli/date` `DateRangePicker`
 * only for the `ui-input` hook on the bordered control (see DatePicker; Texuli
 * gap G89).
 *
 * The bound value only changes to a complete, valid range or to an empty
 * one; any other entry is reported inline (when the fields are left, or at
 * once for a calendar pick) and leaves the value as it was.
 */
interface OwnProps {
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
  /** Id of the start date's first segment, so a `<label for>` or FormField reaches the focusable control. */
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
  /** The rendered root element (bindable). */
  ref?: HTMLElement | null;
}

/**
 * Extra attributes (`data-*`, `aria-label`, handlers…) land on the group of
 * the two date fields, the control inside the root. A caller `onfocusout` or
 * `onkeydown` runs first; the fields' own commit on leaving always runs, and
 * their Enter commit is skipped only when the caller calls `preventDefault()`.
 */
type Props = OwnProps & Omit<HTMLAttributes<HTMLDivElement>, keyof OwnProps | 'children'>;

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
  ref = $bindable(null),
  onfocusout: callerFocusOut,
  onkeydown: callerKeyDown,
  ...rest
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
let fieldLabelId = $state<string | undefined>(undefined);

$effect(() => {
  draft = { start: value.start, end: value.end };
  issue = null;
  typed = null;
});

// FormField's `<label for={id}>` names the start's first segment; it names the group too.
$effect(() => {
  fieldLabelId = groupLabelFor(control, id).id;
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
  const startEmpty = segmentsEmpty(startField);
  const endEmpty = segmentsEmpty(endField);
  // Filled segments with no date: a missing segment or a year under four digits.
  if (!startEmpty && draft.start === null) return report('invalid-start');
  if (!endEmpty && draft.end === null) return report('invalid-end');
  const next: DateRange = {
    start: startEmpty ? null : draft.start,
    end: endEmpty ? null : draft.end,
  };
  if (next.start === value.start && next.end === value.end) return;
  // A half-filled range waits for the other field without nagging.
  if ((next.start === null) !== (next.end === null) && !required) {
    issue = null;
    return;
  }
  apply(next);
}

function texuliInvalid(text: string, reason: DateInvalidReason, detail?: DateInvalidDetail) {
  const side = detail?.side ?? 'start';
  let found: DateRangeIssue;
  if (reason === 'too-long') found = 'too-long';
  else if (reason === 'invalid') found = side === 'start' ? 'invalid-start' : 'invalid-end';
  else {
    // Out of range: past the other end, or outside min/max.
    const iso = typedIsoText(text, locale);
    const reversed =
      iso !== null &&
      (side === 'start'
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
  bind:this={ref}
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
        {...rest}
        class="tx-date__field"
        inputId={id}
        {label}
        aria-labelledby={labelledBy ?? fieldLabelId}
        aria-describedby={describedByAll}
        aria-invalid={invalid || undefined}
        {...name ? { startName: `${name}.start`, endName: `${name}.end` } : {}}
        {required}
        onfocusout={chainHandlers(callerFocusOut, (event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) commit();
        })}
        onkeydown={composeHandlers(callerKeyDown, (event) => {
          if (event.key === 'Enter') commit();
        })}
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
