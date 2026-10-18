<script lang="ts">
import { Coins, FlaskConical, Hash, History } from '@lucide/svelte';
import { getRuntime, liveQuery, useClock } from '@protoyard/renderer-svelte';
import { Skeleton, StatCard } from '@protoyard/ui';
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
  <Skeleton class="h-64 rounded-xl" />
{:else}
  <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
    <StatCard label="Runs" value={formatNumber(totals.runs)} hint={`${totals.failedRuns} not completed`} icon={History} />
    <StatCard label="Estimated tokens" value={formatNumber(totals.tokens)} icon={Hash} />
    <StatCard label="Estimated cost" value={formatCost(totals.costMicros)} icon={Coins} />
    <StatCard label="Eval pass rate" value={percent(pass.passed, pass.total)} hint={`${pass.passed}/${pass.total} cases, latest per dataset`} icon={FlaskConical} />
  </div>

  <section class="mt-6 rounded-xl border border-border bg-surface p-4 shadow-soft" aria-labelledby="daily-title">
    <h2 id="daily-title" class="font-medium">Runs per day (last 14 days)</h2>
    <ol class="mt-4 flex h-36 items-end gap-1.5" aria-label="Runs per day">
      {#each days as day (day.day)}
        <li class="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${day.day}: ${day.runs} runs, ${formatCost(day.costMicros)}`}>
          <span class="sr-only">{day.day}: {day.runs} runs</span>
          <span class="w-full rounded-t bg-primary/80" style={`height: ${(day.runs / peak) * 100}%; min-height: ${day.runs ? 4 : 1}px`}></span>
          <span class="text-[10px] text-muted-foreground" aria-hidden="true">{day.day.slice(8)}</span>
        </li>
      {/each}
    </ol>
  </section>

  <div class="mt-6 grid gap-6">
    {#each [{ title: 'By agent', rows: byAgent.map((r) => ({ key: r.agentId, ...r })) }, { title: 'By model', rows: byModel.map((r) => ({ key: r.modelId, ...r })) }] as table (table.title)}
      <section class="overflow-x-auto rounded-xl border border-border bg-surface shadow-soft">
        <table class="w-full text-sm">
          <caption class="px-4 pt-4 text-left font-medium">{table.title}</caption>
          <thead class="text-xs text-muted-foreground">
            <tr><th scope="col" class="px-4 py-2 text-left font-medium">Name</th><th scope="col" class="px-4 py-2 text-right font-medium">Runs</th><th scope="col" class="px-4 py-2 text-right font-medium">Tokens</th><th scope="col" class="px-4 py-2 text-right font-medium">Tool failures</th><th scope="col" class="px-4 py-2 text-right font-medium">Cost</th></tr>
          </thead>
          <tbody class="divide-y divide-border">
            {#each table.rows as row (row.key)}
              <tr>
                <td class="px-4 py-2">{row.name}</td>
                <td class="px-4 py-2 text-right tabular-nums">{formatNumber(row.runs)}</td>
                <td class="px-4 py-2 text-right tabular-nums">{formatNumber(row.tokens)}</td>
                <td class="px-4 py-2 text-right tabular-nums">{row.failedToolCalls}/{row.toolCalls}</td>
                <td class="px-4 py-2 text-right tabular-nums">{formatCost(row.costMicros)}</td>
              </tr>
            {:else}
              <tr><td colspan="5" class="px-4 py-6 text-center text-muted-foreground">No runs yet.</td></tr>
            {/each}
          </tbody>
        </table>
      </section>
    {/each}
  </div>
{/if}
