<script lang="ts">
import { cn } from '../../../lib/cn.ts';
import {
  type IsoWeekday,
  normalizeWeekdays,
  orderedWeekdays,
  toggleWeekday,
  type WeekdayStyle,
  weekdayName,
} from './weekdays.ts';

/**
 * WeekdayPicker — a set of days of the week as toggle buttons in one group.
 * The group is a single tab stop: arrows (and Home/End) move between days,
 * Space or Enter toggles one. The value is a sorted list of ISO weekdays
 * (1 = Monday … 7 = Sunday). For a single weekday use `Select` with
 * `weekdayOptions()`.
 */
interface Props {
  value?: IsoWeekday[];
  weekStartsOn?: IsoWeekday;
  locale?: string;
  /** Visible label style on each toggle; the accessible name is always the long name. */
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
}

const uid = $props.id();

let {
  value = $bindable([]),
  weekStartsOn = 1,
  locale,
  labelStyle = 'short',
  label = 'Days of the week',
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
}: Props = $props();

let group = $state<HTMLDivElement | null>(null);
const days = $derived(
  orderedWeekdays(weekStartsOn).map((day) => ({
    day,
    text: weekdayName(day, locale, labelStyle),
    long: weekdayName(day, locale, 'long'),
  }))
);
const selected = $derived(normalizeWeekdays(value));
let active = $state<IsoWeekday | null>(null);
const tabStop = $derived(active ?? selected[0] ?? weekStartsOn);
const invalid = $derived(ariaInvalid === true || ariaInvalid === 'true');

function toggle(day: IsoWeekday) {
  active = day;
  const next = toggleWeekday(selected, day);
  value = next;
  onValueChange?.(next);
}

function onkeydown(event: KeyboardEvent, index: number) {
  const last = days.length - 1;
  const targets: Record<string, number> = {
    ArrowRight: index === last ? 0 : index + 1,
    ArrowDown: index === last ? 0 : index + 1,
    ArrowLeft: index === 0 ? last : index - 1,
    ArrowUp: index === 0 ? last : index - 1,
    Home: 0,
    End: last,
  };
  const target = targets[event.key];
  if (target === undefined) return;
  event.preventDefault();
  const day = days[target]?.day;
  if (!day) return;
  active = day;
  group?.querySelector<HTMLButtonElement>(`button[data-weekday="${day}"]`)?.focus();
}
</script>

<div
  bind:this={group}
  {id}
  role="group"
  aria-label={labelledBy ? undefined : label}
  aria-labelledby={labelledBy}
  aria-describedby={describedBy}
  class={cn('ui-weekday-picker flex flex-wrap gap-1.5', className)}
>
  {#each days as entry, index (entry.day)}
    {@const pressed = selected.includes(entry.day)}
    <button
      type="button"
      data-weekday={entry.day}
      tabindex={entry.day === tabStop ? 0 : -1}
      aria-pressed={pressed}
      aria-label={entry.long}
      {disabled}
      class={cn(
        'inline-flex h-9 min-h-touch min-w-11 items-center justify-center rounded-md border px-2 text-sm font-medium sm:min-h-0',
        'outline-none transition-colors duration-150 motion-reduce:transition-none',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
        'disabled:cursor-not-allowed disabled:opacity-50',
        pressed
          ? 'border-primary bg-primary text-primary-foreground hover:bg-primary-hover'
          : 'border-input bg-surface text-foreground hover:bg-muted',
        invalid && !pressed && 'border-destructive'
      )}
      onclick={() => toggle(entry.day)}
      onkeydown={(event) => onkeydown(event, index)}
      onfocus={() => (active = entry.day)}
    >
      {entry.text}
    </button>
  {/each}
  {#if name}
    {#each selected as day (day)}
      <input type="hidden" {name} value={day} />
    {/each}
  {/if}
</div>
