<script lang="ts">
import { Coins, FlaskConical, Hash, History } from '@lucide/svelte';
import { getRuntime, liveQuery, useClock } from '@protoyard/renderer-svelte';
import { Progress, Skeleton, StatCard } from '@protoyard/ui';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from 'texuli/table';
import { Box, Heading, Text } from 'texuli/typography';
import PageHeader from '../components/PageHeader.svelte';
import type { ConsoleDatabase } from '../database/schema.ts';
import { formatCost } from '../domain/agents.ts';
import {
  latestPassRate,
  runsPerDay,
  usageByAgent,
  usageByModel,
  usageTotals,
} from '../domain/usage.ts';
import { formatNumber, percent } from '../lib/format.ts';

const runtime = getRuntime<ConsoleDatabase>();
const clock = useClock();
const runs = liveQuery(() => runtime.db.runs.toArray(), { initial: [] });
const agents = liveQuery(() => runtime.db.agents.toArray(), { initial: [] });
const evaluations = liveQuery(() => runtime.db.evaluations.toArray(), { initial: [] });

const totals = $derived(usageTotals(runs.current ?? []));
const byAgent = $derived(usageByAgent(runs.current ?? [], agents.current ?? []));
const byModel = $derived(usageByModel(runs.current ?? []));
const days = $derived(runsPerDay(runs.current ?? [], clock.now));
const peak = $derived(Math.max(1, ...days.map((d) => d.runs)));
const pass = $derived(latestPassRate(evaluations.current ?? []));
</script>

<PageHeader title="Usage & cost" description="Estimated tokens and cost from simulated runs. Not provider billing." />

{#if runs.loading}
  <Skeleton class="h-64" />
{:else}
  <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
    <StatCard label="Runs" value={formatNumber(totals.runs)} hint={`${totals.failedRuns} not completed`} icon={History} />
    <StatCard label="Estimated tokens" value={formatNumber(totals.tokens)} icon={Hash} />
    <StatCard label="Estimated cost" value={formatCost(totals.costMicros)} icon={Coins} />
    <StatCard label="Eval pass rate" value={percent(pass.passed, pass.total)} hint={`${pass.passed}/${pass.total} cases, latest per dataset`} icon={FlaskConical} />
  </div>

  <Box as="section" surface="default" border="default" radius="xl" elevation="sm" padding="md" class="mt-6" aria-labelledby="daily-title">
    <Heading level={2} size="sm" id="daily-title">Runs per day (last 14 days)</Heading>
    <ol class="mt-4 grid gap-x-6 gap-y-2 sm:grid-cols-2" aria-label="Runs per day">
      {#each days as day (day.day)}
        <li class="flex items-center gap-3" title={`${day.day}: ${day.runs} runs, ${formatCost(day.costMicros)}`}>
          <Text as="span" size="xs" tone="muted" tabular class="w-20 shrink-0">{day.day}</Text>
          <Progress value={day.runs} max={peak} size="sm" ariaLabel={`${day.day}: ${day.runs} runs`} class="min-w-0 flex-1" />
          <Text as="span" size="xs" tabular align="end" class="w-6 shrink-0" aria-hidden="true">{day.runs}</Text>
        </li>
      {/each}
    </ol>
  </Box>

  <div class="mt-6 grid gap-6">
    {#each [{ title: 'By agent', rows: byAgent.map((r) => ({ key: r.agentId, ...r })) }, { title: 'By model', rows: byModel.map((r) => ({ key: r.modelId, ...r })) }] as table (table.title)}
      <Box as="section" surface="default" border="default" radius="xl" elevation="sm" padding="none" class="overflow-x-auto">
        <Table class="w-full">
          <TableCaption>{table.title}</TableCaption>
          <TableHeader>
            <TableRow><TableHead scope="col">Name</TableHead><TableHead scope="col" numeric>Runs</TableHead><TableHead scope="col" numeric>Tokens</TableHead><TableHead scope="col" numeric>Tool failures</TableHead><TableHead scope="col" numeric>Cost</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {#each table.rows as row (row.key)}
              <TableRow>
                <TableCell>{row.name}</TableCell>
                <TableCell numeric>{formatNumber(row.runs)}</TableCell>
                <TableCell numeric>{formatNumber(row.tokens)}</TableCell>
                <TableCell numeric>{row.failedToolCalls}/{row.toolCalls}</TableCell>
                <TableCell numeric>{formatCost(row.costMicros)}</TableCell>
              </TableRow>
            {:else}
              <TableRow><TableCell colspan={5} align="center"><Text as="span" size="sm" tone="muted">No runs yet.</Text></TableCell></TableRow>
            {/each}
          </TableBody>
        </Table>
      </Box>
    {/each}
  </div>
{/if}
