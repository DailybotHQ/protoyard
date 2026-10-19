<script lang="ts">
import { BarChart, seriesFromRows } from '@protoyard/charts-ui/cartesian';
import DrillDown from '../../src/drill/DrillDown.svelte';
import { type DrillPath, drillStep, fromDrillQuery, toDrillQuery } from '../../src/drill/model.ts';

type Ticket = { id: string; subject: string; priority: string; team: string };

let { rows, query = '' }: { rows: Ticket[]; query?: string } = $props();

// The path lives in the (simulated) hash query, so a reload restores it.
// svelte-ignore state_referenced_locally
let hash = $state(query);
const path = $derived(fromDrillQuery(hash));
const byPriority = $derived(
  ['low', 'normal', 'high'].map((priority) => ({
    priority,
    count: rows.filter((r) => r.priority === priority).length,
  }))
);
const onchange = (next: DrillPath) => {
  hash = toDrillQuery(next);
};
</script>

<output data-hash>{hash}</output>
<DrillDown
  title="Tickets"
  {rows}
  {path}
  {onchange}
  getRowId={(r) => r.id}
  columns={[
    { key: 'subject', header: 'Subject', accessor: (r) => r.subject },
    { key: 'priority', header: 'Priority', accessor: (r) => r.priority },
    { key: 'team', header: 'Team', accessor: (r) => r.team },
  ]}
>
  {#snippet chart({ drill })}
    <BarChart
      title="Tickets by priority"
      series={seriesFromRows(byPriority, {
        x: (r) => r.priority,
        series: [{ id: 'tickets', label: 'Tickets', y: (r) => r.count }],
      })}
      onselect={(s) => drill(drillStep('priority', (s.datum as { priority: string }).priority))}
    />
  {/snippet}
</DrillDown>
