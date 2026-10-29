<script lang="ts">
import { CalendarDays } from '@lucide/svelte';
import { type DateInvalidReason, DatePicker as Picker } from '@texuli/primitives/date-picker';
import { dateCalendarClass, dateFieldClass } from 'texuli/date';
import { Icon } from 'texuli/icons';
import { cn } from '../../../lib/cn.ts';
import { checkDateText, type DateInputIssue, dateInputMessage, type IsoDate } from './dates.ts';
import {
  labelTextFor,
  segmentsEmpty,
  segmentsPartial,
  texuliUnavailable,
  texuliWeekStart,
  typedIsoText,
} from './texuli-date.ts';
import type { IsoWeekday } from './weekdays.ts';

/**
 * DatePicker — Texuli's date picker (`@texuli/primitives/date-picker`, styled
 * with the `texuli/date` recipes): a segmented date field (month, day, year in
 * the locale's order), a calendar button and a calendar dialog. It composes
 * the parts instead of the styled `DatePicker` so it can sit inside FormField
 * (`id`, `aria-describedby`, `aria-invalid`, no second visible label).
 *
 * Typed dates are checked when the field is left (blur or Enter): an
 * impossible date, one outside `min`/`max`, or one `isDateDisabled` rejects
 * is reported inline and the bound value is left unchanged. A calendar pick
 * commits at once. Clearing every segment sets `null`.
 */
interface Props {
  value?: IsoDate | null;
  min?: IsoDate | null;
  max?: IsoDate | null;
  isDateDisabled?: (date: IsoDate) => boolean;
  /** Today's date for the calendar marker; pass the scenario clock's date (the clock is then never read). */
  today?: IsoDate | null;
  weekStartsOn?: IsoWeekday;
  locale?: string;
  /** Id of the field group, so a FormField `<label for>` names it. */
  id?: string;
  name?: string;
  /** Kept for compatibility: the segmented field shows no placeholder. */
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  /** Accessible name of the calendar button and dialog. */
  calendarLabel?: string;
  'aria-describedby'?: string;
  /** From FormField; treated like `required`. */
  'aria-required'?: boolean | 'true' | 'false';
  'aria-invalid'?: boolean | 'true' | 'false';
  'aria-label'?: string;
  'aria-labelledby'?: string;
  class?: string;
  onValueChange?: (value: IsoDate | null) => void;
  /** Called when typed text is rejected (`text` as `YYYY-MM-DD`). */
  onInvalid?: (issue: DateInputIssue, text: string) => void;
}

const uid = $props.id();

let {
  value = $bindable(null),
  min = null,
  max = null,
  isDateDisabled,
  today = null,
  weekStartsOn = 1,
  locale,
  id = `date-${uid}`,
  name,
  placeholder: _placeholder,
  disabled = false,
  required: requiredProp = false,
  calendarLabel = 'Choose a date',
  'aria-describedby': describedBy,
  'aria-required': ariaRequired,
  'aria-invalid': ariaInvalid,
  'aria-label': ariaLabel,
  'aria-labelledby': labelledBy,
  class: className,
  onValueChange,
  onInvalid,
}: Props = $props();

const required = $derived(requiredProp || ariaRequired === true || ariaRequired === 'true');

const errorId = $derived(`${id}-issue`);
/** What the field shows; it only becomes `value` once committed. */
let draft = $state<IsoDate | null>(null);
let issue = $state<DateInputIssue | null>(null);
/** A refusal Texuli reported while typing, reported again when the field is left. */
let typed = $state<{ issue: DateInputIssue; text: string } | null>(null);
let open = $state(false);
let control = $state<HTMLDivElement | null>(null);
let labelText = $state<string | undefined>(undefined);

// An outside change (a reset, a scenario load) replaces the field and clears the issue.
$effect(() => {
  draft = value;
  issue = null;
  typed = null;
});

// A FormField `<label for={id}>` cannot name a group: the group takes its text.
$effect(() => {
  labelText = labelTextFor(control, id);
});

const invalid = $derived(
  issue !== null || typed !== null || ariaInvalid === true || ariaInvalid === 'true'
);
const describedByAll = $derived(
  [describedBy, issue ? errorId : null].filter(Boolean).join(' ') || undefined
);
const groupLabel = $derived(ariaLabel ?? labelText ?? 'Date');

function set(next: IsoDate | null) {
  issue = null;
  typed = null;
  draft = next;
  if (next === value) return;
  value = next;
  onValueChange?.(next);
}

function report(found: DateInputIssue, text: string) {
  issue = found;
  onInvalid?.(found, text);
}

function commit() {
  if (segmentsEmpty(control)) {
    set(null);
    return;
  }
  if (typed) {
    report(typed.issue, typed.text);
    return;
  }
  const partial = segmentsPartial(control);
  // Leaving an untouched field (or opening the calendar) commits nothing.
  if (draft === value && !partial) return;
  if (draft === null || partial) {
    report('format', draft ?? '');
    return;
  }
  const result = checkDateText(draft, { min, max, isDateDisabled });
  if (result.issue) report(result.issue, draft);
  else set(result.value);
}

function typedInvalid(text: string, reason: DateInvalidReason) {
  const iso = typedIsoText(text, locale) ?? text;
  const found: DateInputIssue =
    reason === 'out-of-range' ? (min && iso < min ? 'before-min' : 'after-max') : 'format';
  typed = { issue: found, text: iso };
}
</script>

<div
  class={cn(dateFieldClass(), 'ui-date-picker', className)}
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
    {disabled}
    labels={{
      trigger: calendarLabel,
      triggerWithValue: `${calendarLabel}, {date}`,
      dialog: calendarLabel,
    }}
    onInvalid={typedInvalid}
    onValueChange={(next) => {
      if (next !== null) typed = null;
      // A calendar pick (the dialog is open) commits at once; typing waits for blur or Enter.
      if (open) set(next);
    }}
  >
    <div bind:this={control} class="tx-date__control ui-input">
      <Picker.Field
        class="tx-date__field"
        {id}
        label={groupLabel}
        aria-labelledby={labelledBy}
        aria-describedby={describedByAll}
        aria-invalid={invalid || undefined}
        {...name ? { name } : {}}
        {required}
        onfocusout={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) commit();
        }}
        onkeydown={(event) => {
          if (event.key === 'Enter') commit();
          if (event.key === 'ArrowDown' && event.altKey) {
            event.preventDefault();
            open = true;
          }
        }}
      />
      <Picker.Trigger class="tx-date__trigger">
        <Icon icon={CalendarDays} size="sm" aria-hidden="true" />
      </Picker.Trigger>
    </div>
    <Picker.Content class="tx-date__panel">
      <Picker.Calendar class={dateCalendarClass()} />
    </Picker.Content>
  </Picker.Root>
  {#if issue}
    <p id={errorId} class="tx-date__error">{dateInputMessage(issue, { min, max })}</p>
  {/if}
</div>
