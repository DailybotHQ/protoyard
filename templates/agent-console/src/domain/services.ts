import { type AgentRunHandle, type AgentStep, AI_MODELS } from '@protoyard/ai';
import { createRuntimeId, type PrototypeRuntime, parseInput } from '@protoyard/core';
import { z } from 'zod';
import {
  type Agent,
  type CaseResult,
  type ConsoleDatabase,
  type Dataset,
  type EvalCase,
  type Evaluation,
  type Run,
  TOOL_NAMES,
} from '../database/schema.ts';
import {
  evaluationRunId,
  judgeCase,
  type RunHost,
  runUnattended,
  startAgentRun,
  toRunRecord,
} from './agents.ts';
import { CAPABILITIES } from './policy.ts';

/**
 * Domain services: the ONLY way screens change data. Each mutation
 *   1. checks the simulated policy (`session.assert`) — enforced even if the UI is bypassed,
 *   2. validates input with zod (`parseInput` → field-keyed `ValidationError`),
 *   3. runs through the simulated environment (latency / offline / failures),
 *   4. writes related rows in ONE Dexie transaction.
 * Agent runs are simulated: no model provider is ever called.
 */

const MODEL_IDS = AI_MODELS.map((m) => m.id) as [string, ...string[]];
const tools = z.array(z.enum(TOOL_NAMES)).max(TOOL_NAMES.length);

export const AgentInputSchema = z
  .object({
    name: z.string().trim().min(2, 'Name must have at least 2 characters').max(60),
    description: z
      .string()
      .trim()
      .max(200, 'Keep the description under 200 characters')
      .default(''),
    instructions: z
      .string()
      .trim()
      .min(1, 'Write the instructions the agent follows')
      .max(4000, 'Instructions are limited to 4000 characters'),
    modelId: z.enum(MODEL_IDS, { message: 'Pick a simulated model' }),
    tools: tools.default([]),
    approvalTools: tools.default([]),
  })
  .refine((a) => a.approvalTools.every((t) => a.tools.includes(t)), {
    message: 'Approval can only be required for enabled tools',
    path: ['approvalTools'],
  });
export type AgentInput = z.input<typeof AgentInputSchema>;

const PromptSchema = z.object({
  prompt: z
    .string()
    .trim()
    .min(1, 'Write a prompt')
    .max(2000, 'Prompts are limited to 2000 characters'),
});

export const DatasetInputSchema = z.object({
  agentId: z.string().min(1, 'Pick an agent'),
  name: z.string().trim().min(2, 'Name must have at least 2 characters').max(60),
});

export const CaseInputSchema = z
  .object({
    prompt: z.string().trim().min(1, 'Write the prompt to test').max(2000),
    expectTool: z.enum(TOOL_NAMES).nullable().default(null),
    expectText: z
      .string()
      .trim()
      .max(120)
      .nullable()
      .default(null)
      .transform((t) => (t ? t : null)),
  })
  .refine((c) => c.expectTool !== null || c.expectText !== null, {
    message: 'Add an expected tool or expected text so the case can pass or fail',
    path: ['expectText'],
  });
export type CaseInput = z.input<typeof CaseInputSchema>;

export class NotFoundError extends Error {
  constructor(what: string) {
    super(`${what} was not found. It may have been deleted.`);
    this.name = 'NotFoundError';
  }
}

export interface PlaygroundRun {
  /** Live handle: approve / reject / cancel while the run is active. */
  handle: AgentRunHandle;
  /** Resolves with the persisted run once it finishes (any final status). */
  saved: Promise<Run>;
}

