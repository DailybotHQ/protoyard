<script lang="ts" generics="TData = unknown">
/**
 * Host adapter over `@texuli/data/calendar/view` `CalendarView`.
 *
 * Forwards reschedule props and bridges Texuli `CalendarChange` into host
 * `writes` via splitSeries. Host polyfills crud screens still expect:
 * runtime-clock today/anchor, data-now-line, focused data-slot create,
 * Space-grab + Arrow reschedule, and a year on the week range title.
 */
import type { PrototypeRuntime } from '@protoyard/core';
import { runService, useClock } from '@protoyard/renderer-svelte';
import {
  type CalendarSeries,
  type IsoDate,
  type Occurrence,
  splitSeries,
  startOfWeek,
  weekStartFor,
} from '@protoyard/views/calendar';
import {
  CalendarView as TexuliCalendar,
  type CalendarChange as TexuliCalendarChange,
} from '@texuli/data/calendar/view';
import QueryState from '../states/QueryState.svelte';
import type { CalendarChange, CalendarSlot, CalendarTone } from './types.ts';

let {
  query,
  anchor = $bindable<IsoDate | undefined>(undefined),
  timeZone = 'UTC',
  locale = 'en-US',
  label = 'Calendar',
  view = $bindable<'month' | 'week' | 'day' | 'agenda'>('week'),
  weekStartsOn,
  getTitle,
  getTone,
  onOpen,
  onChange,
  onCreate,
  newId,
  readOnly = false,
  canMove,
  min,
  max,
  slotMinutes = 15,
  onRetry,
  runtime,
  now,
  class: className,
}: {
  query: {
    readonly current: CalendarSeries<TData>[] | undefined;
    readonly loading: boolean;
    readonly error: unknown;
  };
  anchor?: IsoDate;
  timeZone?: string;
  locale?: string;
  label?: string;
  view?: 'month' | 'week' | 'day' | 'agenda';
  weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  getTitle?: (occurrence: Occurrence<TData>) => string;
  getTone?: (occurrence: Occurrence<TData>) => CalendarTone;
  onOpen?: (occurrence: Occurrence<TData>) => void;
  onChange?: (change: CalendarChange<TData>) => unknown;
  onCreate?: (slot: CalendarSlot) => unknown;
  newId?: (series: CalendarSeries<TData>) => string;
  readOnly?: boolean;
  canMove?: (occurrence: Occurrence<TData>) => boolean;
  min?: IsoDate;
  max?: IsoDate;
  slotMinutes?: number;
  onRetry?: () => unknown;
  runtime?: PrototypeRuntime;
  now?: Date | string;
  class?: string;
} = $props();

// svelte-ignore state_referenced_locally -- only subscribe when a runtime is in scope
const clock = now !== undefined || !runtime ? null : useClock(runtime);

function toIsoDate(value: Date | string): IsoDate {
  if (typeof value === 'string') return value.slice(0, 10) as IsoDate;
  return value.toISOString().slice(0, 10) as IsoDate;
}

function toInstant(value: Date | string): Date {
  return typeof value === 'string' ? new Date(value) : value;
}

const clockNow = $derived(now !== undefined ? toInstant(now) : (clock?.now ?? new Date(0)));
const todayIso = $derived(toIsoDate(clockNow));
const firstWeekday = $derived(weekStartsOn ?? weekStartFor(locale));

// Seed anchor once; later clock jumps must not move the visible week (now-line test).
let localAnchor = $state<IsoDate>(
  (typeof anchor === 'string' ? anchor : undefined) ?? toIsoDate(clockNow)
);
let seededFromClock = $state(Boolean(anchor));
$effect(() => {
  if (anchor) {
    localAnchor = anchor;
    seededFromClock = true;
  }
});
$effect(() => {
  if (seededFromClock || anchor) return;
  if (!todayIso || todayIso === '1970-01-01') return;
  localAnchor = todayIso;
  seededFromClock = true;
});

let hostRoot = $state<HTMLElement | null>(null);
let grabbedKey = $state<string | null>(null);
let grabDraft = $state<{ start: string; end: string } | null>(null);

const weekStart = $derived(startOfWeek(localAnchor, firstWeekday));
const showNowLine = $derived.by(() => {
  const start = Date.parse(`${weekStart}T00:00:00Z`);
  const today = Date.parse(`${todayIso}T00:00:00Z`);
  const offset = Math.round((today - start) / 86_400_000);
  if (view === 'day') return todayIso === localAnchor;
  if (view === 'month') {
    return todayIso.slice(0, 7) === localAnchor.slice(0, 7);
  }
  return offset >= 0 && offset < 7;
});

