<script lang="ts">
import type { CartesianSeries } from '@protoyard/charts-ui/cartesian';
import { can, liveQuery } from '@protoyard/renderer-svelte';
import { Card, EmptyState, ErrorState, Skeleton } from '@protoyard/ui';
import { onMount } from 'svelte';
import { Box, Heading, Text } from 'texuli/typography';
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
  <Text size="sm" weight="medium" tone="primary">Fieldnote Academy · instructor space</Text>
  <Heading level={1} size="xl">Instructor overview</Heading>
  <Text tone="muted" class="mt-2 max-w-2xl">A simulated view of course enrollment, learner progress and cohort sessions.</Text>
</header>

{#if !authorized}
  <ErrorState title="Instructor access required" message="Switch to an instructor persona to view learning analytics." />
{:else if report.error}
  <ErrorState title="Could not load instructor data" message={String(report.error)} />
{:else if report.current === undefined}
  <Skeleton class="h-72 w-full" />
{:else if report.current.courses.length === 0}
  <EmptyState title="No courses to report on" description="Publish a course to see learner progress and cohort sessions here." />
{:else}
  <div class="instructor-grid grid gap-5">
    <Card class="space-y-4 p-5">
      <div>
        <Heading level={2} size="md">Learner progress</Heading>
        <Text size="sm" tone="muted">Completed lessons across enrolled students.</Text>
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
        <Skeleton class="h-72 w-full" />
      {/if}
    </Card>

    <Card class="space-y-4 p-5">
      <div>
        <Heading level={2} size="md">Cohort schedule</Heading>
        <Text size="sm" tone="muted">Generated from the scenario seed and simulated date.</Text>
      </div>
      {#if upcomingSessions.length === 0}
        <Text size="sm" tone="muted">No upcoming cohort sessions.</Text>
      {:else}
        <ol class="space-y-3">
          {#each upcomingSessions as session (session.id)}
            {@const cohort = report.current.cohorts.find((item) => item.id === session.cohortId)}
            {@const course = report.current.courses.find((item) => item.id === session.courseId)}
            <li>
              <Box border="default" radius="lg" padding="none" class="p-3">
                <Text weight="medium">{cohort?.name ?? 'Cohort session'}</Text>
                <Text size="sm" tone="muted">{course?.title ?? 'Course'}</Text>
                <Text as="span" size="xs" tone="muted" class="mt-1 block">
                  <time datetime={session.start}>
                    {new Date(session.start).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })} UTC · {session.durationMinutes} min
                  </time>
                </Text>
              </Box>
            </li>
          {/each}
        </ol>
      {/if}
    </Card>
  </div>
{/if}

<style>
  @media (min-width: 80rem) {
    .instructor-grid {
      grid-template-columns: minmax(0, 1.4fr) minmax(18rem, 1fr);
    }
  }
</style>
