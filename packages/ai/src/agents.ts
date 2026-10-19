import { createRng, hashString } from '@protoyard/core';
import { type AiTool, type AiToolServices, toolFailureRoll } from './tools.ts';
import type { AiContext } from './types.ts';

export interface AgentToolCall {
  tool: string;
  input: unknown;
  reason?: string;
  requiresApproval?: boolean;
}

export interface AgentPlan {
  goal: string;
  calls: readonly AgentToolCall[];
}

export interface AgentToolResult {
  tool: string;
  status: 'succeeded' | 'failed' | 'rejected';
  output?: unknown;
  error?: string;
}

export type AgentStepType =
  | 'plan'
  | 'tool-call'
  | 'approval-requested'
  | 'approval-granted'
  | 'approval-rejected'
  | 'tool-result'
  | 'tool-failure'
  | 'answer'
  | 'cancelled';

export interface AgentStep {
  id: string;
  sequence: number;
  type: AgentStepType;
  createdAt: string;
  message: string;
  tool?: string;
  input?: unknown;
  output?: unknown;
}

export type AgentRunStatus = 'running' | 'awaiting-approval' | 'completed' | 'cancelled' | 'failed';

export interface AgentRunResult {
  id: string;
  status: Exclude<AgentRunStatus, 'running' | 'awaiting-approval'>;
  answer?: string;
  steps: readonly AgentStep[];
  toolResults: readonly AgentToolResult[];
}

export interface AgentRunHandle {
  readonly id: string;
  readonly steps: AgentStep[];
  readonly toolResults: AgentToolResult[];
  readonly done: Promise<AgentRunResult>;
  readonly status: AgentRunStatus;
  approve(): void;
  reject(reason?: string): void;
  cancel(): void;
}

export interface AgentPlannerInput {
  prompt: string;
  runId: string;
  tools: readonly Pick<AiTool, 'name' | 'description' | 'requiresApproval'>[];
}

export interface AgentRunnerOptions {
  context: AiContext;
  tools: readonly AiTool[];
  services?: AiToolServices;
  planner?: (input: AgentPlannerInput) => AgentPlan | Promise<AgentPlan>;
  answer?: (input: {
    prompt: string;
    plan: AgentPlan;
    results: readonly AgentToolResult[];
  }) => string | Promise<string>;
  onStep?: (step: AgentStep) => void;
}

type ApprovalDecision =
  | { kind: 'approved' }
  | { kind: 'rejected'; reason: string }
  | { kind: 'cancelled' };

