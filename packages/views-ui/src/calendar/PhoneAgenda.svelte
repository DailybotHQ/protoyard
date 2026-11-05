<script lang="ts" generics="TData = unknown">
/**
 * Phone agenda for `CalendarView` (`phone`): a day-by-day list sized for a
 * narrow screen. Each event is one button (the host's `chip` snippet or a
 * title and time), a day with more than `maxPerDay` events shows a
 * “+N more events” toggle, and `onCreate` adds an all-day slot per day.
 * Loaded lazily by the adapter, so desktop calendars never download it.
 */
import { Button } from '@protoyard/ui';
import {
  addDays,
  type CalendarSeries,
  type CalendarSlot,
  daySlot,
  expandAll,
  type IsoDate,
  MAX_OCCURRENCES,
  type Occurrence,
  spanDates,
  stepAnchor,
  visibleRange,
} from '@texuli/data/calendar';
import type { CalendarLabels } from '@texuli/data/calendar/view';
import type { Snippet } from 'svelte';
import type { CalendarChipState, CalendarTone } from './types.ts';

let {
  events,
  anchor = $bindable<IsoDate>(),
  today,
  label,
  locale,
  timeZone,
  agendaDays,
  maxPerDay,
  labels,
  getTitle,
  getTone,
  onOpen,
  onCreate,
  chip,
  class: className,
}: {
  events: readonly CalendarSeries<TData>[];
  anchor: IsoDate;
  today: IsoDate;
  label: string;
  locale: string;
  timeZone: string;
  agendaDays: number;
  maxPerDay: number;
  labels: CalendarLabels;
  getTitle?: (occurrence: Occurrence<TData>) => string;
  getTone?: (occurrence: Occurrence<TData>) => CalendarTone;
  onOpen?: (occurrence: Occurrence<TData>) => void;
  onCreate?: (slot: CalendarSlot) => Promise<void>;
  chip?: Snippet<[Occurrence<TData>, CalendarChipState]>;
  class?: string;
} = $props();

const uid = $props.id();
let expanded = $state<Record<string, boolean>>({});

const range = $derived(visibleRange('agenda', anchor, { weekStartsOn: 0, timeZone, agendaDays }));
const expansion = $derived(expandAll(events, { start: range.start, end: range.end }, { timeZone }));

