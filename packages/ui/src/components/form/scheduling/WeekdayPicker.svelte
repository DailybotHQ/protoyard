<script lang="ts">
import type { HTMLAttributes } from 'svelte/elements';
import { cx } from 'texuli/cx';
import { useMessages } from 'texuli/i18n';
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
interface OwnProps {
  value?: IsoWeekday[];
  weekStartsOn?: IsoWeekday;
  locale?: string;
  /** Visible label style on each toggle; the accessible name is the visible text plus the long name. */
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
  /** The rendered root element, the toggle group (bindable). */
  ref?: HTMLElement | null;
}

/**
 * Extra attributes (`data-*`, `aria-label`, handlers…) land on the toggle
 * group, the root. A caller `aria-label` replaces `label` as its name.
 */
type Props = OwnProps & Omit<HTMLAttributes<HTMLDivElement>, keyof OwnProps | 'role' | 'children'>;

const uid = $props.id();

let {
  value = $bindable([]),
  weekStartsOn = 1,
  locale,
  labelStyle = 'short',
  label: labelProp,
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
  ref = $bindable(null),
  ...rest
}: Props = $props();

// Labels resolve through Texuli's dictionary (mountPrototype({ i18n })); props still win.
const messages = useMessages();
const label = $derived(
  labelProp ?? messages('protoyard.ui.weekday-picker.label', 'Days of the week')
);

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
  {...rest}
  bind:ref
  type="multiple"
  {id}
  aria-label={labelledBy ? undefined : (rest['aria-label'] ?? label)}
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
    <!-- The accessible name starts with the visible text (WCAG 2.5.3, axe
         label-content-name-mismatch): "Mon Monday", the long name hidden. -->
    <ToggleGroupItem value={String(entry.day)} data-weekday={entry.day}>
      {entry.text}{#if entry.long !== entry.text}<span class="ui-weekday-picker__long">{' '}{entry.long}</span>{/if}
    </ToggleGroupItem>
  {/each}
</ToggleGroup>

<style>
  .ui-weekday-picker__long {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  :global(.ui-weekday-picker[data-invalid] [aria-pressed='false']) {
    border-color: var(--tx-destructive, crimson);
  }
</style>
