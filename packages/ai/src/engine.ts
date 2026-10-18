import { AI_MODELS } from './models.ts';
import { DEFAULT_RESPONSE_PACKS, responseRng, selectResponsePack } from './packs.ts';
import type {
  AiBranch,
  AiChunk,
  AiEngineOptions,
  AiMessage,
  AiModel,
  AiStream,
  AiUsage,
  ResponseInput,
  ResponsePack,
  StreamOptions,
} from './types.ts';

export class AiRateLimitError extends Error {
  readonly retryAtMs: number;
  constructor(retryAtMs: number) {
    super('The simulated AI request limit was reached. Try again later.');
    this.name = 'AiRateLimitError';
    this.retryAtMs = retryAtMs;
  }
}

export class AiContextWindowError extends Error {
  readonly tokens: number;
  readonly limit: number;
  constructor(tokens: number, limit: number) {
    super(`Prompt uses ${tokens} estimated tokens; the selected model allows ${limit}.`);
    this.name = 'AiContextWindowError';
    this.tokens = tokens;
    this.limit = limit;
  }
}

export interface AiEngine {
  readonly models: readonly AiModel[];
  readonly packs: readonly ResponsePack[];
  createConversation(id?: string): AiBranch;
  getConversation(id: string): AiBranch;
  listConversations(): AiBranch[];
  stream(conversationId: string, prompt: string, options?: StreamOptions): AiStream;
  stop(streamId: string): void;
  regenerate(conversationId: string, options?: StreamOptions): AiStream;
  editAndResend(
    conversationId: string,
    userMessageId: string,
    prompt: string,
    options?: StreamOptions
  ): AiStream;
  branch(conversationId: string, throughMessageId?: string, id?: string): AiBranch;
  usage(conversationId: string): AiUsage;
  context(
    conversationId: string,
    modelId?: string
  ): { usedTokens: number; limit: number; remainingTokens: number };
}

const estimateTokens = (value: string) => Math.ceil(value.trim().length / 4);
const tokenize = (value: string) => value.match(/\S+\s*/g) ?? [];

