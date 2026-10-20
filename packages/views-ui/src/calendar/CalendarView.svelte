<script lang="ts" generics="TData">
import { ChevronLeft, ChevronRight } from '@lucide/svelte';
import type { PrototypeRuntime } from '@protoyard/core';
import { runService, useClock } from '@protoyard/renderer-svelte';
import { Button } from '@protoyard/ui';
import {
  addDays,
  type CalendarSeries,
  dateIn,
  type EditScope,
  expandAll,
  type IsoDate,
  type Occurrence,
  splitSeries,
  stepAnchor,
  toIso,
  visibleRange,
  weekDates,
  weekStartFor,
} from '@protoyard/views/calendar';
import { tick } from 'svelte';
import { lazyDialog } from '../lib/lazy-overlays.svelte.ts';
import QueryState from '../states/QueryState.svelte';
import {
  applyMove,
  type CalendarMode,
  formats,
  HOUR_PX,
  isNoMove,
  MINUTES_PER_DAY,
  MODE_KEYS,
  type Move,
  NO_MOVE,
  occurrenceKey,
  SLOT_MINUTES,
  slotInstant,
  snap,
} from './model.ts';
import TimeGridView from './TimeGridView.svelte';
import type { CalendarChange, CalendarItem, CalendarSlot, CalendarTone } from './types.ts';

/**
 * Month, week, day and agenda views over calendar series (with recurrence).
 * Writes go out through `onChange` / `onCreate`, which should call the
 * prototype's services (`session.assert` → zod → `environment.run` →
 * `db.transaction`): moves show at once, stay pending until the promise
 * settles and roll back when it fails. Time comes from the runtime clock.
 */
let {
  query,
  label = 'Calendar',
  timeZone = 'UTC',
  locale = 'en-US',
  view = $bindable(),
  anchor = $bindable(),
  now,
  runtime,
  agendaDays = 14,
  getTitle = (o: Occurrence<TData>) =>
    String((o.data as { title?: unknown } | undefined)?.title ?? 'Untitled event'),
  getTone = () => 'primary',
  newId,
  onChange,
  onCreate,
  onOpen,
  onRetry,
  class: className,
}: {
  /** A `liveQuery` of the series in (or around) view. */
  query: {
    readonly current: CalendarSeries<TData>[] | undefined;
    readonly loading: boolean;
    readonly error: unknown;
  };
  label?: string;
  /** The persona's IANA zone; dates, the now-line and grids follow it. */
  timeZone?: string;
  locale?: string;
  /** Default: `agenda` below `sm` (640 px), else `week`. */
  view?: CalendarMode;
  /** A date in the visible range; default: today from the clock. */
  anchor?: IsoDate;
  /** Fixed "now" (tests, stories); default: the runtime clock, so time travel moves the view. */
  now?: Date;
  runtime?: PrototypeRuntime;
  agendaDays?: number;
  getTitle?: (occurrence: Occurrence<TData>) => string;
  getTone?: (occurrence: Occurrence<TData>) => CalendarTone;
  /** Id for the series a "this and following" edit creates (default: derived from the occurrence). */
  newId?: (series: CalendarSeries<TData>) => string;
  /** Without it the calendar is read-only: nothing can be dragged or grabbed. */
  onChange?: (change: CalendarChange<TData>) => unknown;
  /** Without it empty slots and days do nothing. Return `false` when it only opened a form. */
  onCreate?: (slot: CalendarSlot) => unknown;
  onOpen?: (occurrence: Occurrence<TData>) => void;
  onRetry?: () => void;
  class?: string;
} = $props();

// svelte-ignore state_referenced_locally
const clock = now ? null : useClock(runtime);
const nowMs = $derived((now ?? clock?.now ?? new Date(0)).getTime());
const today = $derived(dateIn(nowMs, timeZone));
const weekStartsOn = $derived(weekStartFor(locale));
const fmt = $derived(formats(locale, timeZone));

