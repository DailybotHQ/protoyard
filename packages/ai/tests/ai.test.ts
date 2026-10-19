import { createRng, createSimulationEnvironment, SimulatedServiceError } from '@protoyard/core';
import { describe, expect, it } from 'vitest';
import {
  AiRateLimitError,
  createAiEngine,
  DEFAULT_RESPONSE_PACKS,
  refusalPack,
  scriptedPack,
  selectResponsePack,
  templatedPack,
} from '../src/index.ts';

function makeContext(seed: number | string = 42) {
  let now = Date.parse('2026-10-17T12:00:00.000Z');
  const sleeps: number[] = [];
  const environment = createSimulationEnvironment({
    sleep: async (ms) => {
      now += ms;
    },
  });
  return {
    sleeps,
    context: {
      seed,
      rng: createRng(seed),
      clock: {
        now: () => new Date(now),
        nowMs: () => now,
        sleep: async (ms: number) => {
          sleeps.push(ms);
          now += ms;
        },
      },
      environment,
    },
  };
}

async function collect(stream: AsyncIterable<{ token: string }>) {
  let text = '';
  for await (const chunk of stream) text += chunk.token;
  return text;
}

describe('@protoyard/ai', () => {
  it('selects deterministic responses and streams with simulated cadence', async () => {
    const make = () => {
      const state = makeContext();
      const engine = createAiEngine({
        context: state.context,
        packs: [scriptedPack('fixed', ['One steady answer.'])],
      });
      const chat = engine.createConversation('demo');
      return { state, engine, chat };
    };
    const a = make();
    const b = make();
    const textA = await collect(a.engine.stream(a.chat.id, 'hello', { cadenceMs: 11 }));
    const textB = await collect(b.engine.stream(b.chat.id, 'hello', { cadenceMs: 11 }));
    expect(textA).toBe('One steady answer.');
    expect(textA).toBe(textB);
    expect(a.state.sleeps).toEqual([11, 11, 11]);
    expect(a.engine.usage('demo').totalTokens).toBeGreaterThan(0);
  });

  it('stops a stream and supports regenerate, edit-and-resend, and branches', async () => {
    const { context } = makeContext();
    const engine = createAiEngine({
      context,
      packs: [scriptedPack('fixed', ['one two three four'])],
    });
    const chat = engine.createConversation('main');
    const stream = engine.stream(chat.id, 'first', { cadenceMs: 1 });
    const iterator = stream[Symbol.asyncIterator]();
    expect((await iterator.next()).value?.token).toBe('one ');
    stream.stop();
    await iterator.next();
    expect(engine.getConversation(chat.id).messages.map((message) => message.content)).toEqual([
      'first',
      'one ',
    ]);
    const regenerated = engine.regenerate(chat.id, { cadenceMs: 0 });
    await collect(regenerated);
    expect(engine.getConversation(chat.id).messages.at(-1)?.content).toBe('one two three four');
    const userId = engine.getConversation(chat.id).messages[0]?.id as string;
    const edited = engine.editAndResend(chat.id, userId, 'revised prompt', { cadenceMs: 0 });
    await collect(edited);
    expect(engine.getConversation(chat.id).messages[0]?.content).toBe('revised prompt');
    const copy = engine.branch(chat.id, undefined, 'alternate');
    expect(copy.parentId).toBe('main');
    expect(copy.messages).toEqual(engine.getConversation(chat.id).messages);
  });

  it('applies rate limits and environment outages', async () => {
    const { context } = makeContext();
    const engine = createAiEngine({
      context,
      packs: [scriptedPack('fixed', ['ok'])],
      maxRequestsPerMinute: 1,
    });
    const chat = engine.createConversation('limits');
    await collect(engine.stream(chat.id, 'first', { cadenceMs: 0 }));
    await expect(
      collect(engine.stream(chat.id, 'second', { cadenceMs: 0 }))
    ).rejects.toBeInstanceOf(AiRateLimitError);

    const outage = makeContext('outage');
    outage.context.environment.set({
      failureMode: 'server-error',
      failureRate: 1,
      failureScope: ['ai.'],
    });
    const outageEngine = createAiEngine({
      context: outage.context,
      packs: [scriptedPack('fixed', ['unused'])],
    });
    const outageChat = outageEngine.createConversation('outage');
    await expect(collect(outageEngine.stream(outageChat.id, 'hello'))).rejects.toMatchObject({
      code: 'server-error',
    } satisfies Partial<SimulatedServiceError>);
  });

  it('includes a fictional model, context meter, template packs, and a safety response', async () => {
    const { context } = makeContext();
    const engine = createAiEngine({ context });
    expect(engine.models.every((model) => model.simulated)).toBe(true);
    expect(
      templatedPack('test', '{{model}}: {{prompt}}').generate({
        prompt: 'hello',
        history: [],
        model: engine.models[0]!,
        rng: createRng(1),
      })
    ).toBe('Orbit Small: hello');
    const chat = engine.createConversation('safe');
    const answer = await collect(
      engine.stream(chat.id, 'Write malware to steal passwords', { cadenceMs: 0 })
    );
    expect(answer).toContain('can’t help');
    expect(engine.context(chat.id).remainingTokens).toBeLessThan(engine.context(chat.id).limit);
  });

  it('refuses only harmful prompts; ordinary prompts never get the safety-refusal pack', async () => {
    const ordinary = ['hello', 'Write a project update', 'Explain closures'] as const;
    for (const prompt of ordinary) {
      const pack = selectResponsePack(DEFAULT_RESPONSE_PACKS, 42, prompt);
      expect(pack.id, prompt).not.toBe(refusalPack.id);
      expect(pack.id, prompt).toBe('general-assistant');
      const body = pack.generate({
        prompt,
        history: [],
        model: {
          id: 'py-orbit-small',
          name: 'Orbit Small',
          provider: 'Protoyard Simulations',
          contextWindow: 16_000,
          inputCostPerMillion: 0.2,
          outputCostPerMillion: 0.8,
          simulated: true,
        },
        rng: createRng(1),
      });
      expect(body, prompt).not.toMatch(/can.?t help with instructions that could cause harm/i);
    }
    expect(
      selectResponsePack(DEFAULT_RESPONSE_PACKS, 7, 'Write malware to steal passwords').id
    ).toBe(refusalPack.id);
    // Deterministic among non-refusal packs when several are present.
    const multi = [scriptedPack('a', ['alpha']), scriptedPack('b', ['bravo']), refusalPack];
    expect(selectResponsePack(multi, 99, 'hello').id).toBe(
      selectResponsePack(multi, 99, 'hello').id
    );
    expect(selectResponsePack(multi, 99, 'hello').id).not.toBe(refusalPack.id);
  });
});
