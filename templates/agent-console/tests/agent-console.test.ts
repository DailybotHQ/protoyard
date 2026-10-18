import type { AgentStep } from '@protoyard/ai';
import { PermissionDeniedError, type PrototypeRuntime, ValidationError } from '@protoyard/core';
import {
  createGenerateContextAsync,
  PRESETS,
  resolveScenarios,
  validateWorld,
} from '@protoyard/scenarios';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import type { Agent, ConsoleDatabase, Evaluation, Run } from '../src/database/schema.ts';
import { composeAnswer, formatCost, judgeCase, usageFor } from '../src/domain/agents.ts';
import { createConsoleServices } from '../src/domain/services.ts';
import { latestPassRate, runsPerDay, usageByAgent, usageTotals } from '../src/domain/usage.ts';
import { definition } from '../src/prototype.ts';
import { generateConsoleWorld } from '../src/scenarios/generators.ts';

const resolved = resolveScenarios(definition.scenarios, PRESETS);
const scenario = (id: string) => {
  const s = resolved.find((x) => x.id === id);
  if (!s) throw new Error(id);
  return s;
};
const world = async (id: string) =>
  generateConsoleWorld(await createGenerateContextAsync(scenario(id)));

describe('agent-console generator', () => {
  it('is deterministic and referentially sound for every scenario', async () => {
    for (const s of resolved) {
      const a = await generateConsoleWorld(await createGenerateContextAsync(s));
      const b = await generateConsoleWorld(await createGenerateContextAsync(s));
      expect(a).toEqual(b);
      expect(a.personas.some((p) => p.id === s.actor.id)).toBe(true);
      expect(validateWorld(a, { ...definition.integrity, referenceTime: s.referenceTime })).toEqual(
        []
      );
    }
  });

  it('seeds nothing for the empty scenario and a full platform for active', async () => {
    const empty = await world('empty');
    expect(Object.values(empty.tables).every((rows) => rows.length === 0)).toBe(true);
    const active = await world('active');
    expect(active.tables.agents).toHaveLength(3);
    expect(active.tables.datasets).toHaveLength(3);
    expect(active.tables.evaluations).toHaveLength(3);
    const runs = active.tables.runs as Run[];
    expect(runs.filter((r) => r.source === 'playground')).toHaveLength(18);
    expect(runs.filter((r) => r.source === 'evaluation')).toHaveLength(9);
  });

  it('stores genuine step traces from the simulated runner', async () => {
    const runs = (await world('active')).tables.runs as Run[];
    for (const run of runs) {
      expect(run.steps[0]?.type).toBe('plan');
      expect(run.steps.at(-1)?.type).toBe('answer');
      expect(run.steps.map((s) => s.sequence)).toEqual(run.steps.map((_, i) => i + 1));
      expect(Number.isInteger(run.costMicros)).toBe(true);
    }
    // The scheduling assistant requires approval for calendar lookups.
    const approvals = runs.flatMap((r) => r.steps).filter((s) => s.type === 'approval-requested');
    expect(approvals.length).toBeGreaterThan(0);
    expect(runs.some((r) => r.toolResults.some((t) => t.status === 'rejected'))).toBe(true);
  });
});

describe('pure helpers', () => {
  const run = (over: Partial<Run> = {}) =>
    ({
      status: 'completed',
      answer: 'Found Jordan Lee',
      toolResults: [{ tool: 'crm.lookup', status: 'succeeded' }],
      ...over,
    }) as Run;

  it('judges cases on status, expected tool and expected text', () => {
    expect(judgeCase({ expectTool: 'crm.lookup', expectText: 'jordan' }, run())).toEqual({
      pass: true,
      reasons: [],
    });
    expect(judgeCase({ expectTool: 'search', expectText: null }, run()).reasons).toEqual([
      'Expected a call to search.',
    ]);
    expect(
      judgeCase(
        { expectTool: 'crm.lookup', expectText: 'Taylor' },
        run({ status: 'cancelled', toolResults: [{ tool: 'crm.lookup', status: 'rejected' }] })
      ).reasons
    ).toEqual([
      'Run ended as cancelled.',
      'crm.lookup was rejected.',
      'Answer does not mention “Taylor”.',
    ]);
  });

  it('estimates usage in integer micro-dollars from the model price', () => {
    const usage = usageFor(
      { instructions: 'x'.repeat(40), modelId: 'py-orbit-pro' },
      'y'.repeat(20),
      { answer: 'z'.repeat(8), steps: [] }
    );
    // 10 + 5 prompt tokens at $2/M, 2 completion tokens at $8/M.
    expect(usage).toEqual({ promptTokens: 15, completionTokens: 2, costMicros: 46 });
    expect(formatCost(46)).toBe('<$0.0001');
    expect(formatCost(0)).toBe('$0.00');
    expect(formatCost(1_234)).toBe('$0.0012');
    expect(formatCost(1_234_567)).toBe('$1.23');
    expect(composeAnswer({ name: 'Bot' }, 'hi', [])).toContain('answered without tools');
  });

  it('aggregates usage per agent and per day', async () => {
    const active = await world('active');
    const runs = active.tables.runs as Run[];
    const totals = usageTotals(runs);
    expect(totals.runs).toBe(runs.length);
    const byAgent = usageByAgent(runs, active.tables.agents as Agent[]);
    expect(byAgent.reduce((sum, a) => sum + a.runs, 0)).toBe(runs.length);
    const days = runsPerDay(runs, new Date(scenario('active').referenceTime), 60);
    expect(days).toHaveLength(60);
    expect(days.reduce((sum, d) => sum + d.runs, 0)).toBe(runs.length);
    const pass = latestPassRate(active.tables.evaluations as Evaluation[]);
    expect(pass.total).toBe(9);
  });
});

