import {
  type AgentRunHandle,
  type AgentRunResult,
  type AgentStep,
  type AgentToolResult,
  AI_MODELS,
  type AiContext,
  type AiModel,
  createAiAgentRunner,
  createDefaultAiTools,
} from '@protoyard/ai';
import { createRng } from '@protoyard/core';
import type { Agent, EvalCase, Run, RunSource, ToolResult } from '../database/schema.ts';

/**
 * The simulated agent engine shared by the playground, evaluations and the
 * scenario generator. Nothing here calls a model provider: plans, tool calls
 * and answers come from `@protoyard/ai`'s deterministic runner and the
 * built-in fictional tools, so the same agent, prompt, seed and run id always
 * produce the same trace.
 */

export const estimateTokens = (text: string) => Math.ceil(text.trim().length / 4);

export function modelFor(id: string): AiModel {
  return AI_MODELS.find((model) => model.id === id) ?? (AI_MODELS[0] as AiModel);
}

/** Estimated usage for a finished run. Cost is integer micro-dollars (simulated, not billing). */
export function usageFor(
  agent: Pick<Agent, 'instructions' | 'modelId'>,
  prompt: string,
  result: Pick<AgentRunResult, 'answer' | 'steps'>
) {
  const toolText = result.steps
    .filter((step) => step.type === 'tool-result')
    .map((step) => JSON.stringify(step.output ?? null))
    .join('\n');
  const promptTokens =
    estimateTokens(agent.instructions) + estimateTokens(prompt) + estimateTokens(toolText);
  const completionTokens = estimateTokens(result.answer ?? '');
  const model = modelFor(agent.modelId);
  // Prices are USD per million tokens, i.e. micro-dollars per token.
  const costMicros = Math.round(
    promptTokens * model.inputCostPerMillion + completionTokens * model.outputCostPerMillion
  );
  return { promptTokens, completionTokens, costMicros };
}

/** What the runner needs from its host: a seed, simulated time and the environment. */
export interface RunHost {
  seed: number | string;
  now: () => Date;
  environment: AiContext['environment'];
}

/** A one-line, human summary of a tool's fictional output. */
function describeOutput(output: unknown): string {
  if (Array.isArray(output)) {
    if (output.length === 0) return 'no matches';
    const first = output[0] as Record<string, unknown>;
    const label = first.title ?? first.name ?? first.event ?? first.id;
    return `${output.length} match${output.length === 1 ? '' : 'es'}${label ? `, starting with “${String(label)}”` : ''}`;
  }
  if (output && typeof output === 'object' && 'output' in output) {
    return String((output as { output: unknown }).output);
  }
  return JSON.stringify(output);
}

/** Deterministic markdown answer built from the agent and its tool results. */
export function composeAnswer(
  agent: Pick<Agent, 'name'>,
  prompt: string,
  results: readonly AgentToolResult[]
): string {
  if (results.length === 0) {
    return `**${agent.name}** (simulated) answered without tools.\n\nRequest: “${prompt.trim()}”. Enable a tool or mention search, calendar, customer or code to see tool calls.`;
  }
  const lines = results.map((result) => {
    if (result.status === 'failed') return `- \`${result.tool}\` failed: ${result.error}`;
    if (result.status === 'rejected')
      return `- \`${result.tool}\` was not run (approval declined).`;
    return `- \`${result.tool}\`: ${describeOutput(result.output)}`;
  });
  const failed = results.filter((r) => r.status !== 'succeeded').length;
  const verdict =
    failed === 0
      ? 'All tool calls succeeded.'
      : `${failed} of ${results.length} tool call${results.length === 1 ? '' : 's'} did not succeed.`;
  return `**${agent.name}** (simulated) handled the request.\n\n${lines.join('\n')}\n\n${verdict}`;
}

export interface StartOptions {
  runId: string;
  onStep?: (step: AgentStep) => void;
}