export function createAiEngine(options: AiEngineOptions): AiEngine {
  const { context: ctx } = options;
  const models = options.models ?? AI_MODELS;
  const packs = options.packs ?? DEFAULT_RESPONSE_PACKS;
  const maxRequestsPerMinute = options.maxRequestsPerMinute ?? 30;
  const defaultCadenceMs = options.defaultCadenceMs ?? 24;
  const conversations = new Map<string, AiBranch>();
  const stopped = new Set<string>();
  const requests: number[] = [];
  let conversationSequence = 0;
  let messageSequence = 0;
  let streamSequence = 0;

  const messageId = () => `msg_${String(++messageSequence).padStart(4, '0')}`;
  const findConversation = (id: string) => {
    const conversation = conversations.get(id);
    if (!conversation) throw new RangeError(`Unknown conversation: ${id}`);
    return conversation;
  };
  const findModel = (id?: string) => {
    const model = models.find((item) => item.id === (id ?? models[0]?.id));
    if (!model) throw new RangeError(`Unknown simulated model: ${id}`);
    return model;
  };
  const enforceRateLimit = () => {
    const now = ctx.clock.nowMs();
    while (requests[0] !== undefined && requests[0] <= now - 60_000) requests.shift();
    if (requests.length >= maxRequestsPerMinute)
      throw new AiRateLimitError((requests[0] ?? now) + 60_000);
    requests.push(now);
  };

  const createConversation = (id?: string): AiBranch => {
    const branchId = id ?? `chat_${String(++conversationSequence).padStart(4, '0')}`;
    if (conversations.has(branchId))
      throw new RangeError(`Conversation already exists: ${branchId}`);
    const branch: AiBranch = { id: branchId, messages: [] };
    conversations.set(branchId, branch);
    return branch;
  };

  const stream = (
    conversationId: string,
    prompt: string,
    streamOptions: StreamOptions = {}
  ): AiStream => {
    const branch = findConversation(conversationId);
    const model = findModel(streamOptions.model);
    const streamId = `stream_${String(++streamSequence).padStart(4, '0')}`;
    let localStopped = false;
    const stop = () => {
      localStopped = true;
      stopped.add(streamId);
    };
    const iterator = async function* (): AsyncGenerator<AiChunk> {
      enforceRateLimit();
      const userMessage: AiMessage = {
        id: messageId(),
        role: 'user',
        content: prompt,
        createdAt: ctx.clock.now().toISOString(),
      };
      branch.messages.push(userMessage);
      const promptTokens = branch.messages.reduce(
        (sum, message) => sum + estimateTokens(message.content),
        0
      );
      if (promptTokens > model.contextWindow) {
        branch.messages.pop();
        throw new AiContextWindowError(promptTokens, model.contextWindow);
      }
      const responsePack = selectResponsePack(packs, ctx.seed, prompt);
      const rng = responseRng(ctx.seed, prompt);
      const input: ResponseInput = { prompt, history: branch.messages, model, rng };
      // Environment latency, offline mode, and deterministic failures are evaluated once per response.
      const response = await ctx.environment.run('ai.generate', () => responsePack.generate(input));
      const answer = tokenize(response)
        .slice(0, streamOptions.maxTokens ?? Number.POSITIVE_INFINITY)
        .join('');
      const tokens = tokenize(answer);
      const cadence = Math.max(0, streamOptions.cadenceMs ?? defaultCadenceMs);
      let partial = '';
      for (let index = 0; index < tokens.length; index++) {
        if (localStopped || stopped.has(streamId)) break;
        if (cadence > 0) await ctx.clock.sleep(cadence);
        if (localStopped || stopped.has(streamId)) break;
        partial += tokens[index];
        yield { streamId, token: tokens[index] as string, index };
      }
      if (partial) {
        const completionTokens = estimateTokens(partial);
        const used: AiUsage = {
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
          costUsd:
            (promptTokens * model.inputCostPerMillion +
              completionTokens * model.outputCostPerMillion) /
            1_000_000,
        };
        branch.messages.push({
          id: messageId(),
          role: 'assistant',
          content: partial,
          createdAt: ctx.clock.now().toISOString(),
          model: model.id,
          usage: used,
        });
      }
      stopped.delete(streamId);
    };
    return {
      id: streamId,
      stop,
      [Symbol.asyncIterator]: iterator,
    };
  };

  const stop = (streamId: string) => {
    stopped.add(streamId);
  };

  const regenerate = (conversationId: string, streamOptions: StreamOptions = {}) => {
    const branch = findConversation(conversationId);
    const last = branch.messages.at(-1);
    if (last?.role === 'assistant') branch.messages.pop();
    const user = branch.messages.at(-1);
    if (user?.role !== 'user') throw new RangeError('No user message is available to regenerate.');
    branch.messages.pop();
    return stream(conversationId, user.content, streamOptions);
  };

  const editAndResend = (
    conversationId: string,
    userMessageId: string,
    prompt: string,
    streamOptions: StreamOptions = {}
  ) => {
    const branch = findConversation(conversationId);
    const index = branch.messages.findIndex(
      (message) => message.id === userMessageId && message.role === 'user'
    );
    if (index < 0) throw new RangeError(`Unknown user message: ${userMessageId}`);
    branch.messages.splice(index);
    return stream(conversationId, prompt, streamOptions);
  };

  const branchConversation = (conversationId: string, throughMessageId?: string, id?: string) => {
    const source = findConversation(conversationId);
    const destinationId = id ?? `chat_${String(++conversationSequence).padStart(4, '0')}`;
    if (conversations.has(destinationId))
      throw new RangeError(`Conversation already exists: ${destinationId}`);
    const end = throughMessageId
      ? source.messages.findIndex((message) => message.id === throughMessageId)
      : source.messages.length - 1;
    if (throughMessageId && end < 0) throw new RangeError(`Unknown message: ${throughMessageId}`);
    const result: AiBranch = {
      id: destinationId,
      parentId: conversationId,
      messages: source.messages.slice(0, end + 1).map((message) => ({
        ...message,
        usage: message.usage ? { ...message.usage } : undefined,
      })),
    };
    conversations.set(destinationId, result);
    return result;
  };

  const usage = (conversationId: string): AiUsage => {
    const messages = findConversation(conversationId).messages;
    return messages.reduce<AiUsage>(
      (total, message) => {
        if (message.usage) {
          total.promptTokens += message.usage.promptTokens;
          total.completionTokens += message.usage.completionTokens;
          total.totalTokens += message.usage.totalTokens;
          total.costUsd += message.usage.costUsd;
        }
        return total;
      },
      { promptTokens: 0, completionTokens: 0, totalTokens: 0, costUsd: 0 }
    );
  };

  const contextWindow = (conversationId: string, modelId?: string) => {
    const model = findModel(modelId);
    const usedTokens = findConversation(conversationId).messages.reduce(
      (sum, message) => sum + estimateTokens(message.content),
      0
    );
    return {
      usedTokens,
      limit: model.contextWindow,
      remainingTokens: Math.max(0, model.contextWindow - usedTokens),
    };
  };

  return {
    models,
    packs,
    createConversation,
    getConversation: (id) => findConversation(id),
    listConversations: () => [...conversations.values()],
    stream,
    stop,
    regenerate,
    editAndResend,
    branch: branchConversation,
    usage,
    context: contextWindow,
  };
}

export const AI_ENGINE_VERSION = '1.0.0';
