<script lang="ts">
import { Button } from '@protoyard/ui';
import { DataGrid } from '@protoyard/views-ui/grid';

type Row = { id: string; name: string; team: string; score: number };
let stress = $state(false);
let revision = $state(0);
let edits = $state<Record<string, Partial<Row>>>({});
const rows = $derived.by((): Row[] => {
  const base = stress
    ? Array.from({ length: 100_000 }, (_, i) => ({
        id: `row-${i}`,
        name: `Record ${i + 1}`,
        team: ['Design', 'Engineering', 'Research'][i % 3] as string,
        score: i % 100,
      }))
    : [
        { id: 'r1', name: 'Launch readiness', team: 'Design', score: 92 },
        { id: 'r2', name: 'Search quality', team: 'Research', score: 87 },
        { id: 'r3', name: 'Mobile polish', team: 'Engineering', score: 96 },
      ];
  return base.map((row) => ({ ...row, ...edits[row.id] }));
});
const query = $derived({ current: rows, loading: false, error: null });
const columns = [
  {
    key: 'name',
    header: 'Name',
    type: 'text' as const,
    accessor: (row: Row) => row.name,
    editable: true,
  },
  { key: 'team', header: 'Team', type: 'text' as const, accessor: (row: Row) => row.team },
  { key: 'score', header: 'Score', type: 'number' as const, accessor: (row: Row) => row.score },
];
</script>
<div class="space-y-3"><div class="flex items-center gap-3"><Button size="sm" variant="outline" aria-pressed={stress} onclick={() => (stress = !stress)}>{stress ? 'Show sample rows' : 'Load 100,000 rows'}</Button><span class="text-sm text-muted-foreground">{rows.length.toLocaleString()} rows · revision {revision}</span></div><DataGrid {query} {columns} getRowId={(row) => row.id} height="24rem" onCommit={async (row, key, value) => { await Promise.resolve(); if (key === 'name' && typeof value === 'string') edits = { ...edits, [row.id]: { ...edits[row.id], name: value } }; revision += 1; }} /></div>
