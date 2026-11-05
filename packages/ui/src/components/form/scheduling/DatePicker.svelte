<script lang="ts">
import type { DateInvalidReason } from '@texuli/primitives/date-picker';
import type { HTMLAttributes } from 'svelte/elements';
import { DatePicker as TexuliDatePicker } from 'texuli/date';
import { useMessages } from 'texuli/i18n';
import { cn } from '../../../lib/cn.ts';
import { chainHandlers, composeHandlers } from '../../../lib/handlers.ts';
import { checkDateText, type DateInputIssue, dateInputMessage, type IsoDate } from './dates.ts';
import { segmentsEmpty, texuliUnavailable, texuliWeekStart, typedIsoText } from './texuli-date.ts';
import type { IsoWeekday } from './weekdays.ts';

/**
 * DatePicker — Texuli's styled `texuli/date` `DatePicker`: a segmented date
 * field (month, day, year in the locale's order), a calendar button and a
 * calendar dialog. `id` lands on the first segment and
 * `aria-describedby`/`aria-invalid` on every segment, so it sits inside
 * FormField like any input; inside a FormField (Texuli's `Field`) the Field
 * label names the group through Texuli's label context (G91). The `ui-input`
 * hook (filled and underline input styles) goes on the bordered control
 * through `controlClass` (G89).
 *
 * Typed dates are checked when the field is left (blur or Enter): an
 * impossible date, one outside `min`/`max`, or one `isDateDisabled` rejects
 * is reported inline and the bound value is left unchanged. A calendar pick
 * commits at once. Clearing every segment sets `null`.
 */
interface OwnProps {
  value?: IsoDate | null;
  min?: IsoDate | null;
  max?: IsoDate | null;
  isDateDisabled?: (date: IsoDate) => boolean;
  /** Today's date for the calendar marker; pass the scenario clock's date (the clock is then never read). */
  today?: IsoDate | null;
  weekStartsOn?: IsoWeekday;
  locale?: string;
  /** Id of the first date segment, so a `<label for>` or FormField reaches the focusable control. */
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
  /** The rendered root element (bindable). */
  ref?: HTMLElement | null;
}

/**
 * Extra attributes (`data-*`, handlers…) land on the segmented date group, the
 * control inside the root. A caller `onfocusout` or `onkeydown` runs first;
 * the field's own commit on leaving always runs, and its Enter and Alt+Down
 * handling is skipped only when the caller calls `preventDefault()`.
 */
type Props = OwnProps & Omit<HTMLAttributes<HTMLDivElement>, keyof OwnProps | 'children'>;

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
  calendarLabel: calendarLabelProp,
  'aria-describedby': describedBy,
  'aria-required': ariaRequired,
  'aria-invalid': ariaInvalid,
  'aria-label': ariaLabel,
  'aria-labelledby': labelledBy,
  class: className,
  onValueChange,
  onInvalid,
  ref = $bindable(null),
  onfocusout: callerFocusOut,
  onkeydown: callerKeyDown,
  ...rest
}: Props = $props();

// Labels resolve through Texuli's dictionary (mountPrototype({ i18n })); props still win.
const messages = useMessages();
const calendarLabel = $derived(
  calendarLabelProp ?? messages('protoyard.ui.date-picker.calendar-label', 'Choose a date')
);

const required = $derived(requiredProp || ariaRequired === true || ariaRequired === 'true');

/** What the field shows; it only becomes `value` once committed. */
let draft = $state<IsoDate | null>(null);
let issue = $state<DateInputIssue | null>(null);
/** A refusal Texuli reported while typing, reported again when the field is left. */
let typed = $state<{ issue: DateInputIssue; text: string } | null>(null);
let open = $state(false);

// An outside change (a reset, a scenario load) replaces the field and clears the issue.
$effect(() => {
  draft = value;
  issue = null;
  typed = null;
});

// Texuli marks the field invalid from its `error` text or from `aria-invalid`
// (a FormField error, G90); a refused typed date marks it before it is left.
const invalid = $derived(typed !== null || ariaInvalid === true || ariaInvalid === 'true');
const message = $derived(issue ? dateInputMessage(issue, { min, max }) : undefined);

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
  if (segmentsEmpty(ref)) {
    set(null);
    return;
  }
  if (typed) {
    report(typed.issue, typed.text);
    return;
  }
  // Some segments are filled but Texuli reports no date: a missing segment
  // or a year under four digits.
  if (draft === null) {
    report('format', '');
    return;
  }
  // Leaving an untouched field (or opening the calendar) commits nothing.
  if (draft === value) return;
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

<TexuliDatePicker
  {...rest}
  bind:ref
  bind:value={draft}
  bind:open
  label={ariaLabel ?? 'Date'}
  hideLabel
  {id}
  class={cn('ui-date-picker', className)}
  controlClass="ui-input"
  {...locale ? { locale } : {}}
  {...min ? { minValue: min } : {}}
  {...max ? { maxValue: max } : {}}
  {...isDateDisabled ? { isDateUnavailable: texuliUnavailable(isDateDisabled) } : {}}
  {...today ? { today } : {}}
  weekStartsOn={texuliWeekStart(weekStartsOn)}
  {disabled}
  {required}
  {...name ? { name } : {}}
  {...message ? { error: message } : {}}
  labels={{
    trigger: calendarLabel,
    triggerWithValue: `${calendarLabel}, {date}`,
    dialog: calendarLabel,
  }}
  aria-labelledby={labelledBy}
  aria-describedby={describedBy}
  aria-invalid={invalid ? 'true' : undefined}
  onInvalid={typedInvalid}
  onValueChange={(next: IsoDate | null) => {
    if (next !== null) typed = null;
    // A calendar pick (the dialog is open) commits at once; typing waits for blur or Enter.
    if (open) set(next);
  }}
  onfocusout={chainHandlers(callerFocusOut, (event: FocusEvent & { currentTarget: HTMLElement }) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) commit();
  })}
  onkeydown={composeHandlers(callerKeyDown, (event: KeyboardEvent) => {
    if (event.key === 'Enter') commit();
    if (event.key === 'ArrowDown' && event.altKey) {
      event.preventDefault();
      open = true;
    }
  })}
/>
