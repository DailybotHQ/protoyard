import type { AgentStep } from '@protoyard/ai';
import type { DatabaseDefinition } from '@protoyard/core';
import type { Dexie, EntityTable } from 'dexie';

/**
 * Agent platform data model. Seeded ids are deterministic (`agent_0001`);
 * ids created in the UI carry a `u` marker. Relationships: agent 1─* run,
 * agent 1─* dataset, dataset 1─* evaluation, evaluation 1─* run (source
 * `evaluation`). `ownerId` / `actorId` reference `py_personas`.
 *
 * To add a table, add a NEW version (never edit an old one) and bump
 * `storage.schemaVersion` in protoyard.json.
 */

/** Built-in simulated tools an agent can enable (from `@protoyard/ai`). */
export const TOOL_NAMES = ['search', 'calendar.lookup', 'crm.lookup', 'code.run'] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

export type Agent = {
  id: string;
  name: string;
  description: string;
  instructions: string;
  /** A simulated model id from `AI_MODELS`. */
  modelId: string;
  tools: ToolName[];
  /** Tools that pause the run until a person approves the call. */
  approvalTools: ToolName[];
  ownerId: string;
  createdAt: string;
  updatedAt: string;
};

export type RunStatus = 'completed' | 'cancelled' | 'failed';
export type RunSource = 'playground' | 'evaluation';

export type ToolResult = {
  tool: string;
  status: 'succeeded' | 'failed' | 'rejected';
  error?: string;
};

export type Run = {
  id: string;
  agentId: string;
  prompt: string;
  status: RunStatus;
  answer: string | null;
  steps: AgentStep[];
  toolResults: ToolResult[];
  modelId: string;
  promptTokens: number;
  completionTokens: number;
  /** Estimated cost in integer micro-dollars (1 USD = 1,000,000). Simulated, not billing. */
  costMicros: number;
  source: RunSource;
  evaluationId: string | null;
  actorId: string;
  createdAt: string;
};

export type EvalCase = {
  id: string;
  prompt: string;
  /** The run must call this tool successfully. */
  expectTool: ToolName | null;
  /** The answer must contain this text (case-insensitive). */
  expectText: string | null;
};

export type Dataset = {
  id: string;
  agentId: string;
  name: string;
  cases: EvalCase[];
  ownerId: string;
  createdAt: string;
  updatedAt: string;
};

export type CaseResult = { caseId: string; runId: string; pass: boolean; reasons: string[] };

export type Evaluation = {
  id: string;
  datasetId: string;
  agentId: string;
  passed: number;
  failed: number;
  results: CaseResult[];
  actorId: string;
  createdAt: string;
};

export type ConsoleDatabase = Dexie & {
  agents: EntityTable<Agent, 'id'>;
  runs: EntityTable<Run, 'id'>;
  datasets: EntityTable<Dataset, 'id'>;
  evaluations: EntityTable<Evaluation, 'id'>;
};

export const database: DatabaseDefinition = {
  versions: [
    {
      version: 1,
      stores: {
        agents: 'id, ownerId, modelId, updatedAt',
        runs: 'id, agentId, status, source, evaluationId, actorId, createdAt',
        datasets: 'id, agentId, ownerId, updatedAt',
        evaluations: 'id, datasetId, agentId, createdAt',
      },
    },
  ],
};
