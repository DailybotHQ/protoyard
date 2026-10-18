import type { Agent, Evaluation, Run } from '../database/schema.ts';
import { modelFor } from './agents.ts';

/** Pure aggregations behind the usage dashboard (tested without a browser). */

export interface UsageTotals {
  runs: number;
  tokens: number;
  costMicros: number;
  failedRuns: number;
  toolCalls: number;
  failedToolCalls: number;
}

const empty = (): UsageTotals => ({
  runs: 0,
  tokens: 0,
  costMicros: 0,
  failedRuns: 0,
  toolCalls: 0,
  failedToolCalls: 0,
});

function add(total: UsageTotals, run: Run) {
  total.runs++;
  total.tokens += run.promptTokens + run.completionTokens;
  total.costMicros += run.costMicros;
  if (run.status !== 'completed') total.failedRuns++;
  total.toolCalls += run.toolResults.length;
  total.failedToolCalls += run.toolResults.filter((t) => t.status === 'failed').length;
}

export function usageTotals(runs: readonly Run[]): UsageTotals {
  const total = empty();
  for (const run of runs) add(total, run);
  return total;
}

export function usageByAgent(runs: readonly Run[], agents: readonly Agent[]) {
  const names = new Map(agents.map((a) => [a.id, a.name]));
  const groups = new Map<string, UsageTotals>();
  for (const run of runs) {
    const total = groups.get(run.agentId) ?? empty();
    add(total, run);
    groups.set(run.agentId, total);
  }
  return [...groups]
    .map(([agentId, total]) => ({ agentId, name: names.get(agentId) ?? 'Deleted agent', ...total }))
    .sort((a, b) => b.costMicros - a.costMicros || a.name.localeCompare(b.name));
}

export function usageByModel(runs: readonly Run[]) {
  const groups = new Map<string, UsageTotals>();
  for (const run of runs) {
    const total = groups.get(run.modelId) ?? empty();
    add(total, run);
    groups.set(run.modelId, total);
  }
  return [...groups]
    .map(([modelId, total]) => ({ modelId, name: modelFor(modelId).name, ...total }))
    .sort((a, b) => b.costMicros - a.costMicros);
}

/** Runs per UTC day for the `days` days ending at `now` (oldest first). */
export function runsPerDay(runs: readonly Run[], now: Date, days = 14) {
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Array.from({ length: days }, (_, i) => {
    const day = new Date(end - (days - 1 - i) * 86_400_000).toISOString().slice(0, 10);
    const today = runs.filter((r) => r.createdAt.slice(0, 10) === day);
    return { day, runs: today.length, costMicros: today.reduce((sum, r) => sum + r.costMicros, 0) };
  });
}

/** Pass rate over each dataset's latest evaluation. */
export function latestPassRate(evaluations: readonly Evaluation[]) {
  const latest = new Map<string, Evaluation>();
  for (const e of evaluations) {
    const current = latest.get(e.datasetId);
    if (!current || current.createdAt < e.createdAt) latest.set(e.datasetId, e);
  }
  let passed = 0;
  let total = 0;
  for (const e of latest.values()) {
    passed += e.passed;
    total += e.passed + e.failed;
  }
  return { passed, total };
}
