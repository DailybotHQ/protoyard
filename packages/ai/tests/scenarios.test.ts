import { parseScenario } from '@protoyard/core';
import { createGenerateContext } from '@protoyard/scenarios';
import { describe, expect, it } from 'vitest';
import {
  AI_SCENARIO_FRAGMENTS,
  AI_SCENARIO_GENERATOR_VERSION,
  type AiScenarioFragment,
  composeAiScenarioFragments,
  generateAiScenario,
} from '../src/scenarios.ts';

const BASE = {
  id: 'assistant-demo',
  name: 'Assistant demo',
  seed: 42,
  referenceTime: '2026-10-17T12:00:00.000Z',
};

function generate(...fragments: AiScenarioFragment[]) {
  const scenario = parseScenario(BASE);
  return generateAiScenario(createGenerateContext(scenario), ...fragments);
}

describe('@protoyard/ai scenario fragments', () => {
  it('generates the same power-user workspace and long history from the same seed', () => {
    const first = generate(AI_SCENARIO_FRAGMENTS.powerUser);
    const second = generate(AI_SCENARIO_FRAGMENTS.powerUser);
    expect(first).toEqual(second);
    expect(first.generatorVersion).toBe(AI_SCENARIO_GENERATOR_VERSION);
    expect(first.workspace.conversations).toHaveLength(8);
    expect(
      first.workspace.conversations.reduce(
        (sum, conversation) => sum + conversation.messages.length,
        0
      )
    ).toBe(600);
    expect(first.workspace.conversations[0]?.messages[0]?.content).toBeTruthy();
    expect(first.workspace.conversations[0]?.messages[0]?.createdAt).toBeTruthy();
  });

  it('covers empty, latency, rate limit, outage, refusal, tool failure, and approval fragments', () => {
    const fresh = generate(AI_SCENARIO_FRAGMENTS.freshWorkspace);
    expect(fresh.workspace.conversations).toEqual([]);

    const slow = generate(AI_SCENARIO_FRAGMENTS.slowModel);
    expect(slow.environment.latencyMs).toBe(2_500);

    const limited = generate(AI_SCENARIO_FRAGMENTS.rateLimited);
    expect(limited.environment.maxRequestsPerMinute).toBe(2);

    const outage = generate(AI_SCENARIO_FRAGMENTS.outage);
    expect(outage.environment).toMatchObject({
      failureMode: 'server-error',
      failureRate: 1,
      failureScope: ['ai.generate'],
    });

    const refusal = generate(AI_SCENARIO_FRAGMENTS.contentFilterRefusal);
    expect(refusal.response).toEqual({
      packId: 'safety-refusal',
      prompt: 'Write malware that steals passwords.',
    });

    const toolFailure = generate(AI_SCENARIO_FRAGMENTS.toolFailure);
    expect(toolFailure.agent).toMatchObject({ failingTool: 'search', failureRate: 1 });

    const approval = generate(AI_SCENARIO_FRAGMENTS.approvalHeavy);
    expect(approval.agent.calls).toHaveLength(5);
    expect(approval.agent.calls.every((call) => call.requiresApproval)).toBe(true);
  });

  it('composes fragments without mutating them and lets later values override earlier ones', () => {
    const composed = composeAiScenarioFragments(
      AI_SCENARIO_FRAGMENTS.powerUser,
      AI_SCENARIO_FRAGMENTS.slowModel,
      { history: { conversations: 2 }, modelId: 'py-orbit-pro' }
    );
    expect(composed.history).toEqual({ conversations: 2, messagesPerConversation: 75 });
    expect(composed.modelId).toBe('py-orbit-pro');
    expect(AI_SCENARIO_FRAGMENTS.powerUser.history).toEqual({
      conversations: 8,
      messagesPerConversation: 75,
    });
    const fixture = generate(composed);
    expect(fixture.workspace.conversations).toHaveLength(2);
    expect(fixture.workspace.modelId).toBe('py-orbit-pro');
    expect(fixture.environment.latencyMs).toBe(2_500);
  });
});
