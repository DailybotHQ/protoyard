<script lang="ts">
import type { Blueprint, EntityInput, EntityServices } from '@protoyard/blueprint';
import type { PrototypeRuntime, Row } from '@protoyard/core';
import { can, liveQuery, navigate, usePrincipal } from '@protoyard/renderer-svelte';
import { Dialog } from '@protoyard/ui';
import type { CalendarSeries } from '@protoyard/views/calendar';
import { type CalendarChange, type CalendarSlot, CalendarView } from '@protoyard/views-ui/calendar';
import EntityForm from '../../EntityForm.svelte';
import { formatEntityHeading } from '../../format.ts';
import {
  type CalendarScreenSpec,
  prefillFor,
  type RecordEvent,
  reschedulePatch,
  rowToSeries,
  toneFor,
} from './model.ts';

/**
 * A blueprint `calendar` screen: the entity's records on month, week, day and
 * agenda views by `dateField` (and `endField`). Moving an event updates the
 * record through its entity service; an empty slot opens the create form
 * prefilled with that date. Today and the now-line follow the runtime clock.
 */
let {
  runtime,
  blueprint,
  services,
  screen,
  title,
  onOpenRecord,
}: {
  runtime: PrototypeRuntime;
  blueprint: Blueprint;
  services: EntityServices;
  screen: CalendarScreenSpec;
  title?: string;
  /** Default: the record's detail route, `#/<plural>/<id>`. */
  onOpenRecord?: (row: Row) => void;
} = $props();

// svelte-ignore state_referenced_locally
const entity = blueprint.entities.find((e) => e.name === screen.entity);
// svelte-ignore state_referenced_locally
if (!entity) throw new RangeError(`calendar screen: unknown entity "${screen.entity}"`);
// svelte-ignore state_referenced_locally
const service = services[screen.entity];
// svelte-ignore state_referenced_locally
if (!service) throw new RangeError(`calendar screen: no service for "${screen.entity}"`);

// svelte-ignore state_referenced_locally
const principal = usePrincipal(runtime);
const timeZone = $derived(principal.current?.persona.timezone ?? 'UTC');
const locale = $derived(principal.current?.persona.locale ?? 'en-US');
const label = $derived(title ?? `${formatEntityHeading(entity)} calendar`);
const colorField = $derived(entity.fields.find((f) => f.name === screen.colorBy));
const canUpdate = $derived(
  can(`${entity.name}:update`, undefined, runtime) ||
    can(`${entity.name}:update:own`, undefined, runtime)
);
const canCreate = $derived(can(`${entity.name}:create`, undefined, runtime));

/** The blueprint's view, or the agenda list on phones (below 640 px). */
// svelte-ignore state_referenced_locally
const initialView =
  typeof matchMedia === 'function' && matchMedia('(max-width: 639.98px)').matches
    ? 'agenda'
    : screen.view;
const SWATCH = {
  primary: 'bg-primary',
  info: 'bg-info',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-destructive',
  neutral: 'bg-muted-foreground',
} as const;

let attempt = $state(0);
const rows = liveQuery(() => service.list(), {
  initial: undefined,
  deps: () => [attempt, principal.current?.persona.id],
});

/** Rows as series; the same `loading` / `error` as the rows query, for QueryState. */
const series = $derived(
  (rows.current ?? []).flatMap((row) => {
    const one = rowToSeries(row, entity, screen, timeZone);
    return one ? [one] : [];
  })
);
const undated = $derived((rows.current?.length ?? 0) - series.length);
const query = {
  get current(): CalendarSeries<RecordEvent>[] | undefined {
    return rows.current === undefined ? undefined : series;
  },
  get loading() {
    return rows.loading;
  },
  get error() {
    return rows.error;
  },
};

async function reschedule(change: CalendarChange<RecordEvent>) {
  // One record per event: a plain update (session.assert → zod → environment.run → db.transaction).
  await service?.update(
    change.occurrence.seriesId,
    reschedulePatch(entity as never, screen, change)
  );
}

let formOpen = $state(false);
let prefill = $state<Row | null>(null);
let formKey = $state(0);

function startCreate(slot: CalendarSlot): false {
  prefill = prefillFor(entity as never, screen, slot);
  formKey += 1;
  formOpen = true;
  return false;
}

async function create(input: EntityInput) {
  await service?.create(input);
  formOpen = false;
}

function open(row: Row) {
  if (onOpenRecord) onOpenRecord(row);
  else navigate(`/${entity?.plural}/${encodeURIComponent(String(row.id))}`);
}
</script>

<div class="grid gap-3" data-calendar-screen={entity.name}>
  <CalendarView
    {query}
    {label}
    {runtime}
    {timeZone}
    {locale}
    view={initialView}
    getTitle={(o) => o.data?.title ?? 'Untitled'}
    getTone={(o) => toneFor(colorField, o.data?.row[screen.colorBy ?? ''])}
    onChange={canUpdate ? reschedule : undefined}
    onCreate={canCreate ? startCreate : undefined}
    onOpen={(o) => o.data && open(o.data.row)}
    onRetry={() => attempt++}
  />
  {#if undated > 0}
    <p class="text-sm text-muted-foreground" data-undated>
      {undated} {undated === 1 ? 'record has' : 'records have'} no {screen.dateField} yet and {undated === 1 ? 'is' : 'are'} not on the calendar.
    </p>
  {/if}
  {#if colorField?.kind === 'enum'}
    <ul class="flex flex-wrap gap-3 text-xs text-muted-foreground" aria-label={`Colors by ${colorField.label ?? colorField.name}`}>
      {#each colorField.values as value (value)}
        <li class="flex items-center gap-1.5">
          <span
            class={['size-2.5 rounded-full', SWATCH[toneFor(colorField, value)]]}
            data-tone={toneFor(colorField, value)}
            aria-hidden="true"
          ></span>
          {colorField.labels?.[value] ?? value}
        </li>
      {/each}
    </ul>
  {/if}
</div>

<Dialog bind:open={formOpen} title={`New ${formatEntityHeading(entity).toLowerCase().replace(/s$/, '')}`} size="lg">
  {#key formKey}
    <EntityForm
      {entity}
      mode="create"
      initial={prefill}
      {runtime}
      {blueprint}
      {services}
      submitLabel="Create"
      onSubmit={create}
      onCancel={() => (formOpen = false)}
    />
  {/key}
</Dialog>