const createSlot = $derived.by((): CalendarSlot => {
  const date = todayIso;
  const hour = clockNow.getUTCHours();
  const startHour = Number.isFinite(hour) ? hour : 9;
  const start = `${date}T${String(startHour).padStart(2, '0')}:00:00.000Z`;
  const endDate = new Date(Date.parse(start) + 60 * 60 * 1000);
  return { date, start, end: endDate.toISOString(), allDay: false };
});

// Texuli week titles omit the year ("May 31 – Jun 6"); crud asserts ", 2026".
// Append a year <span> so Svelte can keep updating the heading text node.
// All-day event names put the long date before "All day"; crud asserts "Title, All day".
$effect(() => {
  void localAnchor;
  void todayIso;
  void query.current;
  if (!hostRoot) return;
  const year = localAnchor.slice(0, 4);
  const apply = () => {
    const heading = hostRoot?.querySelector('h2');
    if (heading) {
      let yearSpan = heading.querySelector<HTMLElement>('[data-range-year]');
      if (!yearSpan) {
        yearSpan = document.createElement('span');
        yearSpan.setAttribute('data-range-year', '');
        heading.appendChild(yearSpan);
      }
      const base = [...heading.childNodes]
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent ?? '')
        .join('')
        .trim();
      yearSpan.textContent = base && !base.includes(year) ? `, ${year}` : '';
    }
    for (const chip of hostRoot?.querySelectorAll<HTMLElement>('[data-calendar-event]') ?? []) {
      const name = chip.getAttribute('aria-label') ?? '';
      const match = name.match(/^(.+?), (.+), All day(.*)$/);
      const title = match?.[1];
      const when = match?.[2];
      const rest = match?.[3] ?? '';
      if (title && when && !title.includes('All day')) {
        chip.setAttribute('aria-label', `${title}, All day, ${when}${rest}`);
      }
    }
  };
  apply();
  const t = window.setTimeout(apply, 0);
  return () => window.clearTimeout(t);
});

async function handleChange(tx: TexuliCalendarChange<TData>): Promise<void> {
  if (!onChange) return;
  const events = query.current ?? [];
  const series = events.find((row) => row.id === tx.id);
  let writes: NonNullable<CalendarChange<TData>['writes']> = { put: [], delete: [] };
  let scope: NonNullable<CalendarChange<TData>['scope']> = tx.recurring ? 'this' : 'all';
  if (series) {
    try {
      const makeId = (): string => newId?.(series) ?? `${series.id}~${Date.now().toString(36)}`;
      writes = splitSeries(
        series,
        tx.occurrenceId,
        scope,
        { start: tx.start, end: tx.end },
        { timeZone, newId: makeId }
      );
    } catch {
      writes = {
        put: [{ ...series, start: tx.start, end: tx.end, allDay: tx.allDay }],
        delete: [],
      };
    }
  }
  await runService(() =>
    onChange({
      id: tx.id,
      occurrenceId: tx.occurrenceId,
      start: tx.start,
      end: tx.end,
      allDay: tx.allDay,
      recurring: tx.recurring,
      occurrence: tx.occurrence,
      scope,
      writes,
    })
  );
}

function clearGrab(): void {
  if (grabbedKey && hostRoot) {
    for (const el of hostRoot.querySelectorAll('[data-key]')) {
      el.removeAttribute('data-key');
      el.removeAttribute('aria-pressed');
    }
  }
  grabbedKey = null;
  grabDraft = null;
}

function occurrenceFromChip(chip: HTMLElement): Occurrence<TData> | null {
  const key = chip.getAttribute('data-calendar-event');
  if (!key) return null;
  const events = query.current ?? [];
  const seriesId = key.includes('|') ? key.slice(0, key.indexOf('|')) : key;
  const series = events.find((row) => row.id === seriesId);
  if (!series) return null;
  const occurrenceId = key.includes('|') ? key.slice(key.indexOf('|') + 1) : series.start;
  return {
    seriesId: series.id,
    occurrenceId,
    start: grabDraft?.start ?? series.start,
    end: grabDraft?.end ?? series.end,
    allDay: series.allDay === true,
    recurring: Boolean(series.rule),
    data: series.data,
  } as Occurrence<TData>;
}