/** Civil dates as midday UTC so the formatter never shifts them across a day. */
const dayFormat = $derived(
  new Intl.DateTimeFormat(locale, {
    timeZone: 'UTC',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
);
const timeFormat = $derived(
  new Intl.DateTimeFormat(locale, { timeZone, hour: 'numeric', minute: '2-digit' })
);
const longDate = (date: IsoDate): string => dayFormat.format(new Date(`${date}T12:00:00Z`));

function when(occurrence: Occurrence<TData>): string {
  if (occurrence.allDay) return labels.allDay;
  const start = timeFormat.format(new Date(occurrence.start));
  const end = timeFormat.format(new Date(occurrence.end));
  return `${start} – ${end}`;
}

function chipState(occurrence: Occurrence<TData>): CalendarChipState {
  return {
    title: getTitle?.(occurrence) ?? labels.untitledEvent,
    tone: getTone?.(occurrence) ?? 'neutral',
    when: when(occurrence),
  };
}

const days = $derived.by(() => {
  const spans = expansion.occurrences.map((occurrence) => ({
    occurrence,
    ...spanDates(occurrence, timeZone),
  }));
  const list: { date: IsoDate; items: Occurrence<TData>[] }[] = [];
  for (let date = range.startDate; date < range.endDate; date = addDays(date, 1)) {
    const items = spans
      .filter((span) => span.first <= date && date <= span.last)
      .map((span) => span.occurrence);
    list.push({ date, items });
  }
  return list;
});

function step(direction: -1 | 1): void {
  anchor = stepAnchor('agenda', anchor, direction, agendaDays);
  expanded = {};
}

function goToday(): void {
  anchor = today;
  expanded = {};
}

function toggle(date: IsoDate): void {
  expanded = { ...expanded, [date]: !expanded[date] };
}

const rangeTitle = $derived(
  `${longDate(range.startDate)} – ${longDate(addDays(range.endDate, -1))}`
);
</script>

<section class={['py-phone-agenda', className]} aria-label={label} data-phone-agenda>
  <div class="py-phone-agenda__bar">
    <Button type="button" variant="ghost" size="sm" aria-label={labels.previous} onclick={() => step(-1)}>
      <span aria-hidden="true">‹</span>
    </Button>
    <Button type="button" variant="outline" size="sm" onclick={goToday}>{labels.today}</Button>
    <Button type="button" variant="ghost" size="sm" aria-label={labels.next} onclick={() => step(1)}>
      <span aria-hidden="true">›</span>
    </Button>
    <p class="py-phone-agenda__range" aria-live="polite">{rangeTitle}</p>
  </div>
  {#if expansion.truncated}
    <p class="py-phone-agenda__note" role="note">{labels.truncationNote(MAX_OCCURRENCES)}</p>
  {/if}
  {#each days as day (day.date)}
    {@const headingId = `${uid}-day-${day.date}`}
    {@const open = expanded[day.date] ?? false}
    {@const hidden = Math.max(0, day.items.length - maxPerDay)}
    {@const shown = open ? day.items : day.items.slice(0, maxPerDay)}
    <section
      class="py-phone-agenda__day"
      aria-labelledby={headingId}
      data-agenda-day={day.date}
      data-today={day.date === today || undefined}
    >
      <div class="py-phone-agenda__head">
        <h3 id={headingId}>
          {longDate(day.date)}{#if day.date === today}<span class="py-phone-agenda__today">
              · {labels.today}</span
            >{/if}
        </h3>
        {#if onCreate}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={`Add event on ${longDate(day.date)}`}
            data-agenda-create={day.date}
            onclick={() => onCreate(daySlot(day.date))}
          >
            <span aria-hidden="true">+</span> Add event
          </Button>
        {/if}
      </div>
      {#if day.items.length === 0}
        <p class="py-phone-agenda__empty">{labels.empty}</p>
      {:else}
        <ul id={`${headingId}-events`}>
          {#each shown as occurrence (`${occurrence.seriesId}:${occurrence.occurrenceId}`)}
            {@const state = chipState(occurrence)}
            <li>
              <button
                type="button"
                class="py-phone-agenda__event"
                data-tone={state.tone}
                data-agenda-event={occurrence.seriesId}
                onclick={() => onOpen?.(occurrence)}
              >
                {#if chip}
                  {@render chip(occurrence, state)}
                {:else}
                  <span class="py-phone-agenda__title">{state.title}</span>
                  <span class="py-phone-agenda__when">{state.when}</span>
                {/if}
              </button>
            </li>
          {/each}
        </ul>
        {#if hidden > 0}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-expanded={open}
            aria-controls={`${headingId}-events`}
            data-agenda-more={day.date}
            onclick={() => toggle(day.date)}
          >
            {#if open}Show fewer{:else}<span aria-hidden="true">+</span>{labels.moreEvents(hidden)}{/if}
          </Button>
        {/if}
      {/if}
    </section>
  {/each}
</section>

<style>
  .py-phone-agenda {
    display: grid;
    gap: var(--tx-space-3, 0.75rem);
    padding: var(--tx-space-3, 0.75rem);
  }
  .py-phone-agenda__bar,
  .py-phone-agenda__head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--tx-space-2, 0.5rem);
  }
  .py-phone-agenda__head {
    justify-content: space-between;
  }
  .py-phone-agenda__range {
    margin: 0;
    font-weight: 600;
  }
  .py-phone-agenda__day {
    display: grid;
    gap: var(--tx-space-2, 0.5rem);
  }
  .py-phone-agenda__day h3 {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 650;
  }
  .py-phone-agenda__today {
    color: var(--tx-primary, LinkText);
  }
  .py-phone-agenda ul {
    display: grid;
    gap: var(--tx-space-2, 0.5rem);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .py-phone-agenda__event {
    --py-event-accent: var(--tx-border-strong, var(--tx-border, ButtonBorder));
    display: grid;
    inline-size: 100%;
    min-block-size: 44px;
    gap: 2px;
    border: var(--tx-border-width-thin, 1px) solid var(--tx-border, ButtonBorder);
    border-inline-start: 3px solid var(--py-event-accent);
    border-radius: var(--tx-shape-radius-md, 0.375rem);
    padding: var(--tx-space-2, 0.5rem) var(--tx-space-3, 0.75rem);
    background: var(--tx-muted, ButtonFace);
    color: inherit;
    font: inherit;
    text-align: start;
    cursor: pointer;
  }
  .py-phone-agenda__event:focus-visible {
    outline: var(--tx-focus-ring-width, 2px) solid var(--tx-ring, Highlight);
    outline-offset: 2px;
  }
  .py-phone-agenda__event[data-tone='primary'] { --py-event-accent: var(--tx-primary, Highlight); }
  .py-phone-agenda__event[data-tone='info'] { --py-event-accent: var(--tx-info, Highlight); }
  .py-phone-agenda__event[data-tone='success'] { --py-event-accent: var(--tx-success, Highlight); }
  .py-phone-agenda__event[data-tone='warning'] { --py-event-accent: var(--tx-warning, Highlight); }
  .py-phone-agenda__event[data-tone='danger'] { --py-event-accent: var(--tx-destructive, Highlight); }
  .py-phone-agenda__title {
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .py-phone-agenda__when,
  .py-phone-agenda__empty,
  .py-phone-agenda__note {
    margin: 0;
    color: var(--tx-muted-foreground, GrayText);
    font-size: var(--tx-type-caption-size, 0.8rem);
  }
</style>