function initialMode(): CalendarMode {
  const narrow = typeof matchMedia === 'function' && matchMedia('(max-width: 639.98px)').matches;
  return narrow ? 'agenda' : 'week';
}
// What is shown lives here, so a re-render that omits `view` or `anchor` keeps
// the person's place; a bound value from the parent wins when it changes.
// svelte-ignore state_referenced_locally
let mode = $state<CalendarMode>(view ?? initialMode());
// svelte-ignore state_referenced_locally
let at = $state<IsoDate>(anchor ?? dateIn(nowMs, timeZone));
$effect.pre(() => {
  if (view !== undefined) mode = view;
});
$effect.pre(() => {
  if (anchor !== undefined) at = anchor;
});
function setMode(next: CalendarMode) {
  mode = next;
  view = next;
}
function setAnchor(next: IsoDate) {
  at = next;
  anchor = next;
}

const range = $derived(visibleRange(mode, at, { weekStartsOn, timeZone, agendaDays }));
const series = $derived(query.current ?? []);
const expansion = $derived(expandAll(series, { start: range.start, end: range.end }, { timeZone }));

/** Saved-but-not-yet-reloaded positions, by occurrence key. */
let optimistic = $state<Record<string, { start: string; end: string }>>({});
let pending = $state<Record<string, true>>({});
let grab = $state<{ key: string; move: Move } | null>(null);
let creating = $state(false);
let announcement = $state('');
let focus = $state<{ date: IsoDate; minute: number }>({ date: '1970-01-01', minute: 9 * 60 });
let root = $state<HTMLElement | null>(null);

// svelte-ignore state_referenced_locally
focus.date = at;

// New data replaces optimistic positions that are no longer pending.
let seenSeries: unknown;
$effect(() => {
  const current = query.current;
  if (current === seenSeries) return;
  seenSeries = current;
  const keep: Record<string, { start: string; end: string }> = {};
  for (const key of Object.keys(pending)) if (optimistic[key]) keep[key] = optimistic[key];
  optimistic = keep;
});

const editable = $derived(onChange !== undefined);
const canCreate = $derived(onCreate !== undefined);
const byKey = $derived(new Map(expansion.occurrences.map((o) => [occurrenceKey(o), o])));
const items = $derived<CalendarItem[]>(
  expansion.occurrences.map((o) => {
    const key = occurrenceKey(o);
    const base = optimistic[key] ? { ...o, ...optimistic[key] } : o;
    const moved = grab?.key === key ? { ...base, ...applyMove(base, grab.move, timeZone) } : base;
    return {
      ...(moved as Occurrence<unknown>),
      id: key,
      key,
      title: getTitle(o),
      tone: getTone(o),
      pending: pending[key] === true,
      grabbed: grab?.key === key,
    };
  })
);

const title = $derived(
  mode === 'month'
    ? fmt.monthTitle(at)
    : mode === 'day'
      ? fmt.longDate(at)
      : fmt.range(range.startDate, addDays(range.endDate, -1))
);

function switchMode(next: CalendarMode) {
  setMode(next);
  setAnchor(focus.date);
  announce(`${next[0]?.toUpperCase()}${next.slice(1)} view`);
}

function step(direction: -1 | 1) {
  const next = stepAnchor(mode, at, direction, agendaDays);
  setAnchor(next);
  focus.date =
    mode === 'month'
      ? next
      : visibleRange(mode, next, { weekStartsOn, timeZone, agendaDays }).startDate;
}

function goToday() {
  setAnchor(today);
  focus.date = today;
}

function announce(text: string) {
  announcement = text;
}

function open(key: string) {
  const occurrence = byKey.get(key);
  if (occurrence) onOpen?.(occurrence);
}

async function create(slot: CalendarSlot) {
  if (!onCreate || creating) return;
  creating = true;
  try {
    const result = await runService(() => onCreate(slot));
    // `false`: the handler opened a form instead of creating; that form reports.
    if (result.ok && result.value === false) return;
    announce(
      result.ok ? `Created an event on ${fmt.longDate(slot.date)}` : 'The event was not created'
    );
  } finally {
    creating = false;
  }
}

function createAt(date: IsoDate, minute: number) {
  const start = slotInstant(date, minute, timeZone);
  void create({ date, start: toIso(start), end: toIso(start + 60 * 60_000), allDay: false });
}

function createDay(date: IsoDate) {
  void create({ date, start: date, end: addDays(date, 1), allDay: true });
}

// Recurring edits ask which occurrences the change applies to.
let scopeOpen = $state(false);
let scope = $state<EditScope>('this');
let scopeRequest: { occurrence: Occurrence<TData>; target: { start: string; end: string } } | null =
  null;

