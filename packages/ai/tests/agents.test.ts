import { createRng, createSimulationEnvironment } from '@protoyard/core';
import { describe, expect, it } from 'vitest';
import { type AgentPlan, createAiAgentRunner } from '../src/agents.ts';
import {
  createDefaultAiTools,
  createSimulatedCodeTool,
  defineAiTool,
  serviceAiTool,
} from '../src/tools.ts';
import type { AiContext } from '../src/types.ts';

function context(seed: number | string = 42): AiContext {
  const now = new Date('2026-10-17T12:00:00.000Z');
  return {
    seed,
    rng: createRng(seed),
    clock: { now: () => now, nowMs: () => now.getTime(), sleep: async () => {} },
    environment: createSimulationEnvironment({ sleep: async () => {} }),
  };
}

async function waitFor(predicate: () => boolean) {
  for (let attempt = 0; attempt < 20 && !predicate(); attempt++) await Promise.resolve();
  expect(predicate()).toBe(true);
}

const planned = (tool: string, input: unknown, requiresApproval?: boolean): AgentPlan => ({
  goal: `Use ${tool}.`,
  calls: [{ tool, input, ...(requiresApproval !== undefined ? { requiresApproval } : {}) }],
});

describe('simulated agent runs', () => {
  it('records plan, tool call, result, and answer steps using injected services', async () => {
    let invoked = 0;
    const lookup = serviceAiTool<{ query: string }, { count: number }>({
      name: 'crm.lookup',
      description: 'Look up a simulated CRM record.',
      service: 'crm.find',
      parseInput(input) {
        if (
          !input ||
          typeof input !== 'object' ||
          typeof (input as { query?: unknown }).query !== 'string'
        ) {
          throw new TypeError('query required');
        }
        return { query: (input as { query: string }).query };
      },
    });
    const observed: string[] = [];
    const runner = createAiAgentRunner({
      context: context(),
      tools: [lookup],
      services: {
        'crm.find': (input) => {
          invoked++;
          const query = (input as { query: string }).query;
          return { count: String(query).length };
        },
      },
      planner: () => planned('crm.lookup', { query: 'Jordan' }),
      onStep: (step) => observed.push(step.type),
    });
    const run = runner.start('find the customer');
    const result = await run.done;
    expect(result.status).toBe('completed');
    expect(result.toolResults[0]?.output).toEqual({ count: 6 });
    expect(result.steps.map((step) => step.type)).toEqual([
      'plan',
      'tool-call',
      'tool-result',
      'answer',
    ]);
    expect(observed).toEqual(result.steps.map((step) => step.type));
    expect(invoked).toBe(1);
  });

  it('pauses before an approval-required tool and resumes when approved', async () => {
    let calls = 0;
    const write = defineAiTool({
      name: 'crm.note',
      description: 'Add a simulated CRM note.',
      requiresApproval: true,
      execute: () => {
        calls++;
        return 'note saved through service';
      },
    });
    const runner = createAiAgentRunner({
      context: context(),
      tools: [write],
      planner: () => planned('crm.note', { text: 'Follow up' }),
    });
    const run = runner.start('add a note');
    await waitFor(() => run.status === 'awaiting-approval');
    expect(calls).toBe(0);
    expect(run.steps.at(-1)?.type).toBe('approval-requested');
    run.approve();
    const result = await run.done;
    expect(result.status).toBe('completed');
    expect(calls).toBe(1);
    expect(result.steps.map((step) => step.type)).toContain('approval-granted');
  });

  it('turns rejected approval into a graceful answer without running the tool', async () => {
    let calls = 0;
    const write = defineAiTool({
      name: 'calendar.create',
      description: 'Create a simulated event.',
      requiresApproval: true,
      execute: () => {
        calls++;
        return 'created';
      },
    });
    const runner = createAiAgentRunner({
      context: context(),
      tools: [write],
      planner: () => planned('calendar.create', {}),
    });
    const run = runner.start('create an event');
    await waitFor(() => run.status === 'awaiting-approval');
    run.reject('Not this time.');
    const result = await run.done;
    expect(result.status).toBe('completed');
    expect(result.answer).toContain('approval was declined');
    expect(result.toolResults[0]?.status).toBe('rejected');
    expect(calls).toBe(0);
  });

  it('cancels while paused for approval', async () => {
    const write = defineAiTool({
      name: 'crm.update',
      description: 'Update a simulated record.',
      requiresApproval: true,
      execute: () => 'updated',
    });
    const run = createAiAgentRunner({
      context: context(),
      tools: [write],
      planner: () => planned('crm.update', {}),
    }).start('update it');
    await waitFor(() => run.status === 'awaiting-approval');
    run.cancel();
    const result = await run.done;
    expect(result.status).toBe('cancelled');
    expect(result.steps.at(-1)?.type).toBe('cancelled');
  });

  it('records deterministic tool failures and continues to a final answer', async () => {
    const unstable = defineAiTool({
      name: 'search',
      description: 'Search with a deterministic outage branch.',
      failureRate: 1,
      failureMessage: 'The simulated index is unavailable.',
      execute: () => 'unreachable',
    });
    const runOnce = async () => {
      const runner = createAiAgentRunner({
        context: context('failure-seed'),
        tools: [unstable],
        planner: () => planned('search', { query: 'launch' }),
      });
      return await runner.start('search launch', { id: 'stable-run' }).done;
    };
    const first = await runOnce();
    const second = await runOnce();
    expect(first).toEqual(second);
    expect(first.status).toBe('completed');
    expect(first.toolResults[0]).toMatchObject({
      status: 'failed',
      error: 'The simulated index is unavailable.',
    });
    expect(first.steps.map((step) => step.type)).toContain('tool-failure');
    expect(first.answer).toContain('failed in the simulation');
  });

  it('ships fictional search, calendar, CRM, and non-executing code tools', async () => {
    const tools = createDefaultAiTools();
    expect(tools.map((tool) => tool.name)).toEqual([
      'search',
      'calendar.lookup',
      'crm.lookup',
      'code.run',
    ]);
    const codeTool = createSimulatedCodeTool();
    const result = await codeTool.run(
      { code: 'process.exit(1)' },
      {
        seed: 1,
        rng: createRng(1),
        now: () => new Date('2026-10-17T00:00:00.000Z'),
        services: {},
      }
    );
    expect(result).toEqual({
      status: 'simulated',
      output: 'Simulation only: 15 characters received; code was not executed.',
    });

    const runner = createAiAgentRunner({ context: context(), tools });
    const searchRun = await runner.start('Search for the launch checklist.').done;
    expect(searchRun.toolResults[0]).toMatchObject({ tool: 'search', status: 'succeeded' });
    expect(searchRun.steps.map((step) => step.type)).toEqual([
      'plan',
      'tool-call',
      'tool-result',
      'answer',
    ]);
  });
});

describe('agent approval floor', () => {
  it('cannot disable requiresApproval on a tool that requires it', async () => {
    const tool = defineAiTool({
      name: 'crm.note',
      description: 'Add a note',
      requiresApproval: true,
      execute: async () => ({ ok: true }),
    });
    const runner = createAiAgentRunner({
      context: context(1),
      tools: [tool],
      planner: () => ({
        goal: 'note',
        calls: [{ tool: 'crm.note', input: {}, reason: 'x', requiresApproval: false }],
      }),
    });
    const run = runner.start('add a note');
    await waitFor(() => run.status === 'awaiting-approval');
    run.reject('no');
    const result = await run.done;
    expect(result.status).toBe('completed');
    expect(result.answer).toMatch(/did not run|declined/i);
  });
});
