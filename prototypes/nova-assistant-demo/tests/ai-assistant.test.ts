import { AI_MODELS } from '@protoyard/ai';
import { afterEach, describe, expect, it } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import { expectBootableWorld } from '../../../tests/support/smoke.ts';
import type { AssistantDatabase } from '../src/database/schema.ts';
import { createAssistantServices } from '../src/domain/services.ts';
import { definition } from '../src/prototype.ts';

describe('AI assistant template', () => {
  let harness = createHarness<AssistantDatabase>(definition);
  afterEach(() => {
    harness.closeAll();
    harness = createHarness<AssistantDatabase>(definition);
  });

  it('generates deterministic worlds and boots the default scenario', async () => {
    await expectBootableWorld(definition, harness);
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
});