async function apply(
  occurrence: Occurrence<TData>,
  target: { start: string; end: string },
  chosen: EditScope
) {
  const key = occurrenceKey(occurrence);
  const owner = series.find((s) => s.id === occurrence.seriesId);
  grab = null;
  if (!owner || !onChange) return;
  const writes = splitSeries(owner, occurrence.occurrenceId, chosen, target, {
    timeZone,
    newId: () =>
      newId?.(owner) ?? `${owner.id}-from-${occurrence.occurrenceId.replace(/[^0-9A-Za-z]/g, '')}`,
  });
  optimistic = { ...optimistic, [key]: target };
  pending = { ...pending, [key]: true };
  announce('Saving…');
  const result = await runService(() =>
    onChange({ occurrence, scope: chosen, start: target.start, end: target.end, writes })
  );
  const { [key]: _done, ...rest } = pending;
  pending = rest;
  if (!result.ok) {
    // Roll back: the event returns to where the data says it is.
    const { [key]: _gone, ...kept } = optimistic;
    optimistic = kept;
    announce('The change was not saved; the event is back where it was.');
  } else {
    announce('Saved');
  }
}

function commit(key: string, move: Move) {
  const occurrence = byKey.get(key);
  if (!occurrence || isNoMove(move)) {
    grab = null;
    return;
  }
  const base = optimistic[key] ? { ...occurrence, ...optimistic[key] } : occurrence;
  const target = applyMove(base, move, timeZone);
  if (occurrence.recurring) {
    scopeRequest = { occurrence, target };
    scope = 'this';
    // The scope dialog's Bits UI code loads on the first repeating-event edit.
    void lazyDialog.load().then(
      () => (scopeOpen = true),
      () => {
        scopeRequest = null;
        grab = null;
        announcement = 'The dialog could not load. Check the connection and try again.';
      }
    );
    return;
  }
  void apply(occurrence, target, 'this');
}

async function confirmScope() {
  const request = scopeRequest;
  scopeRequest = null;
  if (request) await apply(request.occurrence, request.target, scope);
}

function cancelScope() {
  scopeRequest = null;
  grab = null;
  announce('Change cancelled');
}

// Keyboard: arrows move focus (or a grabbed event), Enter opens or creates, M/W/D/A switch views.
function keyMove(key: string, shift: boolean): Move | null {
  const days = key === 'ArrowLeft' ? -1 : key === 'ArrowRight' ? 1 : 0;
  const vertical = key === 'ArrowUp' ? -1 : key === 'ArrowDown' ? 1 : 0;
  if (days === 0 && vertical === 0) return null;
  if (mode === 'month') return { days: days + vertical * 7, minutes: 0, resize: 0 };
  if (mode === 'agenda') return { days: days + vertical, minutes: 0, resize: 0 };
  return shift
    ? { days: 0, minutes: 0, resize: vertical * SLOT_MINUTES }
    : { days, minutes: vertical * SLOT_MINUTES, resize: 0 };
}

async function focusSlot() {
  await tick();
  root?.querySelector<HTMLElement>('[data-slot][data-focused]')?.focus();
}

