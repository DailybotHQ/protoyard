<script lang="ts">
import { liveQuery, useClock } from '@protoyard/renderer-svelte';
import { Card, EmptyState, ErrorState, Skeleton } from '@protoyard/ui';
import { routeLength } from '@protoyard/views/map';
import type { ScheduleTask } from '@protoyard/views/timeline';
import { onMount } from 'svelte';
import { useLogistics } from '../lib/context.svelte.ts';

const { db, runtime } = useLogistics();
const clock = useClock();
type ShipmentSchedule = ScheduleTask & { title: string; progress: number };
type TimelineComponent = typeof import('@protoyard/views-ui/timeline').TimelineView;
let ShipmentTimeline = $state<TimelineComponent | null>(null);
onMount(() => {
  void import('@protoyard/views-ui/timeline').then((module) => {
    ShipmentTimeline = module.TimelineView;
  });
});
const query = liveQuery(
  async (): Promise<ShipmentSchedule[]> => {
    const rows = await db.shipments.toArray();
    return rows
      .filter((row) => row.status !== 'delivered')
      .map((row) => ({
        id: row.id,
        title: `${row.reference} · ${row.description}`,
        start: (row.dispatchedAt ?? row.createdAt).slice(0, 10) as ScheduleTask['start'],
        end: row.dueAt.slice(0, 10) as ScheduleTask['end'],
        progress:
          row.status === 'in-transit' && row.dispatchedAt
            ? Math.max(
                0,
                Math.min(
                  1,
                  ((clock.now.getTime() - Date.parse(row.dispatchedAt)) * (32 / 3.6)) /
                    Math.max(1, routeLength(row.route))
                )
              )
            : 0,
      }));
  },
  { initial: [] }
);
</script>

<header class="mb-5"><h1 class="text-2xl font-semibold tracking-tight">Route timeline</h1><p class="mt-1 text-sm text-muted-foreground">Shipment windows and completion progress follow the simulated clock.</p></header>
{#if query.loading}<Skeleton class="h-96 w-full rounded-xl" />{:else if query.error}<ErrorState title="Could not load route timeline" message={String(query.error)} />{:else if query.current?.length}<Card class="overflow-hidden p-3 sm:p-5">{#if ShipmentTimeline}<ShipmentTimeline {query} dependencies={[]} label="Shipment route timeline" now={clock.now} {runtime} getTitle={(row: ShipmentSchedule) => row.title} getProgress={(row: ShipmentSchedule) => (row.progress ?? 0) * 100} />{:else}<Skeleton class="h-80 w-full" />{/if}</Card>{:else}<EmptyState title="No active routes" description="Dispatch a shipment to add its delivery window to the route timeline." />{/if}
