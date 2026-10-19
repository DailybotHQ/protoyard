import type { AiContext } from '@protoyard/ai';
import type { GenerateContext, WorldSeed } from '@protoyard/core';
import { generateTeam } from '@protoyard/scenarios';
import type { Agent, CaseResult, Dataset, Evaluation, Run } from '../database/schema.ts';
import {
  evaluationRunId,
  judgeCase,
  type RunHost,
  runUnattended,
  toRunRecord,
} from '../domain/agents.ts';
import { AGENT_LIBRARY } from './library.ts';

/**
 * Bump when the same seed can produce a different world.
 * v2: personas carry library avatars (`generateTeam`), shown as photos.
 */
export const GENERATOR_VERSION = 2;

/** Seeded history is generated offline: tool calls never pass through the live environment. */
const offlineEnvironment = {
  run: async (_operation: string, fn: () => unknown) => fn(),
} as unknown as AiContext['environment'];

const hostAt = (seed: number, at: Date): RunHost => ({
  seed,
  now: () => at,
  environment: offlineEnvironment,
});

/**
 * Deterministic world: a team, library agents, playground runs produced by
 * the real simulated runner (so traces are genuine), one dataset per agent
 * and optionally one evaluation per dataset. Only `ctx.rng`, `ctx.ids` and
 * `ctx.time` are used.
 */
export async function generateConsoleWorld(ctx: GenerateContext): Promise<WorldSeed> {
  const team = generateTeam(ctx, {
    roles: { admin: 1, member: 3, viewer: 1 },
    titles: {
      owner: ['Head of AI Platform'],
      admin: ['Platform Lead'],
      member: ['Applied AI Engineer', 'Conversation Designer', 'Support Ops'],
      viewer: ['Product Stakeholder'],
    },
  });
  const knobs = ctx.scenario.generators as {
    agents?: number;
    runsPerAgent?: number;
    evaluations?: boolean;
  };
  const agentCount = Math.min(knobs.agents ?? 3, AGENT_LIBRARY.length);
  const runsPerAgent = knobs.runsPerAgent ?? 6;
  const seed = ctx.scenario.seed;
  const orgCreated = new Date(team.organization.createdAt);
  const builders = team.personas;
  const between = (from: Date) => ctx.time.between(from, ctx.time.now, ctx.rng.next);

  const agents: Agent[] = [];
  const runs: Run[] = [];
  const datasets: Dataset[] = [];
  const evaluations: Evaluation[] = [];

  for (const library of AGENT_LIBRARY.slice(0, agentCount)) {
    const created = between(orgCreated);
    const agent: Agent = {
      id: ctx.ids.next('agent'),
      name: library.name,
      description: library.description,
      instructions: library.instructions,
      modelId: library.modelId,
      tools: [...library.tools],
      approvalTools: [...library.approvalTools],
      ownerId: ctx.rng.pick(builders).id,
      createdAt: created.toISOString(),
      updatedAt: between(created).toISOString(),
    };
    agents.push(agent);

    const times = Array.from({ length: runsPerAgent }, () => between(created)).sort(
      (a, b) => a.getTime() - b.getTime()
    );
    for (const at of times) {
      const id = ctx.ids.next('run');
      const prompt = ctx.rng.pick(library.prompts);
      const decision = ctx.rng.chance(0.8) ? 'approve' : 'reject';
      const result = await runUnattended(agent, prompt, hostAt(seed, at), id, decision);
      runs.push(
        toRunRecord({
          id,
          agent,
          prompt,
          result,
          source: 'playground',
          evaluationId: null,
          actorId: ctx.rng.pick(builders).id,
          createdAt: at.toISOString(),
        })
      );
    }

    const datasetCreated = between(created);
    const dataset: Dataset = {
      id: ctx.ids.next('dataset'),
      agentId: agent.id,
      name: library.dataset,
      cases: library.cases.map((c) => ({ id: ctx.ids.next('case'), ...c })),
      ownerId: agent.ownerId,
      createdAt: datasetCreated.toISOString(),
      updatedAt: datasetCreated.toISOString(),
    };
    datasets.push(dataset);

    if (knobs.evaluations) {
      const at = between(datasetCreated);
      const id = ctx.ids.next('evaluation');
      const actorId = ctx.rng.pick(builders).id;
      const results: CaseResult[] = [];
      for (const testCase of dataset.cases) {
        const result = await runUnattended(
          agent,
          testCase.prompt,
          hostAt(seed, at),
          evaluationRunId(dataset.id, testCase.id)
        );
        const run = toRunRecord({
          id: ctx.ids.next('run'),
          agent,
          prompt: testCase.prompt,
          result,
          source: 'evaluation',
          evaluationId: id,
          actorId,
          createdAt: at.toISOString(),
        });
        runs.push(run);
        results.push({ caseId: testCase.id, runId: run.id, ...judgeCase(testCase, run) });
      }
      const passed = results.filter((r) => r.pass).length;
      evaluations.push({
        id,
        datasetId: dataset.id,
        agentId: agent.id,
        passed,
        failed: results.length - passed,
        results,
        actorId,
        createdAt: at.toISOString(),
      });
    }
  }

  return {
    organizations: team.organizations,
    personas: team.personas,
    memberships: team.memberships,
    tables: { agents, runs, datasets, evaluations },
  };
}
