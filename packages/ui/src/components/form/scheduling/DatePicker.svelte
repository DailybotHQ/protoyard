<script lang="ts">
import { CalendarDays } from '@lucide/svelte';
import { cn } from '../../../lib/cn.ts';
import { fieldClasses } from '../../input/input-classes.ts';
import Popover from '../../popover/Popover.svelte';
import Calendar from './Calendar.svelte';
import {
  checkDateText,
  type DateInputIssue,
  dateInputMessage,
  formatIsoDate,
  type IsoDate,
} from './dates.ts';
import type { IsoWeekday } from './weekdays.ts';

/**
 * DatePicker — a `YYYY-MM-DD` text field plus a calendar popover. Typed text
 * is checked when the field changes (blur or Enter): an impossible date, one
 * outside `min`/`max`, or one `isDateDisabled` rejects is reported inline and
 * the bound value is left unchanged. Clearing the field sets `null`.
 */
interface Props {
  value?: IsoDate | null;
  min?: IsoDate | null;
  max?: IsoDate | null;
  isDateDisabled?: (date: IsoDate) => boolean;
  /** Today's date for the calendar marker; pass the scenario clock's date. */
  today?: IsoDate | null;
  weekStartsOn?: IsoWeekday;
  locale?: string;
  id?: string;
  name?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  /** Accessible name of the calendar button and grid. */
  calendarLabel?: string;
  'aria-describedby'?: string;
  /** From FormField; treated like `required`. */
  'aria-required'?: boolean | 'true' | 'false';
  'aria-invalid'?: boolean | 'true' | 'false';
  'aria-label'?: string;
  class?: string;
  onValueChange?: (value: IsoDate | null) => void;
  /** Called when typed text is rejected. */
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
  placeholder = 'YYYY-MM-DD',
  disabled = false,
  required: requiredProp = false,
  calendarLabel = 'Choose a date',
  'aria-describedby': describedBy,
  'aria-required': ariaRequired,
  'aria-invalid': ariaInvalid,
  'aria-label': ariaLabel,
  class: className,
  onValueChange,
  onInvalid,
}: Props = $props();

const required = $derived(requiredProp || ariaRequired === true || ariaRequired === 'true');

const errorId = $derived(`${id}-issue`);
let text = $state('');
let issue = $state<DateInputIssue | null>(null);
let open = $state(false);
let focusDate = $state<IsoDate | null>(null);
let calendar = $state<ReturnType<typeof Calendar> | null>(null);

// An outside change (a reset, a scenario load) replaces the text and clears the issue.
$effect(() => {
  text = value ?? '';
  issue = null;
});

const invalid = $derived(issue !== null || ariaInvalid === true || ariaInvalid === 'true');
const describedByAll = $derived(
  [describedBy, issue ? errorId : null].filter(Boolean).join(' ') || undefined
);

function set(next: IsoDate | null) {
  issue = null;
  text = next ?? '';
  if (next === value) return;
  value = next;
  onValueChange?.(next);
}

function commitText() {
  const result = checkDateText(text, { min, max, isDateDisabled });
  if (result.issue) {
    issue = result.issue;
    onInvalid?.(result.issue, text);
    return;
  }
  set(result.value);
}
</script>

<div class={cn('ui-date-picker grid gap-1', className)}>
  <div class="relative">
    <input
      {id}
      type="text"
      inputmode="numeric"
      autocomplete="off"
      spellcheck="false"
      maxlength={10}
      class={cn(fieldClasses, 'ui-input flex h-9 min-h-touch px-3 py-1 pr-11 tabular-nums sm:min-h-0')}
      {placeholder}
      {disabled}
      {required}
      aria-label={ariaLabel}
      aria-invalid={invalid || undefined}
      aria-describedby={describedByAll}
      bind:value={text}
      onchange={commitText}
      onkeydown={(event) => {
        if (event.key === 'ArrowDown' && event.altKey) {
          event.preventDefault();
          open = true;
        }
      }}
    />
    <Popover
      bind:open
      align="end"
      class="w-auto p-3"
      onOpenChange={(isOpen) => {
        if (isOpen) focusDate = value;
      }}
      initialFocus={() => calendar?.focusTarget() ?? null}
    >
      {#snippet trigger({ props })}
        <button
          {...props}
          type="button"
          {disabled}
          aria-label={value ? `${calendarLabel}, ${formatIsoDate(value, locale)}` : calendarLabel}
          class="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        >
          <CalendarDays class="size-4" aria-hidden="true" />
        </button>
      {/snippet}
      <Calendar
        bind:this={calendar}
        bind:focusDate
        selected={value}
        {today}
        {min}
        {max}
        {isDateDisabled}
        {weekStartsOn}
        {locale}
        label={calendarLabel}
        onselect={(date) => {
          set(date);
          open = false;
        }}
      />
    </Popover>
  </div>
  {#if issue}
    <p id={errorId} class="text-xs font-medium text-destructive">{dateInputMessage(issue, { min, max })}</p>
  {/if}
  {#if name}
    <input type="hidden" {name} value={value ?? ''} />
  {/if}
</div>
