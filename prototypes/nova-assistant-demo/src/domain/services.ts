import {
  AI_MODELS,
  type AiModel,
  createAiAgentRunner,
  createSimulatedSearchTool,
  DEFAULT_RESPONSE_PACKS,
  type ResponseInput,
  responseRng,
  selectResponsePack,
} from '@protoyard/ai';
import { createRng, createRuntimeId, hashString, type PrototypeRuntime } from '@protoyard/core';
import { z } from 'zod';
import type { AssistantDatabase, Message, WorkspaceSettings } from '../database/schema.ts';
import { CAPABILITIES } from './policy.ts';

const promptSchema = z
  .string()
  .trim()
  .min(1, 'Write a message first.')
  .max(8000, 'Messages are limited to 8,000 characters.');
const titleSchema = z
  .string()
  .trim()
  .min(2, 'Use at least 2 characters.')
  .max(80, 'Keep the title under 80 characters.');
const settingsSchema = z.object({
  customInstructions: z.string().trim().max(1200),
  memory: z.string().trim().max(1200),
  memoryEnabled: z.boolean(),
  dataControls: z.enum(['standard', 'private']),
  monthlyLimit: z.number().int().min(1000).max(10_000_000),
});
const folderSchema = z.string().trim().min(1).max(40);
const USER_MODEL: AiModel = {
  id: 'py-orbit-agent',
  name: 'Orbit Agent',
  provider: 'Protoyard Simulations',
  contextWindow: 16_000,
  inputCostPerMillion: 0.2,
  outputCostPerMillion: 0.8,
  simulated: true,
};
const MODELS = [...AI_MODELS, USER_MODEL];
const splitTokens = (value: string) => value.match(/\S+\s*/g) ?? [];
const estimateTokens = (value: string) => Math.ceil(value.trim().length / 4);
const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export interface AssistantServices {
  createConversation(projectId?: string): Promise<string>;
  send(
    conversationId: string,
    prompt: string,
    model: AiModel,
    attachments?: readonly File[],
    agentApproved?: boolean
  ): Promise<void>;
  stop(conversationId: string): void;
  rename(conversationId: string, title: string): Promise<void>;
  togglePin(conversationId: string): Promise<void>;
  setModel(conversationId: string, modelId: string): Promise<void>;
  moveToFolder(conversationId: string, folder: string | null): Promise<void>;
  createFolder(name: string): Promise<void>;
  saveSettings(
    input: Pick<
      WorkspaceSettings,
      'customInstructions' | 'memory' | 'memoryEnabled' | 'dataControls' | 'monthlyLimit'
    >
  ): Promise<void>;
  clearMemory(): Promise<void>;
  clearWorkspace(): Promise<void>;
  updateCanvas(content: string): Promise<void>;
  closeCanvas(): Promise<void>;
  feedback(messageId: string, rating: 'up' | 'down'): Promise<void>;
  share(conversationId: string): Promise<string>;
  regenerate(conversationId: string): Promise<void>;
  editMessage(
    conversationId: string,
    messageId: string,
    content: string,
    model: AiModel
  ): Promise<void>;
}

