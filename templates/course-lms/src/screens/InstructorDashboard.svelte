<script lang="ts">
import type { CartesianSeries } from '@protoyard/charts-ui/cartesian';
import { can, liveQuery } from '@protoyard/renderer-svelte';
import { Card, EmptyState, ErrorState, Skeleton } from '@protoyard/ui';
import { onMount } from 'svelte';
import { CAPABILITIES } from '../domain/policy.ts';
import { useCourseLms } from '../lib/context.ts';

const { db } = useCourseLms();
const authorized = $derived(can(CAPABILITIES.analyticsRead));
const report = liveQuery(
  async () => {
    const [courses, lessons, enrollments, progress, cohorts, sessions] = await Promise.all([
      db.courses.toArray(),
      db.lessons.toArray(),
      db.enrollments.toArray(),
      db.lessonProgress.toArray(),
      db.cohorts.toArray(),
      db.cohortSessions.toArray(),
    ]);
    return {
      courses: courses.sort((a, b) => a.title.localeCompare(b.title)),
      lessons,
      enrollments,
      progress,
      cohorts,
      sessions,
    };
  },
  { initial: undefined }
);

type LazyBarChart = typeof import('@protoyard/charts-ui/cartesian').BarChart;
let BarChart = $state<LazyBarChart | null>(null);
onMount(() => {
  if (authorized) {
    void import('@protoyard/charts-ui/cartesian').then((module) => {
      BarChart = module.BarChart;
    });
  }
});

const chartSeries = $derived.by(() => {
  const rows = report.current;
  if (!rows) return [];
  return [
    {
      id: 'completions',
      label: 'Lessons completed',
      points: rows.courses.map((course) => ({
        x: course.title,
        y: rows.progress.filter((progress) => progress.courseId === course.id).length,
      })),
    },
  ] satisfies CartesianSeries[];
});
const upcomingSessions = $derived(
  (report.current?.sessions ?? [])
    .filter((session) => session.status !== 'past')
    .sort((a, b) => a.start.localeCompare(b.start))
    .slice(0, 8)
);
</script>

<header class="mb-6">
  <p class="text-sm font-medium text-primary">Fieldnote Academy · instructor space</p>
  <h1 class="text-3xl font-semibold tracking-tight">Instructor overview</h1>
  <p class="mt-2 max-w-2xl text-muted-foreground">A simulated view of course enrollment, learner progress and cohort sessions.</p>
</header>

{#if !authorized}
  <ErrorState title="Instructor access required" message="Switch to an instructor persona to view learning analytics." />
{:else if report.error}
  <ErrorState title="Could not load instructor data" message={String(report.error)} />
{:else if report.current === undefined}
  <Skeleton class="h-72 w-full rounded-xl" />
{:else if report.current.courses.length === 0}
  <EmptyState title="No courses to report on" description="Publish a course to see learner progress and cohort sessions here." />
{:else}
  <div class="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(18rem,1fr)]">
    <Card class="space-y-4 p-5">
      <div>
        <h2 class="text-lg font-semibold">Learner progress</h2>
        <p class="text-sm text-muted-foreground">Completed lessons across enrolled students.</p>
      </div>
      {#if BarChart}
        <BarChart
          title="Completed lessons by course"
          description="Counts from this browser's simulated learning records."
          series={chartSeries}
          xKind="category"
          showTable
          height={300}
          emptyMessage="No completed lessons yet."
        />
      {:else}
        <Skeleton class="h-72 w-full rounded-lg" />
      {/if}
    </Card>

    <Card class="space-y-4 p-5">
      <div>
        <h2 class="text-lg font-semibold">Cohort schedule</h2>
        <p class="text-sm text-muted-foreground">Generated from the scenario seed and simulated date.</p>
      </div>
      {#if upcomingSessions.length === 0}
        <p class="text-sm text-muted-foreground">No upcoming cohort sessions.</p>
      {:else}
        <ol class="space-y-3">
          {#each upcomingSessions as session (session.id)}
            {@const cohort = report.current.cohorts.find((item) => item.id === session.cohortId)}
            {@const course = report.current.courses.find((item) => item.id === session.courseId)}
            <li class="rounded-lg border border-border p-3">
              <p class="font-medium">{cohort?.name ?? 'Cohort session'}</p>
              <p class="text-sm text-muted-foreground">{course?.title ?? 'Course'}</p>
              <time class="mt-1 block text-xs text-muted-foreground" datetime={session.start}>
                {new Date(session.start).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })} UTC · {session.durationMinutes} min
              </time>
            </li>
          {/each}
        </ol>
      {/if}
    </Card>
  </div>
{/if}