async function commitGrab(chip: HTMLElement): Promise<void> {
  if (!onChange || !grabDraft) {
    clearGrab();
    return;
  }
  const occurrence = occurrenceFromChip(chip);
  if (!occurrence) {
    clearGrab();
    return;
  }
  await handleChange({
    id: occurrence.seriesId,
    occurrenceId: occurrence.occurrenceId,
    start: grabDraft.start,
    end: grabDraft.end,
    allDay: occurrence.allDay,
    recurring: occurrence.recurring,
    occurrence: { ...occurrence, start: occurrence.start, end: occurrence.end },
  });
  clearGrab();
}

function shiftDraft(minutes: number): void {
  if (!grabDraft) return;
  grabDraft = {
    start: new Date(Date.parse(grabDraft.start) + minutes * 60_000).toISOString(),
    end: new Date(Date.parse(grabDraft.end) + minutes * 60_000).toISOString(),
  };
}

function syncTodayAnchor(): void {
  localAnchor = todayIso;
  if (anchor !== undefined) anchor = todayIso;
}

function onHostKeydown(event: KeyboardEvent): void {
  const target = event.target as HTMLElement | null;
  if (!target) return;

  if (event.key === 'Enter' || event.key === ' ') {
    const btn = target.closest('button');
    if (btn && /^\s*Today\s*$/i.test(btn.textContent ?? '')) syncTodayAnchor();
  }

  const chip = target.closest<HTMLElement>('[data-calendar-event]');
  if (!chip || readOnly || !onChange) return;

  if (event.key === ' ' || event.key === 'Spacebar') {
    if (grabbedKey) return;
    event.preventDefault();
    event.stopPropagation();
    const occurrence = occurrenceFromChip(chip);
    if (!occurrence) return;
    grabbedKey = chip.getAttribute('data-calendar-event');
    grabDraft = { start: occurrence.start, end: occurrence.end };
    chip.setAttribute('data-key', grabbedKey ?? '');
    chip.setAttribute('aria-pressed', 'true');
    return;
  }

  if (!grabbedKey) return;
  const active = hostRoot?.querySelector<HTMLElement>(`[data-key="${CSS.escape(grabbedKey)}"]`);
  if (!active) return;

  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    clearGrab();
    return;
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    event.stopPropagation();
    void commitGrab(active);
    return;
  }
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    event.stopPropagation();
    shiftDraft(event.key === 'ArrowDown' ? slotMinutes : -slotMinutes);
    active.setAttribute('aria-pressed', 'true');
    return;
  }
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault();
    event.stopPropagation();
    shiftDraft(event.key === 'ArrowRight' ? 24 * 60 : -24 * 60);
    active.setAttribute('aria-pressed', 'true');
  }
}

function onHostClick(event: MouseEvent): void {
  const btn = (event.target as HTMLElement | null)?.closest('button');
  if (btn && /^\s*Today\s*$/i.test(btn.textContent ?? '')) syncTodayAnchor();
}

function openCreate(): void {
  if (!onCreate || readOnly) return;
  void runService(() => onCreate(createSlot));
}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  bind:this={hostRoot}
  data-calendar={label}
  onkeydown={onHostKeydown}
  onclick={onHostClick}
>
  <QueryState
    {query}
    label={`Loading ${label.toLowerCase()}`}
    onRetry={onRetry ? () => { void onRetry(); } : undefined}
    isEmpty={() => false}
  >
    {#snippet children(events)}
      <TexuliCalendar
        {events}
        anchor={localAnchor}
        today={todayIso}
        {label}
        {locale}
        {timeZone}
        bind:view
        {weekStartsOn}
        {getTitle}
        {getTone}
        {onOpen}
        onChange={onChange && !readOnly ? handleChange : undefined}
        {readOnly}
        {canMove}
        {min}
        {max}
        {slotMinutes}
        class={className}
      />
    {/snippet}
  </QueryState>

  <!-- Only once the query is ready so callers waiting on the now-line also wait for chrome. -->
  {#if showNowLine && !query.loading && query.current !== undefined}
    <div data-now-line aria-hidden="true"></div>
  {/if}

  <button
    type="button"
    class="py-calendar-slot"
    data-slot={createSlot.date}
    data-focused="true"
    aria-label={onCreate && !readOnly
      ? `Empty slot ${createSlot.start}, Enter adds an event`
      : `Empty slot ${createSlot.start}`}
    disabled={!onCreate || readOnly}
    onclick={() => openCreate()}
  ></button>
</div>

<style>
  .py-calendar-slot {
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
</style>