export function createAiAgentRunner(options: AgentRunnerOptions) {
  const { context } = options;
  const tools = new Map(options.tools.map((tool) => [tool.name, tool]));
  if (tools.size !== options.tools.length) throw new RangeError('AI tool names must be unique.');
  let runSequence = 0;

  const start = (prompt: string, runOptions: { id?: string } = {}): AgentRunHandle => {
    const runId = runOptions.id ?? `agent_${String(++runSequence).padStart(4, '0')}`;
    const steps: AgentStep[] = [];
    const toolResults: AgentToolResult[] = [];
    let status: AgentRunStatus = 'running';
    let cancelled = false;
    let approvalResolver: ((decision: ApprovalDecision) => void) | undefined;
    let stepSequence = 0;

    const emit = (
      type: AgentStepType,
      message: string,
      detail: Pick<AgentStep, 'tool' | 'input' | 'output'> = {}
    ) => {
      const step: AgentStep = {
        id: `${runId}:step:${String(++stepSequence).padStart(3, '0')}`,
        sequence: stepSequence,
        type,
        createdAt: context.clock.now().toISOString(),
        message,
        ...detail,
      };
      steps.push(step);
      options.onStep?.(step);
      return step;
    };

    const askForApproval = (call: AgentToolCall, tool: AiTool): Promise<ApprovalDecision> => {
      status = 'awaiting-approval';
      emit('approval-requested', `Approval required before ${tool.name}.`, {
        tool: tool.name,
        input: call.input,
      });
      return new Promise((resolve) => {
        approvalResolver = resolve;
      });
    };

    const execute = async (): Promise<AgentRunResult> => {
      const results: AgentToolResult[] = toolResults;
      try {
        const plan = await (options.planner ?? defaultAgentPlanner)({
          prompt,
          runId,
          tools: options.tools.map(({ name, description, requiresApproval }) => ({
            name,
            description,
            requiresApproval,
          })),
        });
        emit('plan', plan.goal, {
          output: plan.calls.map((call) => ({ tool: call.tool, reason: call.reason })),
        });
        for (const [index, call] of plan.calls.entries()) {
          if (cancelled) return finish('cancelled');
          const tool = tools.get(call.tool);
          if (!tool) {
            const error = `The simulated agent requested an unavailable tool: ${call.tool}.`;
            results.push({ tool: call.tool, status: 'failed', error });
            emit('tool-failure', error, { tool: call.tool, input: call.input });
            continue;
          }
          emit('tool-call', call.reason ?? `Calling ${tool.name}.`, {
            tool: tool.name,
            input: call.input,
          });
          // A plan may require extra approval, never lower a tool's requirement.
          if (tool.requiresApproval === true || call.requiresApproval === true) {
            const decision = await askForApproval(call, tool);
            approvalResolver = undefined;
            if (decision.kind === 'cancelled' || cancelled) return finish('cancelled');
            if (decision.kind === 'rejected') {
              results.push({ tool: tool.name, status: 'rejected', error: decision.reason });
              emit('approval-rejected', `Approval declined: ${decision.reason}`, {
                tool: tool.name,
                input: call.input,
              });
              const answer = `I did not run ${tool.name} because approval was declined. You can review the request and try again.`;
              emit('answer', answer, { output: answer });
              return finish('completed', answer);
            }
            status = 'running';
            emit('approval-granted', `Approval granted for ${tool.name}.`, { tool: tool.name });
          }
          const failureRate = tool.failureRate ?? 0;
          if (toolFailureRoll(context.seed, runId, index, tool.name) < failureRate) {
            const error = tool.failureMessage ?? `The simulated ${tool.name} tool failed.`;
            results.push({ tool: tool.name, status: 'failed', error });
            emit('tool-failure', error, { tool: tool.name, input: call.input });
            continue;
          }
          try {
            const rngSeed = hashString(`${String(context.seed)}:${runId}:${index}:${tool.name}`);
            const output = await context.environment.run(`ai.agent.tool.${tool.name}`, () =>
              tool.run(call.input, {
                seed: context.seed,
                rng: createRng(rngSeed),
                now: context.clock.now,
                services: options.services ?? {},
              })
            );
            results.push({ tool: tool.name, status: 'succeeded', output });
            emit('tool-result', `${tool.name} completed.`, { tool: tool.name, output });
          } catch (error) {
            const message =
              error instanceof Error ? error.message : 'Unknown simulated tool error.';
            results.push({ tool: tool.name, status: 'failed', error: message });
            emit('tool-failure', message, { tool: tool.name, input: call.input });
          }
        }
        if (cancelled) return finish('cancelled');
        const answer = await (options.answer ?? defaultAgentAnswer)({ prompt, plan, results });
        emit('answer', answer, { output: answer });
        return finish('completed', answer);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'The simulated agent could not complete this run.';
        emit('tool-failure', message);
        return finish('failed');
      }
    };

    const finish = (finalStatus: AgentRunResult['status'], answer?: string): AgentRunResult => {
      status = finalStatus;
      return {
        id: runId,
        status: finalStatus,
        ...(answer !== undefined ? { answer } : {}),
        steps: [...steps],
        toolResults: [...toolResults],
      };
    };

    const done = execute();
    return {
      id: runId,
      steps,
      toolResults,
      done,
      get status() {
        return status;
      },
      approve() {
        approvalResolver?.({ kind: 'approved' });
      },
      reject(reason = 'The user rejected this action.') {
        approvalResolver?.({ kind: 'rejected', reason });
      },
      cancel() {
        cancelled = true;
        approvalResolver?.({ kind: 'cancelled' });
        if (status !== 'completed' && status !== 'failed') {
          status = 'cancelled';
          emit('cancelled', 'The agent run was cancelled.');
        }
      },
    };
  };

  return { start };
}

export function defaultAgentPlanner(input: AgentPlannerInput): AgentPlan {
  const prompt = input.prompt;
  const normalized = prompt.toLowerCase();
  const calls: AgentToolCall[] = [];
  const addIfAvailable = (tool: string, reason: string, toolInput: unknown) => {
    if (input.tools.some((candidate) => candidate.name === tool))
      calls.push({ tool, input: toolInput, reason });
  };
  if (/\b(search|find|look up|lookup)\b/.test(normalized)) {
    addIfAvailable('search', 'Search the local simulated knowledge index.', { query: prompt });
  }
  if (/\b(calendar|meeting|event|schedule)\b/.test(normalized)) {
    addIfAvailable('calendar.lookup', 'Check the fictional calendar.', { query: prompt });
  }
  if (/\b(customer|crm|account)\b/.test(normalized)) {
    addIfAvailable('crm.lookup', 'Look up matching fictional CRM records.', { query: prompt });
  }
  if (/\b(run code|execute code|code runner)\b/.test(normalized)) {
    addIfAvailable('code.run', 'Request a safe simulated code-run result.', { code: prompt });
  }
  return {
    goal: calls.length
      ? `Complete the request using ${calls.length} simulated tool call(s).`
      : 'Answer without simulated tool calls.',
    calls,
  };
}

function defaultAgentAnswer(input: {
  prompt: string;
  plan: AgentPlan;
  results: readonly AgentToolResult[];
}): string {
  if (input.results.length === 0)
    return `Here is a simulated response to: “${input.prompt.trim()}”`;
  const summary = input.results.map((result) => {
    if (result.status === 'failed')
      return `${result.tool} failed in the simulation: ${result.error}`;
    if (result.status === 'rejected')
      return `${result.tool} was not run because approval was declined.`;
    return `${result.tool}: ${JSON.stringify(result.output)}`;
  });
  return `Simulated agent results for “${input.prompt.trim()}”:\n${summary.join('\n')}`;
}
