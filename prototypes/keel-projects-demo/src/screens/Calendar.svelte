<script lang="ts">
import { createRuntimeId } from '@protoyard/core';
import { liveQuery, usePrincipal } from '@protoyard/renderer-svelte';
import type { CalendarSeries } from '@protoyard/views/calendar';
import { type CalendarChange, CalendarView } from '@protoyard/views-ui/calendar';
import PageHeader from '../components/PageHeader.svelte';
import type { Ritual, RitualKind } from '../database/schema.ts';
import { CAPABILITIES } from '../domain/policy.ts';
import { useWorkspace } from '../lib/context.svelte.ts';

const workspace = useWorkspace();
const principal = usePrincipal();
type RitualData = { title: string; kind: RitualKind };

/** Studio rituals as calendar series: the rows already have the engine's shape. */
const rituals = liveQuery(() => workspace.db.rituals.toArray(), { initial: [] as Ritual[] });
const query = $derived({
  ...rituals,
  current: (rituals.current ?? []).map(
    (row): CalendarSeries<RitualData> => ({
      id: row.id,
      start: row.start,
      end: row.end,
      allDay: row.allDay,
      timeZone: row.timeZone,
      ...(row.rule ? { rule: row.rule } : {}),
      ...(row.exdates ? { exdates: row.exdates } : {}),
      ...(row.overrides ? { overrides: row.overrides } : {}),
      data: { title: row.title, kind: row.kind },
    })
  ),
});
const TONES = {
  standup: 'info',
  planning: 'primary',
  review: 'success',
  retro: 'warning',
  critique: 'neutral',
} as const;
// `principal` changes on persona switches, so the edit rights follow.
const canEdit = $derived(
  Boolean(principal.current) && workspace.runtime.session.can(CAPABILITIES.ritualsManage)
);
const anchor = workspace.runtime.clock
  .now()
  .toISOString()
  .slice(0, 10) as `${number}-${number}-${number}`;
</script>

<PageHeader
  title="Studio calendar"
  description={canEdit
    ? 'Sprint rituals repeat on their own. Drag one to move it; repeating rituals ask whether to change this one, the following ones or all.'
    : 'Sprint rituals for the whole studio. This persona can view the calendar but not move rituals.'}
/>
<CalendarView
  {query}
  {anchor}
  label="Studio rituals"
  timeZone="UTC"
  runtime={workspace.runtime}
  getTitle={(occurrence) => (occurrence.data as RitualData | undefined)?.title ?? 'Ritual'}
  getTone={(occurrence) => TONES[(occurrence.data as RitualData | undefined)?.kind ?? 'critique']}
  newId={(series) => `${series.id.split('~')[0]}~${createRuntimeId('split')}`}
  {...(canEdit
    ? { onChange: (change: CalendarChange<RitualData>) => workspace.services.rituals.apply(change.writes) }
    : {})}
/>