export function createAssistantServices(
  runtime: PrototypeRuntime<AssistantDatabase>,
  options: { chunkDelayMs?: number; sleep?: (ms: number) => Promise<void> } = {}
): AssistantServices {
  const { db, session, environment, clock } = runtime;
  const sleep = options.sleep ?? defaultSleep;
  const chunkDelay = options.chunkDelayMs ?? 12;
  const activeStreams = new Map<string, { stopped: boolean }>();
  const requestTimes: number[] = [];
  const getSettings = async () => {
    const settings = await db.settings.get('workspace');
    if (!settings) throw new Error('Assistant workspace settings are missing.');
    return settings;
  };
  const getConversation = async (id: string) => {
    const conversation = await db.conversations.get(id);
    if (!conversation) throw new RangeError('This conversation no longer exists.');
    return conversation;
  };
  const authorize = (capability: string, record?: unknown) => session.assert(capability, record);

  async function generateReply(
    conversationId: string,
    prompt: string,
    model: AiModel,
    files: readonly File[] = [],
    agentApproved = false,
    options: {
      reuseUserMessageId?: string;
      deleteMessageIds?: readonly string[];
      attempt?: number;
    } = {}
  ) {
    authorize(CAPABILITIES.write);
    const cleanPrompt = promptSchema.parse(prompt);
    const conversation = await getConversation(conversationId);
    const modelToUse = MODELS.find((item) => item.id === model.id);
    if (!modelToUse) throw new RangeError('Choose a supported simulated model.');
    const settings = await getSettings();
    if (modelToUse.id === USER_MODEL.id && settings.agentApprovalRequired && !agentApproved) {
      throw new Error('This scenario requires approval before the simulated agent can run.');
    }
    const nowMs = clock.nowMs();
    while (requestTimes[0] !== undefined && requestTimes[0] <= nowMs - 60_000) requestTimes.shift();
    if (requestTimes.length >= settings.maxRequestsPerMinute) {
      throw new RangeError(
        'The simulated model request limit was reached. Wait for the simulated minute to pass.'
      );
    }
    const history = await db.messages
      .where('conversationId')
      .equals(conversationId)
      .sortBy('createdAt');
    const historyForContext = options.deleteMessageIds?.length
      ? history.filter((message) => !options.deleteMessageIds!.includes(message.id))
      : history;
    const contextualPrompt = [
      settings.customInstructions && `Workspace instructions: ${settings.customInstructions}`,
      settings.dataControls !== 'private' &&
        settings.memoryEnabled &&
        settings.memory &&
        `Remembered context: ${settings.memory}`,
      cleanPrompt,
    ]
      .filter(Boolean)
      .join('\n\n');
    const contextMessages = historyForContext.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      createdAt: message.createdAt,
      ...(message.model ? { model: message.model } : {}),
    }));
    const modelPromptTokens = estimateTokens(
      contextMessages.map((message) => message.content).join(' ') + contextualPrompt
    );
    const monthKey = clock.now().toISOString().slice(0, 7);
    const monthMessages = await db.messages.where('createdAt').startsWith(monthKey).toArray();
    const usedTokens = monthMessages.reduce(
      (sum, message) => sum + (message.usage?.totalTokens ?? 0),
      0
    );
    if (usedTokens + modelPromptTokens > settings.monthlyLimit) {
      throw new RangeError(
        'The simulated monthly usage limit has been reached. Update the limit in Settings to continue.'
      );
    }

    await environment.run('ai.conversation.precheck', async () => undefined);

    requestTimes.push(nowMs);
    const at = clock.now().toISOString();
    const attempt = options.attempt ?? 0;
    const user: Message = {
      id: options.reuseUserMessageId ?? createRuntimeId('ai_user'),
      conversationId,
      role: 'user',
      content: cleanPrompt,
      createdAt: at,
      ...(files.length ? { attachments: files.map((file) => file.name).slice(0, 8) } : {}),
    };
    const replyId = createRuntimeId('ai_reply');
    const reply: Message = {
      id: replyId,
      conversationId,
      role: 'assistant',
      content: '',
      createdAt: at,
      model: modelToUse.id,
    };

    try {
      await environment.run('ai.conversation.send', async () => {
        await db.transaction('rw', db.messages, db.conversations, async () => {
          for (const id of options.deleteMessageIds ?? []) {
            await db.messages.delete(id);
          }
          if (!options.reuseUserMessageId) {
            await db.messages.add(user);
          }
          await db.messages.add(reply);
          await db.conversations.update(conversationId, { updatedAt: at, modelId: modelToUse.id });
        });
      });

      let answer: string;
      if (modelToUse.id === USER_MODEL.id) {
        const runner = createAiAgentRunner({
          context: {
            seed: runtime.manifest.id,
            rng: createRng(
              hashString(`${runtime.manifest.id}:${conversationId}:${cleanPrompt}:${attempt}`)
            ),
            clock: { now: () => clock.now(), nowMs: () => clock.nowMs(), sleep: async () => {} },
            environment,
          },
          tools: [createSimulatedSearchTool()],
          planner: ({ prompt: task }) => ({
            goal: `Plan a safe local response to: ${task}`,
            calls: /search|find|research|launch|customer/i.test(task)
              ? [
                  {
                    tool: 'search',
                    input: { query: task },
                    reason: 'Search the fictional local knowledge index.',
                    requiresApproval: settings.agentApprovalRequired,
                  },
                ]
              : [],
          }),
          answer: ({ prompt: task, results }) => {
            const found = results.find((result) => result.status === 'succeeded');
            const docs = Array.isArray(found?.output)
              ? (found.output as { title: string; snippet: string }[])
              : [];
            return docs.length
              ? `I ran a simulated local search for “${task}”.\n\n${docs.map((doc) => `• ${doc.title}: ${doc.snippet}`).join('\n')}`
              : `I made a simulated plan for “${task}”. Start by clarifying the outcome, review the next action, and approve any real-world changes yourself.`;
          },
        });
        const run = runner.start(cleanPrompt);
        if (agentApproved) {
          for (let wait = 0; wait < 4 && run.status === 'running'; wait++) await Promise.resolve();
          if (run.status === 'awaiting-approval') run.approve();
        }
        const result = await run.done;
        answer = result.answer ?? 'The simulated agent did not produce a response.';
      } else {
        const responsePack = selectResponsePack(
          DEFAULT_RESPONSE_PACKS,
          runtime.manifest.id,
          contextualPrompt,
          attempt
        );
        const input: ResponseInput = {
          prompt: contextualPrompt,
          history: contextMessages,
          model: modelToUse,
          rng: responseRng(runtime.manifest.id, contextualPrompt, attempt),
        };
        answer = await environment.run('ai.generate', () => responsePack.generate(input));
      }

      const streamState = { stopped: false };
      activeStreams.set(conversationId, streamState);
      let streamed = '';
      for (const token of splitTokens(answer)) {
        if (streamState.stopped) break;
        streamed += token;
        await db.messages.update(replyId, { content: streamed });
        if (chunkDelay > 0) await sleep(chunkDelay);
      }
      const completionTokens = estimateTokens(answer);
      if (usedTokens + modelPromptTokens + completionTokens > settings.monthlyLimit) {
        throw new RangeError(
          'This reply would exceed the simulated monthly token limit. Raise the limit in Settings or try a shorter prompt.'
        );
      }
      const usage = {
        promptTokens: modelPromptTokens,
        completionTokens,
        totalTokens: modelPromptTokens + completionTokens,
        costUsd:
          (modelPromptTokens * modelToUse.inputCostPerMillion +
            completionTokens * modelToUse.outputCostPerMillion) /
          1_000_000,
      };
      await db.transaction('rw', db.messages, db.conversations, async () => {
        await db.messages.update(replyId, { content: streamed, usage });
        await db.conversations.update(conversationId, { updatedAt: clock.now().toISOString() });
      });
      activeStreams.delete(conversationId);
      const latest = streamed.trim();
      if (/\b(draft|write|code|plan|canvas)\b/i.test(cleanPrompt)) {
        const title = cleanPrompt.length > 36 ? `${cleanPrompt.slice(0, 33)}…` : cleanPrompt;
        await db.settings.update('workspace', {
          canvas: {
            title,
            content: latest,
            kind: /\b(code|typescript|function)\b/i.test(cleanPrompt) ? 'code' : 'document',
          },
        });
      }
    } catch (error) {
      activeStreams.delete(conversationId);
      await db.messages.delete(replyId);
      throw error;
    }
    return conversation;
  }

  return {
    async createConversation(projectId) {
      authorize(CAPABILITIES.write);
      const cleanProject = projectId ?? (await db.projects.orderBy('createdAt').first())?.id;
      if (!cleanProject || !(await db.projects.get(cleanProject)))
        throw new RangeError('Choose a workspace project first.');
      const id = createRuntimeId('ai_chat');
      const now = clock.now().toISOString();
      await environment.run('ai.conversation.create', async () => {
        await db.conversations.add({
          id,
          title: 'New conversation',
          projectId: cleanProject,
          updatedAt: now,
          modelId: AI_MODELS.at(0)?.id ?? 'py-orbit-small',
        });
      });
      return id;
    },
    async send(conversationId, prompt, model, attachments, agentApproved) {
      await generateReply(conversationId, prompt, model, attachments, agentApproved);
    },
    stop(conversationId) {
      const stream = activeStreams.get(conversationId);
      if (stream) stream.stopped = true;
    },
    async rename(conversationId, title) {
      const conversation = await getConversation(conversationId);
      authorize(CAPABILITIES.write, conversation);
      const parsed = titleSchema.parse(title);
      await environment.run('ai.conversation.rename', () =>
        db.conversations.update(conversationId, { title: parsed })
      );
    },
    async togglePin(conversationId) {
      const conversation = await getConversation(conversationId);
      authorize(CAPABILITIES.write, conversation);
      await environment.run('ai.conversation.pin', () =>
        db.conversations.update(conversationId, { pinned: !conversation.pinned })
      );
    },
    async setModel(conversationId, modelId) {
      const conversation = await getConversation(conversationId);
      authorize(CAPABILITIES.write, conversation);
      if (!MODELS.some((model) => model.id === modelId))
        throw new RangeError('Choose a supported simulated model.');
      await environment.run('ai.model.select', () =>
        db.conversations.update(conversationId, { modelId })
      );
    },
    async moveToFolder(conversationId, folder) {
      const conversation = await getConversation(conversationId);
      authorize(CAPABILITIES.write, conversation);
      const settings = await getSettings();
      if (folder && !settings.folders.includes(folder))
        throw new RangeError('Create this folder before moving a conversation into it.');
      await environment.run('ai.conversation.folder', () =>
        db.conversations.update(conversationId, { folder: folder ?? undefined })
      );
    },
    async createFolder(name) {
      authorize(CAPABILITIES.write);
      const folder = folderSchema.parse(name);
      const settings = await getSettings();
      if (settings.folders.includes(folder)) return;
      await environment.run('ai.folder.create', () =>
        db.settings.update('workspace', {
          folders: [...settings.folders, folder],
          updatedAt: clock.now().toISOString(),
        })
      );
    },
    async saveSettings(input) {
      authorize(CAPABILITIES.settings);
      const parsed = settingsSchema.parse(input);
      await environment.run('ai.settings.update', () =>
        db.settings.update('workspace', { ...parsed, updatedAt: clock.now().toISOString() })
      );
    },
    async clearMemory() {
      authorize(CAPABILITIES.settings);
      await environment.run('ai.memory.clear', () =>
        db.settings.update('workspace', { memory: '', updatedAt: clock.now().toISOString() })
      );
    },
    async clearWorkspace() {
      authorize(CAPABILITIES.data);
      await environment.run('ai.data.clear', () =>
        db.transaction('rw', db.projects, db.conversations, db.messages, async () => {
          await db.messages.clear();
          await db.conversations.clear();
          await db.projects.clear();
        })
      );
    },
    async updateCanvas(content) {
      authorize(CAPABILITIES.write);
      const clean = z.string().max(20_000).parse(content);
      await environment.run('ai.canvas.update', () =>
        db.settings.update('workspace', {
          canvas: { title: 'Working canvas', content: clean, kind: 'document' },
          updatedAt: clock.now().toISOString(),
        })
      );
    },
    async closeCanvas() {
      authorize(CAPABILITIES.write);
      await environment.run('ai.canvas.close', () =>
        db.settings.update('workspace', { canvas: null, updatedAt: clock.now().toISOString() })
      );
    },
    async feedback(messageId, rating) {
      authorize(CAPABILITIES.write);
      const validRating = z.enum(['up', 'down']).parse(rating);
      const message = await db.messages.get(messageId);
      if (message?.role !== 'assistant')
        throw new RangeError('Feedback is only available on assistant replies.');
      await environment.run('ai.feedback', () =>
        db.messages.update(messageId, { feedback: validRating })
      );
    },
    async share(conversationId) {
      authorize(CAPABILITIES.read);
      await getConversation(conversationId);
      return `${window.location.origin}${window.location.pathname}#conversation=${encodeURIComponent(conversationId)}`;
    },
    async regenerate(conversationId) {
      authorize(CAPABILITIES.write);
      const messages = await db.messages
        .where('conversationId')
        .equals(conversationId)
        .sortBy('createdAt');
      // Prefer the latest assistant reply and the user turn immediately before it
      // (equal createdAt can make `.at(-1)` ambiguous).
      let lastAssistant: (typeof messages)[number] | undefined;
      let prompt: (typeof messages)[number] | undefined;
      for (let i = messages.length - 1; i >= 0; i -= 1) {
        const row = messages[i]!;
        if (!lastAssistant && row.role === 'assistant') lastAssistant = row;
        if (lastAssistant && row.role === 'user') {
          prompt = row;
          break;
        }
      }
      if (!prompt) prompt = [...messages].reverse().find((row) => row.role === 'user');
      if (prompt?.role !== 'user')
        throw new RangeError('No user message is available to regenerate.');
      const conversation = await getConversation(conversationId);
      const model = MODELS.find((item) => item.id === conversation.modelId) ?? AI_MODELS.at(0);
      if (!model) throw new RangeError('No simulated models are available.');
      const attempt = messages.filter((row) => row.role === 'assistant').length;
      const deleteIds = lastAssistant ? [lastAssistant.id] : [];
      await generateReply(conversationId, prompt.content, model, [], false, {
        reuseUserMessageId: prompt.id,
        deleteMessageIds: deleteIds,
        attempt,
      });
    },
    async editMessage(conversationId, messageId, content, model) {
      authorize(CAPABILITIES.write);
      const message = await db.messages.get(messageId);
      if (!message || message.conversationId !== conversationId || message.role !== 'user')
        throw new RangeError('Choose a user message in this conversation.');
      promptSchema.parse(content);
      const messages = await db.messages
        .where('conversationId')
        .equals(conversationId)
        .sortBy('createdAt');
      const deleteIds = messages
        .filter((item) => Date.parse(item.createdAt) >= Date.parse(message.createdAt))
        .map((item) => item.id);
      await generateReply(conversationId, content, model, [], false, {
        deleteMessageIds: deleteIds,
      });
    },
  };
}

export { MODELS as ASSISTANT_MODELS };