export function createConsoleServices(runtime: PrototypeRuntime<ConsoleDatabase>) {
  const { db, session, environment, clock } = runtime;
  const now = () => clock.now().toISOString();
  const actorId = () => {
    const principal = session.principal();
    if (!principal) throw new Error('No active persona. Load a scenario first.');
    return principal.persona.id;
  };
  const host = (): RunHost => ({
    seed: runtime.scenarios.active()?.seed ?? 0,
    now: () => clock.now(),
    environment,
  });

  async function loadAgent(id: string): Promise<Agent> {
    const agent = await db.agents.get(id);
    if (!agent) throw new NotFoundError('The agent');
    return agent;
  }
  async function loadDataset(id: string): Promise<Dataset> {
    const dataset = await db.datasets.get(id);
    if (!dataset) throw new NotFoundError('The dataset');
    return dataset;
  }

  const agents = {
    async create(input: AgentInput): Promise<Agent> {
      session.assert(CAPABILITIES.agentsCreate);
      const data = parseInput(AgentInputSchema, input);
      return environment.run('agents.create', async () => {
        const at = now();
        const agent: Agent = {
          id: createRuntimeId('agent'),
          ...data,
          ownerId: actorId(),
          createdAt: at,
          updatedAt: at,
        };
        await db.agents.add(agent);
        return agent;
      });
    },

    async update(id: string, input: AgentInput): Promise<Agent> {
      session.assert(CAPABILITIES.agentsUpdate);
      const data = parseInput(AgentInputSchema, input);
      return environment.run('agents.update', () =>
        db.transaction('rw', db.agents, async () => {
          const agent = { ...(await loadAgent(id)), ...data, updatedAt: now() };
          await db.agents.put(agent);
          return agent;
        })
      );
    },

    /** Deletes the agent with its runs, datasets and evaluations, atomically. */
    async remove(id: string): Promise<void> {
      session.assert(CAPABILITIES.agentsDelete);
      await environment.run('agents.remove', () =>
        db.transaction('rw', [db.agents, db.runs, db.datasets, db.evaluations], async () => {
          await loadAgent(id);
          await db.runs.where('agentId').equals(id).delete();
          await db.evaluations.where('agentId').equals(id).delete();
          await db.datasets.where('agentId').equals(id).delete();
          await db.agents.delete(id);
        })
      );
    },
  };

  const playground = {
    /**
     * Starts a live run. The platform request goes through
     * `environment.run('agents.run')` (offline fails before anything starts);
     * each tool call goes through `environment.run('ai.agent.tool.<name>')`,
     * so DevTools failures show up as failed steps in the trace.
     */
    async start(
      agentId: string,
      input: { prompt: string },
      onStep?: (step: AgentStep) => void
    ): Promise<PlaygroundRun> {
      session.assert(CAPABILITIES.runsCreate);
      const { prompt } = parseInput(PromptSchema, input);
      const agent = await loadAgent(agentId);
      const by = actorId();
      return environment.run('agents.run', () => {
        const id = createRuntimeId('run');
        const createdAt = now();
        const handle = startAgentRun(agent, prompt, host(), {
          runId: id,
          ...(onStep ? { onStep } : {}),
        });
        const saved = handle.done.then(async (result) => {
          const run = toRunRecord({
            id,
            agent,
            prompt,
            result,
            source: 'playground',
            evaluationId: null,
            actorId: by,
            createdAt,
          });
          await db.runs.put(run);
          return run;
        });
        return { handle, saved };
      });
    },
  };

  const datasets = {
    async create(input: z.input<typeof DatasetInputSchema>): Promise<Dataset> {
      session.assert(CAPABILITIES.datasetsWrite);
      const data = parseInput(DatasetInputSchema, input);
      return environment.run('datasets.create', () =>
        db.transaction('rw', [db.agents, db.datasets], async () => {
          await loadAgent(data.agentId);
          const at = now();
          const dataset: Dataset = {
            id: createRuntimeId('dataset'),
            agentId: data.agentId,
            name: data.name,
            cases: [],
            ownerId: actorId(),
            createdAt: at,
            updatedAt: at,
          };
          await db.datasets.add(dataset);
          return dataset;
        })
      );
    },

    async addCase(datasetId: string, input: CaseInput): Promise<EvalCase> {
      session.assert(CAPABILITIES.datasetsWrite);
      const data = parseInput(CaseInputSchema, input);
      return environment.run('datasets.addCase', () =>
        db.transaction('rw', db.datasets, async () => {
          const dataset = await loadDataset(datasetId);
          const testCase: EvalCase = { id: createRuntimeId('case'), ...data };
          await db.datasets.put({
            ...dataset,
            cases: [...dataset.cases, testCase],
            updatedAt: now(),
          });
          return testCase;
        })
      );
    },

    async removeCase(datasetId: string, caseId: string): Promise<void> {
      session.assert(CAPABILITIES.datasetsWrite);
      await environment.run('datasets.removeCase', () =>
        db.transaction('rw', db.datasets, async () => {
          const dataset = await loadDataset(datasetId);
          const cases = dataset.cases.filter((c) => c.id !== caseId);
          if (cases.length === dataset.cases.length) throw new NotFoundError('The case');
          await db.datasets.put({ ...dataset, cases, updatedAt: now() });
        })
      );
    },

    /** Deletes the dataset with its evaluations and their runs. */
    async remove(datasetId: string): Promise<void> {
      session.assert(CAPABILITIES.datasetsWrite);
      await environment.run('datasets.remove', () =>
        db.transaction('rw', [db.datasets, db.evaluations, db.runs], async () => {
          await loadDataset(datasetId);
          const evaluations = await db.evaluations.where('datasetId').equals(datasetId).toArray();
          await db.runs
            .where('evaluationId')
            .anyOf(evaluations.map((e) => e.id))
            .delete();
          await db.evaluations.bulkDelete(evaluations.map((e) => e.id));
          await db.datasets.delete(datasetId);
        })
      );
    },
  };

  const evaluations = {
    /**
     * Runs every case of a dataset unattended (approvals are granted) and
     * stores the evaluation with one run per case in a single transaction.
     * Case run ids are derived from the dataset and case ids, so the same
     * agent and environment reproduce the same traces and verdicts.
     */
    async run(datasetId: string): Promise<Evaluation> {
      session.assert(CAPABILITIES.evaluationsRun);
      const dataset = await loadDataset(datasetId);
      if (dataset.cases.length === 0) {
        throw new Error('Add at least one case before running an evaluation.');
      }
      const agent = await loadAgent(dataset.agentId);
      const by = actorId();
      return environment.run('evaluations.run', async () => {
        const id = createRuntimeId('evaluation');
        const createdAt = now();
        const runs: Run[] = [];
        const results: CaseResult[] = [];
        for (const testCase of dataset.cases) {
          const result = await runUnattended(
            agent,
            testCase.prompt,
            host(),
            evaluationRunId(dataset.id, testCase.id)
          );
          const run = toRunRecord({
            id: createRuntimeId('run'),
            agent,
            prompt: testCase.prompt,
            result,
            source: 'evaluation',
            evaluationId: id,
            actorId: by,
            createdAt,
          });
          runs.push(run);
          results.push({ caseId: testCase.id, runId: run.id, ...judgeCase(testCase, run) });
        }
        const passed = results.filter((r) => r.pass).length;
        const evaluation: Evaluation = {
          id,
          datasetId: dataset.id,
          agentId: agent.id,
          passed,
          failed: results.length - passed,
          results,
          actorId: by,
          createdAt,
        };
        await db.transaction('rw', [db.evaluations, db.runs], async () => {
          await db.runs.bulkAdd(runs);
          await db.evaluations.add(evaluation);
        });
        return evaluation;
      });
    },
  };

  return { agents, playground, datasets, evaluations };
}

export type ConsoleServices = ReturnType<typeof createConsoleServices>;
