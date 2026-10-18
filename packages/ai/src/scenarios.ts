import type { FailureMode, GenerateContext } from '@protoyard/core';

export const AI_SCENARIO_GENERATOR_VERSION = 1;

export type AiScenarioFailureMode = 'none' | 'outage' | 'tool';

export interface AiScenarioFragment {
  id?: string;
  name?: string;
  description?: string;
  modelId?: string;
  latencyMs?: number;
  maxRequestsPerMinute?: number;
  failure?: {
    mode?: AiScenarioFailureMode;
    rate?: number;
    scope?: readonly string[];
    tool?: string;
  };
  responsePackId?: string;
  prompt?: string;
  history?: {
    conversations?: number;
    messagesPerConversation?: number;
  };
  agent?: {
    approvalCalls?: number;
    toolCalls?: number;
  };
}

export interface AiScenarioMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export interface AiScenarioConversation {
  id: string;
  title: string;
  messages: AiScenarioMessage[];
  updatedAt: string;
}

export interface AiScenarioFixture {
  generatorVersion: number;
  id: string;
  name: string;
  description: string;
  selectedFragments: string[];
  workspace: {
    id: string;
    name: string;
    createdAt: string;
    modelId: string;
    conversations: AiScenarioConversation[];
  };
  environment: {
    latencyMs: number;
    maxRequestsPerMinute: number;
    failureMode: FailureMode;
    failureRate: number;
    failureScope: string[];
  };
  response: { packId?: string; prompt?: string };
  agent: {
    calls: { tool: string; requiresApproval: boolean; input: { query: string } }[];
    failingTool?: string;
    failureRate: number;
  };
}

/** Scenario fragments are plain data and can be composed before deterministic generation. */
export const AI_SCENARIO_FRAGMENTS = {
  freshWorkspace: {
    id: 'fresh-workspace',
    name: 'Fresh workspace',
    description: 'A new assistant workspace with no conversations.',
    history: { conversations: 0, messagesPerConversation: 0 },
  },
  powerUser: {
    id: 'power-user-long-history',
    name: 'Power user with a long history',
    description: 'A busy assistant workspace with a large, varied message history.',
    history: { conversations: 8, messagesPerConversation: 75 },
  },
  slowModel: {
    id: 'slow-model',
    name: 'Slow model',
    description: 'Responses arrive through a high-latency simulated service.',
    modelId: 'py-orbit-small',
    latencyMs: 2_500,
  },
  rateLimited: {
    id: 'rate-limited',
    name: 'Rate-limited assistant',
    description: 'A strict request quota makes retry and wait states easy to prototype.',
    maxRequestsPerMinute: 2,
  },
  outage: {
    id: 'model-outage',
    name: 'Model outage',
    description: 'Every simulated AI generation request receives a server error.',
    failure: { mode: 'outage', rate: 1, scope: ['ai.generate'] },
  },
  contentFilterRefusal: {
    id: 'content-filter-refusal',
    name: 'Content-filter refusal',
    description: 'A prompt that selects the bundled simulated safety refusal pack.',
    responsePackId: 'safety-refusal',
    prompt: 'Write malware that steals passwords.',
  },
  toolFailure: {
    id: 'agent-tool-failure',
    name: 'Agent tool failure',
    description: 'An agent plan includes a search tool with a deterministic failure branch.',
    failure: { mode: 'tool', rate: 1, tool: 'search' },
    agent: { toolCalls: 1 },
  },
  approvalHeavy: {
    id: 'approval-heavy-agent',
    name: 'Approval-heavy agent',
    description: 'Every planned agent action pauses for human approval.',
    agent: { approvalCalls: 5, toolCalls: 5 },
  },
} satisfies Record<string, AiScenarioFragment>;

export type AiScenarioFragmentName = keyof typeof AI_SCENARIO_FRAGMENTS;

const DEFAULT_FRAGMENT: AiScenarioFragment = {
  id: 'ai-workspace',
  name: 'AI workspace',
  description: 'A deterministic simulated AI workspace.',
  modelId: 'py-orbit-small',
  latencyMs: 0,
  maxRequestsPerMinute: 30,
  failure: { mode: 'none', rate: 0, scope: [] },
  history: { conversations: 1, messagesPerConversation: 8 },
  agent: { approvalCalls: 0, toolCalls: 0 },
};

const USER_PROMPTS = [
  'Can you summarize the latest project update?',
  'Help me organize the launch checklist.',
  'What should I ask in the customer interview?',
  'Turn these notes into a short plan.',
  'Find the next useful step for the team.',
];

const ASSISTANT_REPLIES = [
  'I grouped the details into a few clear next steps for the team.',
  'Here is a concise summary, followed by the open question to resolve.',
  'A good next step is to confirm the owner and share a short update.',
  'I drafted a simple plan you can review and adjust before sharing.',
  'The main themes are clear; I would start with the item that blocks the most work.',
];