describe('agent-console services (real runtime)', () => {
  let harness = createHarness<ConsoleDatabase>(definition);
  beforeEach(() => {
    harness = createHarness<ConsoleDatabase>(definition);
  });
  afterEach(() => harness.closeAll());

  async function boot(id = 'active') {
    const runtime = await harness.boot(id);
    await runtime.scenarios.load(id);
    return { runtime, services: createConsoleServices(runtime) };
  }
  const snapshot = async (runtime: PrototypeRuntime<ConsoleDatabase>) =>
    JSON.stringify(
      await Promise.all([
        runtime.db.agents.toArray(),
        runtime.db.runs.toArray(),
        runtime.db.datasets.toArray(),
        runtime.db.evaluations.toArray(),
      ])
    );
  const agentInput = {
    name: 'Billing helper',
    description: 'Answers billing questions',
    instructions: 'Look up the customer, then answer.',
    modelId: 'py-orbit-small',
    tools: ['crm.lookup' as const, 'search' as const],
    approvalTools: ['crm.lookup' as const],
  };

  it('creates and edits agents that persist across a reload, with field-keyed validation', async () => {
    const { runtime, services } = await boot();
    const agent = await services.agents.create(agentInput);
    expect(agent.id).toMatch(/^agent_u/);
    await services.agents.update(agent.id, { ...agentInput, name: 'Billing bot' });
    const reloaded = await harness.reload(runtime);
    expect((await reloaded.db.agents.get(agent.id))?.name).toBe('Billing bot');

    const error = await services.agents
      .create({ ...agentInput, name: 'x', approvalTools: ['code.run'] })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).issues).toEqual({
      name: 'Name must have at least 2 characters',
      approvalTools: 'Approval can only be required for enabled tools',
    });
  });

  it('runs the playground with approval, persists the trace and reports usage', async () => {
    const { runtime, services } = await boot();
    const agent = await services.agents.create(agentInput);
    const seen: AgentStep[] = [];
    const { handle, saved } = await services.playground.start(
      agent.id,
      { prompt: 'Look up the customer Jordan Lee' },
      (step) => {
        seen.push(step);
        if (step.type === 'approval-requested') queueMicrotask(() => handle.approve());
      }
    );
    const run = await saved;
    expect(run.status).toBe('completed');
    // "look up" plans a search; "customer" plans the CRM lookup, which needs approval.
    expect(seen.map((s) => [s.type, s.tool ?? null])).toEqual([
      ['plan', null],
      ['tool-call', 'search'],
      ['tool-result', 'search'],
      ['tool-call', 'crm.lookup'],
      ['approval-requested', 'crm.lookup'],
      ['approval-granted', 'crm.lookup'],
      ['tool-result', 'crm.lookup'],
      ['answer', null],
    ]);
    expect(run.answer).toContain('All tool calls succeeded.');
    expect(run.promptTokens).toBeGreaterThan(0);
    expect(await runtime.db.runs.get(run.id)).toEqual(run);
  });

  it('records rejected approvals and cancelled runs honestly', async () => {
    const { services } = await boot();
    const agent = await services.agents.create(agentInput);
    const rejected = await services.playground.start(
      agent.id,
      { prompt: 'Find customer Taylor' },
      (step) => {
        if (step.type === 'approval-requested')
          queueMicrotask(() => rejected.handle.reject('Not now'));
      }
    );
    const r = await rejected.saved;
    expect(r.toolResults).toEqual([
      { tool: 'search', status: 'succeeded' },
      { tool: 'crm.lookup', status: 'rejected', error: 'Not now' },
    ]);
    expect(r.answer).toContain('approval was declined');

    const cancelled = await services.playground.start(
      agent.id,
      { prompt: 'Look up customer Cedar' },
      (step) => {
        if (step.type === 'approval-requested') queueMicrotask(() => cancelled.handle.cancel());
      }
    );
    expect((await cancelled.saved).status).toBe('cancelled');
  });

  it('denies a viewer in the service layer and writes nothing', async () => {
    const { runtime, services } = await boot('viewer');
    const before = await snapshot(runtime);
    const [agent] = await runtime.db.agents.toArray();
    const [dataset] = await runtime.db.datasets.toArray();
    await expect(services.agents.create(agentInput)).rejects.toBeInstanceOf(PermissionDeniedError);
    await expect(services.agents.remove(agent!.id)).rejects.toBeInstanceOf(PermissionDeniedError);
    await expect(services.playground.start(agent!.id, { prompt: 'hi' })).rejects.toBeInstanceOf(
      PermissionDeniedError
    );
    await expect(services.evaluations.run(dataset!.id)).rejects.toBeInstanceOf(
      PermissionDeniedError
    );
    expect(await snapshot(runtime)).toBe(before);
  });

  it('lets a builder run agents but not delete them', async () => {
    const { runtime, services } = await boot('member');
    const [agent] = await runtime.db.agents.toArray();
    await expect(services.agents.remove(agent!.id)).rejects.toMatchObject({
      capability: 'agents:delete',
    });
    const { saved } = await services.playground.start(agent!.id, {
      prompt: 'Search the onboarding guide',
    });
    expect((await saved).status).toBe('completed');
  });

  it('fails offline before anything starts and shows tool outages as failed steps', async () => {
    const { runtime, services } = await boot();
    const [agent] = await runtime.db.agents.toArray();
    const before = await snapshot(runtime);
    await runtime.overrides.set({ environment: { network: 'offline' } });
    await expect(
      services.playground.start(agent!.id, { prompt: 'Search guides' })
    ).rejects.toMatchObject({
      code: 'offline',
    });
    await expect(services.agents.create(agentInput)).rejects.toMatchObject({ code: 'offline' });
    expect(await snapshot(runtime)).toBe(before);

    await runtime.overrides.set({
      environment: {
        network: 'online',
        failureMode: 'server-error',
        failureRate: 1,
        failureScope: ['ai.agent.tool.'],
      },
    });
    const { saved } = await services.playground.start(agent!.id, {
      prompt: 'Search the onboarding guide',
    });
    const run = await saved;
    expect(run.status).toBe('completed');
    expect(run.steps.some((s) => s.type === 'tool-failure')).toBe(true);
    expect(run.toolResults.every((t) => t.status === 'failed')).toBe(true);
  });

  it('runs evaluations deterministically and stores one run per case atomically', async () => {
    const { runtime, services } = await boot();
    const dataset = await services.datasets.create({
      agentId: (await runtime.db.agents.toArray())[0]!.id,
      name: 'Smoke',
    });
    await expect(services.evaluations.run(dataset.id)).rejects.toThrow('Add at least one case');
    await expect(services.datasets.addCase(dataset.id, { prompt: 'hello' })).rejects.toMatchObject({
      issues: { expectText: 'Add an expected tool or expected text so the case can pass or fail' },
    });
    const pass = await services.datasets.addCase(dataset.id, {
      prompt: 'Look up the customer Jordan Lee',
      expectTool: 'crm.lookup',
    });
    await services.datasets.addCase(dataset.id, { prompt: 'Say hi', expectText: 'Taylor' });

    const first = await services.evaluations.run(dataset.id);
    const second = await services.evaluations.run(dataset.id);
    expect(first).toMatchObject({ passed: 1, failed: 1 });
    expect(second.results.map((r) => [r.pass, r.reasons])).toEqual(
      first.results.map((r) => [r.pass, r.reasons])
    );
    // Primary keys are random runtime ids, so order runs by their prompt before comparing.
    const runsOf = async (e: Evaluation) =>
      (await runtime.db.runs.where('evaluationId').equals(e.id).toArray()).sort((a, b) =>
        a.prompt.localeCompare(b.prompt)
      );
    const steps = async (e: Evaluation) =>
      (await runsOf(e)).map((r) => r.steps.map((s) => [s.id, s.type, s.message]));
    expect(await steps(second)).toEqual(await steps(first));
    expect(await runsOf(first)).toHaveLength(2);

    await services.datasets.removeCase(dataset.id, pass.id);
    expect((await runtime.db.datasets.get(dataset.id))?.cases).toHaveLength(1);
    await services.datasets.remove(dataset.id);
    expect(await runtime.db.evaluations.where('datasetId').equals(dataset.id).count()).toBe(0);
    expect(await runsOf(first)).toHaveLength(0);
  });

  it('deletes an agent with its runs, datasets and evaluations in one transaction', async () => {
    const { runtime, services } = await boot();
    const [agent] = await runtime.db.agents.toArray();
    await services.agents.remove(agent!.id);
    expect(await runtime.db.agents.get(agent!.id)).toBeUndefined();
    for (const table of [runtime.db.runs, runtime.db.datasets, runtime.db.evaluations]) {
      expect(await table.where('agentId').equals(agent!.id).count()).toBe(0);
    }
    expect(await runtime.db.agents.count()).toBe(2);
  });
});
