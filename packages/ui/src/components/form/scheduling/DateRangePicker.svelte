<script lang="ts">
import { CalendarDays } from '@lucide/svelte';
import { cn } from '../../../lib/cn.ts';
import { fieldClasses } from '../../input/input-classes.ts';
import Popover from '../../popover/Popover.svelte';
import Calendar from './Calendar.svelte';
import {
  checkDateText,
  DATE_RANGE_MESSAGES,
  type DateRange,
  type DateRangeIssue,
  formatIsoDate,
  type IsoDate,
  isWithinBounds,
  normalizeDateRange,
  validateDateRange,
} from './dates.ts';
import type { IsoWeekday } from './weekdays.ts';

/**
 * DateRangePicker — start and end `YYYY-MM-DD` fields plus a calendar that
 * picks the range in two clicks (the second click before the first swaps the
 * ends). The bound value only changes to a complete, valid range or to an
 * empty one; any other entry is reported inline and leaves the value as it was.
 */
interface Props {
  value?: DateRange;
  min?: IsoDate | null;
  max?: IsoDate | null;
  /** Longest allowed range, inclusive, in days. */
  maxDays?: number;
  required?: boolean;
  isDateDisabled?: (date: IsoDate) => boolean;
  today?: IsoDate | null;
  weekStartsOn?: IsoWeekday;
  locale?: string;
  /** Id of the start field, so a `<label for>` or FormField focuses it. */
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
let startText = $state('');
let endText = $state('');
let issue = $state<DateRangeIssue | null>(null);
let open = $state(false);
let focusDate = $state<IsoDate | null>(null);
/** First click of a calendar pick, waiting for the second. */
let pending = $state<IsoDate | null>(null);
let calendar = $state<ReturnType<typeof Calendar> | null>(null);

$effect(() => {
  startText = value.start ?? '';
  endText = value.end ?? '';
  issue = null;
});

const invalid = $derived(issue !== null || ariaInvalid === true || ariaInvalid === 'true');
const describedByAll = $derived(
  [describedBy, issue ? errorId : null].filter(Boolean).join(' ') || undefined
);
const highlight = $derived<DateRange>(pending ? { start: pending, end: null } : value);
const rules = $derived({ min, max, maxDays, required });

function apply(next: DateRange): boolean {
  const found = validateDateRange(next, rules);
  if (found) {
    issue = found;
    onInvalid?.(found);
    return false;
  }
  issue = null;
  startText = next.start ?? '';
  endText = next.end ?? '';
  if (next.start !== value.start || next.end !== value.end) {
    value = next;
    onValueChange?.(next);
  }
  return true;
}

function commitText() {
  const start = checkDateText(startText, { isDateDisabled });
  const end = checkDateText(endText, { isDateDisabled });
  if (start.issue) {
    issue = 'invalid-start';
    onInvalid?.(issue);
    return;
  }
  if (end.issue) {
    issue = 'invalid-end';
    onInvalid?.(issue);
    return;
  }
  // A half-filled range waits for the other field without nagging.
  if ((start.value === null) !== (end.value === null) && !required) {
    issue = null;
    return;
  }
  apply({ start: start.value, end: end.value });
}

function pick(date: IsoDate) {
  if (!pending) {
    pending = date;
    return;
  }
  const next = normalizeDateRange({ start: pending, end: date });
  pending = null;
  if (apply(next)) open = false;
}

const fieldClass = cn(
  fieldClasses,
  'ui-input flex h-9 min-h-touch px-3 py-1 tabular-nums sm:min-h-0'
);
const summary = $derived(
  value.start && value.end
    ? `${calendarLabel}, ${formatIsoDate(value.start, locale)} to ${formatIsoDate(value.end, locale)}`
    : calendarLabel
);
</script>

<div class={cn('ui-date-range-picker grid gap-1', className)}>
  <div
    role="group"
    aria-label={labelledBy ? undefined : label}
    aria-labelledby={labelledBy}
    class="flex flex-wrap items-center gap-2"
  >
    <input
      {id}
      type="text"
      inputmode="numeric"
      autocomplete="off"
      spellcheck="false"
      maxlength={10}
      placeholder="YYYY-MM-DD"
      class={cn(fieldClass, 'w-36 flex-1')}
      aria-label={startLabel}
      aria-invalid={invalid || undefined}
      aria-describedby={describedByAll}
      {disabled}
      required={required || undefined}
      bind:value={startText}
      onchange={commitText}
    />
    <span class="text-sm text-muted-foreground" aria-hidden="true">–</span>
    <input
      id={`${id}-end`}
      type="text"
      inputmode="numeric"
      autocomplete="off"
      spellcheck="false"
      maxlength={10}
      placeholder="YYYY-MM-DD"
      class={cn(fieldClass, 'w-36 flex-1')}
      aria-label={endLabel}
      aria-invalid={invalid || undefined}
      aria-describedby={describedByAll}
      {disabled}
      required={required || undefined}
      bind:value={endText}
      onchange={commitText}
    />
    <Popover
      bind:open
      align="end"
      class="w-auto p-3"
      onOpenChange={(isOpen) => {
        pending = null;
        if (isOpen) focusDate = value.start;
      }}
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        void calendar?.focus();
      }}
    >
      {#snippet trigger({ props })}
        <button
          {...props}
          type="button"
          {disabled}
          aria-label={summary}
          class="flex size-9 min-h-touch min-w-[44px] items-center justify-center rounded-md border border-input bg-surface text-muted-foreground shadow-soft outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-0 sm:min-w-0"
        >
          <CalendarDays class="size-4" aria-hidden="true" />
        </button>
      {/snippet}
      <Calendar
        bind:this={calendar}
        bind:focusDate
        range={highlight}
        {today}
        {min}
        {max}
        isDateDisabled={(date) =>
          Boolean(isDateDisabled?.(date)) || !isWithinBounds(date, { min, max })}
        {weekStartsOn}
        {locale}
        label={calendarLabel}
        onselect={pick}
      />
      <p class="mt-2 text-xs text-muted-foreground" aria-live="polite">
        {pending ? `Start ${pending}. Now choose the end date.` : 'Choose the start date.'}
      </p>
    </Popover>
  </div>
  {#if issue}
    <p id={errorId} class="text-xs font-medium text-destructive">{DATE_RANGE_MESSAGES[issue]}</p>
  {/if}
  {#if name}
    <input type="hidden" name={`${name}.start`} value={value.start ?? ''} />
    <input type="hidden" name={`${name}.end`} value={value.end ?? ''} />
  {/if}
</div>