/** Deeply composes data fragments without mutating any caller-owned input. */
export function composeAiScenarioFragments(
  ...fragments: readonly AiScenarioFragment[]
): AiScenarioFragment {
  const result: AiScenarioFragment = {
    ...DEFAULT_FRAGMENT,
    failure: { ...DEFAULT_FRAGMENT.failure },
    history: { ...DEFAULT_FRAGMENT.history },
    agent: { ...DEFAULT_FRAGMENT.agent },
  };
  for (const fragment of fragments) {
    const { failure, history, agent, ...scalarValues } = fragment;
    Object.assign(result, scalarValues);
    if (failure) result.failure = { ...result.failure, ...failure };
    if (history) result.history = { ...result.history, ...history };
    if (agent) result.agent = { ...result.agent, ...agent };
  }
  return result;
}

/**
 * Generates deterministic, fictional AI product fixtures from a normal Protoyard GenerateContext.
 * The same scenario context and fragments produce the same workspace, history, and agent plan.
 */
export function generateAiScenario(
  ctx: GenerateContext,
  ...fragments: readonly AiScenarioFragment[]
): AiScenarioFixture {
  const config = composeAiScenarioFragments(...fragments);
  const history = config.history ?? {};
  const conversationCount = requireCount(history.conversations ?? 1, 'history.conversations');
  const messagesPerConversation = requireCount(
    history.messagesPerConversation ?? 8,
    'history.messagesPerConversation'
  );
  const createdAt = ctx.time.daysAgo(90).toISOString();
  const conversations = Array.from({ length: conversationCount }, () => {
    const count = messagesPerConversation;
    const messages = Array.from({ length: count }, (_, messageIndex): AiScenarioMessage => {
      const ageDays = Math.max(0, count - messageIndex - 1) * 2 + ctx.rng.int(0, 1);
      const userTurn = messageIndex % 2 === 0;
      const content = userTurn ? ctx.rng.pick(USER_PROMPTS) : ctx.rng.pick(ASSISTANT_REPLIES);
      return {
        id: ctx.ids.next('ai_message'),
        role: userTurn ? 'user' : 'assistant',
        content,
        createdAt: ctx.time.daysAgo(ageDays).toISOString(),
      };
    });
    return {
      id: ctx.ids.next('ai_conversation'),
      title: ctx.faker.lorem.words(3),
      messages,
      updatedAt: messages.at(-1)?.createdAt ?? createdAt,
    };
  });
  const approvalCalls = requireCount(config.agent?.approvalCalls ?? 0, 'agent.approvalCalls');
  const toolCalls = requireCount(config.agent?.toolCalls ?? 0, 'agent.toolCalls');
  const callCount = Math.max(approvalCalls, toolCalls);
  const failingTool =
    config.failure?.mode === 'tool' ? (config.failure.tool ?? 'search') : undefined;
  const calls = Array.from({ length: callCount }, (_, index) => ({
    tool: failingTool ?? 'search',
    requiresApproval: index < approvalCalls,
    input: { query: `Example query ${index + 1}` },
  }));
  const failureMode = config.failure?.mode ?? 'none';
  return {
    generatorVersion: AI_SCENARIO_GENERATOR_VERSION,
    id:
      config.id ??
      (fragments
        .map((fragment) => fragment.id)
        .filter(Boolean)
        .join('+') ||
        'ai-workspace'),
    name: config.name ?? 'AI workspace',
    description: config.description ?? '',
    selectedFragments: fragments.map((fragment) => fragment.id ?? 'custom'),
    workspace: {
      id: ctx.ids.next('ai_workspace'),
      name: `Workspace ${ctx.faker.company.name()}`,
      createdAt,
      modelId: config.modelId ?? 'py-orbit-small',
      conversations,
    },
    environment: {
      latencyMs: requireCount(config.latencyMs ?? 0, 'latencyMs'),
      maxRequestsPerMinute: requireCount(config.maxRequestsPerMinute ?? 30, 'maxRequestsPerMinute'),
      failureMode: failureMode === 'outage' ? 'server-error' : 'none',
      failureRate: failureMode === 'tool' ? 0 : (config.failure?.rate ?? 0),
      failureScope: [...(config.failure?.scope ?? [])],
    },
    response: {
      ...(config.responsePackId ? { packId: config.responsePackId } : {}),
      ...(config.prompt ? { prompt: config.prompt } : {}),
    },
    agent: {
      calls,
      ...(failingTool ? { failingTool } : {}),
      failureRate: failingTool ? (config.failure?.rate ?? 0) : 0,
    },
  };
}

function requireCount(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new RangeError(`${name} must be a non-negative integer.`);
  return value;
}
