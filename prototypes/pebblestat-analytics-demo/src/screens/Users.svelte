<script lang="ts">
import {
  DrillDown,
  type DrillPath,
  drillStep,
  fromDrillQuery,
  toDrillQuery,
} from '@protoyard/analytics-ui/drill';
import { BarChart } from '@protoyard/charts-ui/cartesian';
import { avatarImage, Link, liveQuery, navigate, useClock } from '@protoyard/renderer-svelte';
import { Avatar, Badge, EmptyState, Skeleton } from '@protoyard/ui';
import PageHeader from '../components/PageHeader.svelte';
import { countBy } from '../domain/metrics.ts';
import { useAnalytics } from '../lib/context.ts';
import { fromNow } from '../lib/format.ts';
import { currentProject } from '../lib/project.svelte.ts';

/** `?drill=…` holds the drill path, so a reload or a shared link reopens the same slice. */
let { query }: { query?: URLSearchParams } = $props();

const { db } = useAnalytics();
const clock = useClock();

type UserRow = {
  id: string;
  plan: string;
  country: string;
  platform: string;
  createdAt: string;
  lastSeen: string;
  events: number;
  avatar?: string;
};

const DIMENSIONS = [
  { key: 'plan', label: 'plan' },
  { key: 'country', label: 'country' },
  { key: 'platform', label: 'platform' },
] as const;

// One pass over the project's events gives every user's event count and last activity.
const data = liveQuery(
  async () => {
    const projectId = currentProject.id;
    const [project, users, events] = await Promise.all([
      db.projects.get(projectId),
      db.users.where('projectId').equals(projectId).toArray(),
      db.events.where('projectId').equals(projectId).toArray(),
    ]);
    const stats = new Map<string, { events: number; last: string }>();
    for (const e of events) {
      const s = stats.get(e.userId) ?? { events: 0, last: '' };
      s.events++;
      if (e.at > s.last) s.last = e.at;
      stats.set(e.userId, s);
    }
    const rows: UserRow[] = users.map((u) => ({
      id: u.id,
      plan: String(u.properties.plan ?? '(none)'),
      country: String(u.properties.country ?? '(none)'),
      platform: String(u.properties.platform ?? '(none)'),
      createdAt: u.createdAt,
      lastSeen: stats.get(u.id)?.last || u.createdAt,
      events: stats.get(u.id)?.events ?? 0,
      ...(u.avatar ? { avatar: u.avatar } : {}),
    }));
    return { rows, rate: project?.sampleRate ?? 1 };
  },
  { initial: undefined, deps: () => currentProject.id }
);

const path = $derived<DrillPath>(query ? fromDrillQuery(query) : { steps: [] });
const next = $derived(DIMENSIONS.find((d) => !path.steps.some((s) => s.filter.property === d.key)));
const onchange = (p: DrillPath) => {
  const q = toDrillQuery(p);
  navigate(`/users${q ? `?${q}` : ''}`, { replace: true });
};
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
</script>

{#snippet userCell(row: UserRow)}
  <span class="flex items-center gap-2">
    <Avatar name={row.id} {...avatarImage(row.avatar)} size="xs" decorative />
    <Link href={`/users/${encodeURIComponent(row.id)}`} class="font-medium text-primary underline-offset-2 hover:underline">{row.id}</Link>
  </span>
{/snippet}

<PageHeader title="Users" description="Tracked users of this project. Select a bar to drill into a slice; select a user to see their events.">
  {#snippet actions()}
    {#if (data.current?.rate ?? 1) < 1}<Badge variant="outline">A {Math.round((data.current?.rate ?? 1) * 100)} % user sample</Badge>{/if}
  {/snippet}
</PageHeader>

{#if data.current === undefined}
  <Skeleton class="h-96 rounded-xl" aria-hidden="true" />
{:else if data.current.rows.length === 0}
  <EmptyState title="No tracked users yet" description="Users appear here when the product sends its first events." />
{:else}
  {@const rows = data.current.rows}
  <DrillDown
    title="Tracked users"
    {rows}
    {path}
    {onchange}
    getRowId={(r) => r.id}
    pageSize={12}
    columns={[
      { key: 'id', header: 'User', cell: userCell, accessor: (r) => r.id, sortable: true },
      { key: 'plan', header: 'Plan', accessor: (r) => capital(r.plan), sortable: true },
      { key: 'country', header: 'Country', accessor: (r) => r.country, sortable: true, hideBelow: 'sm' },
      { key: 'platform', header: 'Platform', accessor: (r) => r.platform, sortable: true, hideBelow: 'md' },
      { key: 'events', header: 'Events', accessor: (r) => r.events, sortable: true, align: 'right' },
      { key: 'lastSeen', header: 'Last seen', accessor: (r) => r.lastSeen, cell: lastSeenCell, sortable: true, hideBelow: 'sm' },
    ]}
  >
    {#snippet chart({ drill })}
      {#if next}
        {@const dim = next}
        {@const visible = rows.filter((r) => path.steps.every((s) => String(r[s.filter.property as keyof UserRow]) === String(s.filter.value)))}
        <BarChart
          title="Users by {dim.label}{path.steps.length ? ` (${path.steps.map((s) => s.label).join(', ')})` : ''}"
          series={[
            {
              id: 'users',
              label: 'Users',
              points: countBy(visible as never[], dim.key, 8).map((g) => ({ x: g.label, y: g.count, datum: g.key })),
            },
          ]}
          height={220}
          xHeader={capital(dim.label)}
          onselect={(s) => {
            if (s.datum !== '__other') drill(drillStep(dim.key, String(s.datum), `${capital(dim.label)}: ${String(s.datum)}`));
          }}
        />
      {:else}
        <p class="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
          Every dimension is drilled. Use the breadcrumb to go back up.
        </p>
      {/if}
    {/snippet}
  </DrillDown>
{/if}

{#snippet lastSeenCell(row: UserRow)}
  <time datetime={row.lastSeen}>{fromNow(row.lastSeen, clock.now)}</time>
{/snippet}