/** Starts a run: only the agent's enabled tools, with its approval rules. */
export function startAgentRun(
  agent: Agent,
  prompt: string,
  host: RunHost,
  options: StartOptions
): AgentRunHandle {
  const tools = createDefaultAiTools()
    .filter((tool) => (agent.tools as string[]).includes(tool.name))
    .map((tool) =>
      (agent.approvalTools as string[]).includes(tool.name)
        ? { ...tool, requiresApproval: true }
        : tool
    );
  const context: AiContext = {
    seed: host.seed,
    rng: createRng(`${String(host.seed)}:${options.runId}`),
    clock: { now: host.now, nowMs: () => host.now().getTime(), sleep: async () => {} },
    environment: host.environment,
  };
  const runner = createAiAgentRunner({
    context,
    tools,
    answer: ({ results }) => composeAnswer(agent, prompt, results),
    ...(options.onStep ? { onStep: options.onStep } : {}),
  });
  return runner.start(prompt, { id: options.runId });
}

/**
 * Runs to the end without a person: approval requests are answered with
 * `decision` (evaluations and seeded history use this).
 */
export async function runUnattended(
  agent: Agent,
  prompt: string,
  host: RunHost,
  runId: string,
  decision: 'approve' | 'reject' = 'approve'
): Promise<AgentRunResult> {
  let handle: AgentRunHandle | undefined;
  handle = startAgentRun(agent, prompt, host, {
    runId,
    onStep: (step) => {
      // The approval promise is created right after this step is emitted.
      if (step.type === 'approval-requested') {
        queueMicrotask(() => (decision === 'approve' ? handle?.approve() : handle?.reject()));
      }
    },
  });
  return handle.done;
}

export function toRunRecord(input: {
  id: string;
  agent: Agent;
  prompt: string;
  result: AgentRunResult;
  source: RunSource;
  evaluationId: string | null;
  actorId: string;
  createdAt: string;
}): Run {
  const { agent, prompt, result } = input;
  return {
    id: input.id,
    agentId: agent.id,
    prompt,
    status: result.status,
    answer: result.answer ?? null,
    steps: [...result.steps],
    toolResults: result.toolResults.map(
      (r): ToolResult => ({
        tool: r.tool,
        status: r.status,
        ...(r.error ? { error: r.error } : {}),
      })
    ),
    modelId: agent.modelId,
    ...usageFor(agent, prompt, result),
    source: input.source,
    evaluationId: input.evaluationId,
    actorId: input.actorId,
    createdAt: input.createdAt,
  };
}

/** Pass/fail for one evaluation case. Pure and deterministic. */
export function judgeCase(
  testCase: Pick<EvalCase, 'expectTool' | 'expectText'>,
  run: Pick<Run, 'status' | 'answer' | 'toolResults'>
): { pass: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (run.status !== 'completed') reasons.push(`Run ended as ${run.status}.`);
  if (testCase.expectTool) {
    const call = run.toolResults.find((r) => r.tool === testCase.expectTool);
    if (!call) reasons.push(`Expected a call to ${testCase.expectTool}.`);
    else if (call.status !== 'succeeded') {
      reasons.push(
        `${testCase.expectTool} ${call.status === 'rejected' ? 'was rejected' : 'failed'}.`
      );
    }
  }
  if (testCase.expectText) {
    const answer = (run.answer ?? '').toLowerCase();
    if (!answer.includes(testCase.expectText.toLowerCase())) {
      reasons.push(`Answer does not mention “${testCase.expectText}”.`);
    }
  }
  return { pass: reasons.length === 0, reasons };
}

/** Deterministic run id for an evaluation case, so re-running a dataset reproduces its traces. */
export const evaluationRunId = (datasetId: string, caseId: string) => `eval:${datasetId}:${caseId}`;

/** Formats integer micro-dollars: 1234 → "$0.0012", 46 → "<$0.0001". */
export function formatCost(micros: number): string {
  if (micros > 0 && micros < 100) return '<$0.0001';
  const usd = micros / 1_000_000;
  return `$${usd < 0.01 && usd > 0 ? usd.toFixed(4) : usd.toFixed(2)}`;
}
