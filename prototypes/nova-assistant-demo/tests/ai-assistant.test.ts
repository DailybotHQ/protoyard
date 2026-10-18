import { AI_MODELS } from '@protoyard/ai';
import { PermissionDeniedError, parseScenario } from '@protoyard/core';
import { createGenerateContext, validateWorld } from '@protoyard/scenarios';
import { afterEach, describe, expect, it } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import type { AssistantDatabase } from '../src/database/schema.ts';
import { createAssistantServices } from '../src/domain/services.ts';
import { definition } from '../src/prototype.ts';
import { generateAssistantWorld } from '../src/scenarios/generators.ts';

const SCENARIOS = [
  'fresh-workspace',
  'active-workspace',
  'power-user',
  'long-history',
  'slow-model',
  'rate-limited',
  'assistant-outage',
  'agent-approval',
];
const getScenario = (id: string) => {
  const input = definition.scenarios.find((scenario) => scenario.id === id);
  if (!input) throw new Error(`missing scenario ${id}`);
  return parseScenario(input);
};

describe('AI assistant template', () => {
  let harness = createHarness<AssistantDatabase>(definition);
  afterEach(() => {
    harness.closeAll();
    harness = createHarness<AssistantDatabase>(definition);
  });

  it('generates deterministic workspaces with valid project and message relations', () => {
    for (const id of SCENARIOS) {
      const scenario = getScenario(id);
      const first = generateAssistantWorld(createGenerateContext(scenario));
      expect(generateAssistantWorld(createGenerateContext(scenario)), id).toEqual(first);
      expect(
        validateWorld(first, { ...definition.integrity, referenceTime: scenario.referenceTime }),
        id
      ).toEqual([]);
      expect(first.tables.projects).toHaveLength(3);
      expect(first.tables.settings).toHaveLength(1);
    }
    expect(
      generateAssistantWorld(createGenerateContext(getScenario('fresh-workspace'))).tables
        .conversations
    ).toHaveLength(0);
    expect(
      generateAssistantWorld(createGenerateContext(getScenario('power-user'))).tables.conversations
    ).toHaveLength(6);
  });

  it('generates a deterministic 5,000-message thread for the virtual history view', () => {
    const scenario = getScenario('long-history');
    const first = generateAssistantWorld(createGenerateContext(scenario));
    const second = generateAssistantWorld(createGenerateContext(scenario));
    expect(first.tables.messages).toHaveLength(5000);
    expect(second).toEqual(first);
    expect(
      validateWorld(first, { ...definition.integrity, referenceTime: scenario.referenceTime })
    ).toEqual([]);
  });

  it('persists conversations and deterministic assistant replies with usage', async () => {
    const runtime = await harness.boot('fresh-workspace');
    const services = createAssistantServices(runtime, { chunkDelayMs: 0 });
    const [project] = await runtime.db.projects.toArray();
    const conversationId = await services.createConversation(project?.id);
    await services.send(conversationId, 'Help me draft a launch plan.', AI_MODELS[0]!);
    const rows = await runtime.db.messages
      .where('conversationId')
      .equals(conversationId)
      .sortBy('createdAt');
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.role === 'user')?.content).toBe('Help me draft a launch plan.');
    const reply = rows.find((row) => row.role === 'assistant');
    expect(reply).toMatchObject({ model: AI_MODELS[0]!.id });
    expect(reply?.content).toMatch(/practical|starting point|manageable/i);
    expect(reply?.usage?.totalTokens).toBeGreaterThan(0);
    expect((await runtime.db.settings.get('workspace'))?.canvas?.content).toBe(reply?.content);
  });

  it('stops an in-flight response stream and records only emitted token usage', async () => {
    const runtime = await harness.boot('fresh-workspace');
    let releaseChunk: (() => void) | undefined;
    let signalChunk: (() => void) | undefined;
    const chunkStarted = new Promise<void>((resolve) => {
      signalChunk = resolve;
    });
    const chunkGate = new Promise<void>((resolve) => {
      releaseChunk = resolve;
    });
    const services = createAssistantServices(runtime, {
      chunkDelayMs: 1,
      sleep: async () => {
        signalChunk?.();
        await chunkGate;
      },
    });
    const [project] = await runtime.db.projects.toArray();
    const conversationId = await services.createConversation(project?.id);
    const sending = services.send(conversationId, 'Help me plan a launch.', AI_MODELS[0]!);
    await chunkStarted;
    services.stop(conversationId);
    releaseChunk?.();
    await sending;

    const rows = await runtime.db.messages.where('conversationId').equals(conversationId).toArray();
    const reply = rows.find((row) => row.role === 'assistant');
    expect(reply?.content.length).toBeGreaterThan(0);
    expect(reply?.content.length).toBeLessThan(100);
    expect(reply?.usage?.completionTokens).toBeGreaterThan(0);
  });

  it('persists memory and privacy controls and excludes private memory from generation', async () => {
    const runtime = await harness.boot('fresh-workspace');
    const services = createAssistantServices(runtime, { chunkDelayMs: 0 });
    await services.saveSettings({
      customInstructions: 'Use short bullet points.',
      memory: 'Secretly remember the private phrase.',
      memoryEnabled: true,
      dataControls: 'private',
      monthlyLimit: 5000,
    });
    expect(await runtime.db.settings.get('workspace')).toMatchObject({
      dataControls: 'private',
      monthlyLimit: 5000,
    });
    const [project] = await runtime.db.projects.toArray();
    const conversationId = await services.createConversation(project?.id);
    await services.send(conversationId, 'Give me one short idea.', AI_MODELS[0]!);
    const reply = (
      await runtime.db.messages.where('conversationId').equals(conversationId).toArray()
    ).find((item) => item.role === 'assistant');
    expect(reply?.content).not.toContain('Secretly remember the private phrase.');
    await services.clearMemory();
    expect((await runtime.db.settings.get('workspace'))?.memory).toBe('');
  });

  it('rejects prompts that exceed the configured simulated usage budget', async () => {
    const runtime = await harness.boot('fresh-workspace');
    const services = createAssistantServices(runtime, { chunkDelayMs: 0 });
    const [project] = await runtime.db.projects.toArray();
    const conversationId = await services.createConversation(project?.id);
    await services.saveSettings({
      customInstructions: '',
      memory: '',
      memoryEnabled: false,
      dataControls: 'private',
      monthlyLimit: 1000,
    });
    await expect(services.send(conversationId, 'x'.repeat(5000), AI_MODELS[0]!)).rejects.toThrow(
      /usage limit/i
    );
    expect(await runtime.db.messages.where('conversationId').equals(conversationId).count()).toBe(
      0
    );
  });

  it('enforces role capabilities at the service boundary and supports local agent runs', async () => {
    const runtime = await harness.boot('fresh-workspace');
    const services = createAssistantServices(runtime, { chunkDelayMs: 0 });
    const [project] = await runtime.db.projects.toArray();
    const conversationId = await services.createConversation(project?.id);
    await services.send(conversationId, 'Search the launch checklist.', {
      ...AI_MODELS[0]!,
      id: 'py-orbit-agent',
      name: 'Orbit Agent',
    });
    const reply = (
      await runtime.db.messages.where('conversationId').equals(conversationId).toArray()
    ).find((item) => item.role === 'assistant');
    expect(reply?.content).toMatch(/simulated local search|launch checklist/i);
    await runtime.session.switchActor('user_0003');
    await expect(
      services.send(conversationId, 'A viewer cannot send.', AI_MODELS[0]!)
    ).rejects.toBeInstanceOf(PermissionDeniedError);
  });

  it('enforces simulated request limits and explicit approval in their scenarios', async () => {
    const rateRuntime = await harness.boot('rate-limited');
    const rateServices = createAssistantServices(rateRuntime, { chunkDelayMs: 0 });
    const [rateProject] = await rateRuntime.db.projects.toArray();
    const rateConversation = await rateServices.createConversation(rateProject?.id);
    await rateServices.send(rateConversation, 'First request.', AI_MODELS[0]!);
    await rateServices.send(rateConversation, 'Second request.', AI_MODELS[0]!);
    await expect(
      rateServices.send(rateConversation, 'Third request.', AI_MODELS[0]!)
    ).rejects.toThrow(/request limit/i);

    harness.closeAll();
    harness = createHarness<AssistantDatabase>(definition);
    const agentRuntime = await harness.boot('agent-approval');
    const agentServices = createAssistantServices(agentRuntime, { chunkDelayMs: 0 });
    const [agentProject] = await agentRuntime.db.projects.toArray();
    const agentConversation = await agentServices.createConversation(agentProject?.id);
    const agentModel = { ...AI_MODELS[0]!, id: 'py-orbit-agent', name: 'Orbit Agent' };
    await expect(
      agentServices.send(agentConversation, 'Search the launch checklist.', agentModel)
    ).rejects.toThrow(/requires approval/i);
    await agentServices.send(
      agentConversation,
      'Search the launch checklist.',
      agentModel,
      [],
      true
    );
    expect(
      (
        await agentRuntime.db.messages.where('conversationId').equals(agentConversation).toArray()
      ).some((message) => message.content.includes('simulated local search'))
    ).toBe(true);
  });
});