function moveFocus(move: Move) {
  let minute = focus.minute + move.minutes;
  let date = addDays(focus.date, move.days);
  if (minute < 0 || minute >= MINUTES_PER_DAY) {
    date = addDays(date, minute < 0 ? -1 : 1);
    minute = (minute + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  }
  focus = { date, minute };
  if (date < range.startDate || date >= range.endDate) setAnchor(date);
  void focusSlot();
}

function onKeydown(event: KeyboardEvent) {
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
  const target = event.target as HTMLElement;
  if (
    target.closest(
      'input, textarea, select, [contenteditable="true"], [role="alertdialog"], [role="dialog"]'
    )
  )
    return;

  if (grab) {
    const current = grab;
    if (event.key === 'Escape' || event.key === 'Tab') {
      grab = null;
      announce('Move cancelled');
      if (event.key === 'Escape') event.preventDefault();
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      commit(current.key, current.move);
      return;
    }
    const delta = keyMove(event.key, event.shiftKey);
    if (!delta) return;
    event.preventDefault();
    const occurrence = byKey.get(current.key);
    if (delta.resize !== 0 && occurrence?.allDay) return;
    const move = {
      days: current.move.days + delta.days,
      minutes: current.move.minutes + delta.minutes,
      resize: current.move.resize + delta.resize,
    };
    grab = { key: current.key, move };
    const item = items.find((i) => i.key === current.key);
    if (item)
      announce(
        `${item.title}: ${fmt.longDate(dateIn(Date.parse(item.allDay ? `${item.start}T12:00:00Z` : item.start), timeZone))}, ${fmt.span(item)}. Enter saves, Escape cancels.`
      );
    return;
  }

  const lower = event.key.toLowerCase();
  if (!event.shiftKey && MODE_KEYS[lower]) {
    event.preventDefault();
    switchMode(MODE_KEYS[lower]);
    return;
  }
  const key = target.closest('[data-key]')?.getAttribute('data-key');
  if (key) {
    if (event.key === ' ' && editable) {
      event.preventDefault();
      grab = { key, move: NO_MOVE };
      announce(
        `Grabbed ${items.find((i) => i.key === key)?.title ?? 'event'}. Arrow keys move it${mode === 'week' || mode === 'day' ? ', Shift with up or down changes its length' : ''}; Enter saves, Escape cancels.`
      );
    }
    return;
  }
  if (target.closest('[data-slot]')) {
    const delta = keyMove(event.key, false);
    if (delta) {
      event.preventDefault();
      moveFocus(delta);
    }
  }
}

// Pointer: drag to move (days across, 15-minute steps down), drag the bottom edge to resize.
let drag: {
  key: string;
  kind: 'move' | 'resize';
  x: number;
  y: number;
  colW: number;
  rowH: number;
  moved: boolean;
} | null = null;
let suppressClick = false;

function onDragStart(event: PointerEvent, key: string, kind: 'move' | 'resize') {
  if (!editable || event.button !== 0) return;
  const grid = (event.currentTarget as HTMLElement).closest<HTMLElement>(
    '[data-columns], [data-month-grid], [data-agenda]'
  );
  const rect = grid?.getBoundingClientRect();
  const columns = mode === 'month' ? 7 : Number(grid?.getAttribute('data-columns') ?? 1);
  const gutter = mode === 'week' || mode === 'day' ? 56 : 0;
  drag = {
    key,
    kind,
    x: event.clientX,
    y: event.clientY,
    colW: rect && rect.width > 0 ? (rect.width - gutter) / columns : 0,
    rowH: mode === 'month' && rect ? rect.height / 6 : HOUR_PX / 60,
    moved: false,
  };
  if (kind === 'resize') event.stopPropagation();
  window.addEventListener('pointermove', onDragMove);
  window.addEventListener('pointerup', onDragEnd, { once: true });
}

function onDragMove(event: PointerEvent) {
  if (!drag) return;
  const dx = event.clientX - drag.x;
  const dy = event.clientY - drag.y;
  const days = drag.colW > 0 ? Math.round(dx / drag.colW) : 0;
  let move: Move;
  if (mode === 'month')
    move = { days: days + Math.round(dy / drag.rowH) * 7, minutes: 0, resize: 0 };
  else if (mode === 'agenda') move = NO_MOVE;
  else {
    const minutes = snap(dy / drag.rowH);
    move =
      drag.kind === 'resize'
        ? { days: 0, minutes: 0, resize: minutes }
        : { days, minutes, resize: 0 };
  }
  if (!isNoMove(move)) drag.moved = true;
  grab = { key: drag.key, move };
}

function onDragEnd() {
  window.removeEventListener('pointermove', onDragMove);
  const finished = drag;
  drag = null;
  if (!finished) return;
  if (finished.moved && grab?.key === finished.key) {
    suppressClick = true;
    commit(finished.key, grab.move);
  } else if (grab?.key === finished.key) {
    grab = null;
  }
}

function openFromClick(key: string) {
  if (suppressClick) {
    suppressClick = false;
    return;
  }
  if (!grab) open(key);
}

const MODES: { id: CalendarMode; label: string; key: string }[] = [
  { id: 'month', label: 'Month', key: 'M' },
  { id: 'week', label: 'Week', key: 'W' },
  { id: 'day', label: 'Day', key: 'D' },
  { id: 'agenda', label: 'Agenda', key: 'A' },
];
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<section
  bind:this={root}
  class={['flex min-w-0 flex-col rounded-xl border border-border bg-surface text-surface-foreground', className]}
  aria-label={label}
  aria-busy={creating || undefined}
  data-calendar
  data-view={mode}
  onkeydown={onKeydown}
>
  <header class="flex flex-wrap items-center gap-2 border-b border-border p-2">
    <div class="flex items-center gap-1">
      <Button variant="outline" size="sm" aria-label="Previous" onclick={() => step(-1)}><ChevronLeft aria-hidden="true" /></Button>
      <Button variant="outline" size="sm" onclick={goToday}>Today</Button>
      <Button variant="outline" size="sm" aria-label="Next" onclick={() => step(1)}><ChevronRight aria-hidden="true" /></Button>
    </div>
    <h2 class="min-w-0 flex-1 truncate font-heading text-base font-semibold" aria-live="polite">{title}</h2>
    <div class="flex rounded-md border border-border p-0.5" role="group" aria-label="View">
      {#each MODES as option (option.id)}
        <button
          type="button"
          class={[
            'rounded px-2 py-1 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring',
            mode === option.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
          ]}
          aria-pressed={mode === option.id}
          aria-keyshortcuts={option.key}
          title={`${option.label} (${option.key})`}
          onclick={() => switchMode(option.id)}
        >
          {option.label}
        </button>
      {/each}
    </div>
  </header>

  <QueryState {query} label={`Loading ${label.toLowerCase()}`} isEmpty={() => false} {onRetry}>
    {#snippet children()}
      <!-- Week and day render at once; month and agenda load on first use (bundle budget). -->
      {#if mode === 'month'}
        {#await import('./MonthView.svelte')}
          <p class="p-4 text-sm text-muted-foreground" role="status">Loading the month…</p>
        {:then { default: MonthView }}
        <MonthView
          anchor={at}
          {today}
          focusDate={focus.date}
          {items}
          {fmt}
          {timeZone}
          {weekStartsOn}
          {editable}
          {canCreate}
          onOpen={openFromClick}
          {onDragStart}
          onCreateDay={createDay}
          onFocusDate={(date) => (focus.date = date)}
        />
        {:catch}
          <p class="p-4 text-sm text-destructive" role="alert">This view could not load. Check the connection and try again.</p>
        {/await}
      {:else if mode === 'agenda'}
        {#await import('./AgendaView.svelte')}
          <p class="p-4 text-sm text-muted-foreground" role="status">Loading the agenda…</p>
        {:then { default: AgendaView }}
        <AgendaView
          startDate={range.startDate}
          endDate={range.endDate}
          {today}
          focusDate={focus.date}
          {items}
          {fmt}
          {timeZone}
          {editable}
          {canCreate}
          onOpen={openFromClick}
          {onDragStart}
          onCreateDay={createDay}
          onFocusDate={(date) => (focus.date = date)}
        />
        {:catch}
          <p class="p-4 text-sm text-destructive" role="alert">This view could not load. Check the connection and try again.</p>
        {/await}
      {:else}
        <TimeGridView
          dates={mode === 'week' ? weekDates(at, weekStartsOn) : [at]}
          {today}
          {nowMs}
          {focus}
          {items}
          {fmt}
          {timeZone}
          {editable}
          {canCreate}
          onOpen={openFromClick}
          {onDragStart}
          onCreateAt={createAt}
          onFocusSlot={(date, minute) => (focus = { date, minute })}
        />
      {/if}
    {/snippet}
  </QueryState>
  {#if expansion.truncated}
    <p class="border-t border-border px-3 py-1.5 text-xs text-muted-foreground" role="note">
      Showing the first 1,000 occurrences in this range.
    </p>
  {/if}
  <p class="sr-only" aria-live="polite" data-calendar-status>{announcement}</p>
</section>

{#if lazyDialog.current}
{@const AlertDialog = lazyDialog.current}
<AlertDialog
  bind:open={scopeOpen}
  title="Change a repeating event"
  description="Which events should this change apply to?"
  confirmLabel="Save"
  onConfirm={confirmScope}
  onCancel={cancelScope}
>
  <fieldset class="grid gap-2" data-scope-options>
    <legend class="sr-only">Apply to</legend>
    {#each [['this', 'This event'], ['following', 'This and following events'], ['all', 'All events']] as [value, text] (value)}
      <label class="flex items-center gap-2">
        <input type="radio" name="calendar-scope" value={value} checked={scope === value} onchange={() => (scope = value as EditScope)} />
        {text}
      </label>
    {/each}
  </fieldset>
</AlertDialog>
{/if}
