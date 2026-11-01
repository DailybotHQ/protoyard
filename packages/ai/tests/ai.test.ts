import { createRng, createSimulationEnvironment, SimulatedServiceError } from '@protoyard/core';
import { describe, expect, it } from 'vitest';
import { type AgentPlan, createAiAgentRunner } from '../src/agents.ts';
import {
  type ApprovalActor,
  type ApprovalContext,
  type AutonomyConfig,
  DEFAULT_AUTONOMY,
  decideSuggestion,
  mayDecide,
  type Suggestion,
  type SuggestionCandidate,
  suggestFromCandidate,
} from '../src/approvals/index.ts';
import {
  AiRateLimitError,
  createAiEngine,
  DEFAULT_RESPONSE_PACKS,
  refusalPack,
  scriptedPack,
  selectResponsePack,
} from '../src/index.ts';
import { defineAiTool } from '../src/tools.ts';
import { type AiContext } from '../src/types.ts';

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

// --- merged from agents.test.ts ---

describe('agents', () => {
  function context(seed: number | string = 42): AiContext {
    const now = new Date('2026-10-17T12:00:00.000Z');
    return {
      seed,
      rng: createRng(seed),
      clock: { now: () => now, nowMs: () => now.getTime(), sleep: async () => {} },
      environment: createSimulationEnvironment({ sleep: async () => {} }),
    };
  }

  async function waitFor(predicate: () => boolean) {
    for (let attempt = 0; attempt < 20 && !predicate(); attempt++) await Promise.resolve();
    expect(predicate()).toBe(true);
  }

  const planned = (tool: string, input: unknown, requiresApproval?: boolean): AgentPlan => ({
    goal: `Use ${tool}.`,
    calls: [{ tool, input, ...(requiresApproval !== undefined ? { requiresApproval } : {}) }],
  });

  describe('simulated agent runs', () => {
    it('pauses before an approval-required tool and resumes when approved', async () => {
      let calls = 0;
      const write = defineAiTool({
        name: 'crm.note',
        description: 'Add a simulated CRM note.',
        requiresApproval: true,
        execute: () => {
          calls++;
          return 'note saved through service';
        },
      });
      const runner = createAiAgentRunner({
        context: context(),
        tools: [write],
        planner: () => planned('crm.note', { text: 'Follow up' }),
      });
      const run = runner.start('add a note');
      await waitFor(() => run.status === 'awaiting-approval');
      expect(calls).toBe(0);
      expect(run.steps.at(-1)?.type).toBe('approval-requested');
      run.approve();
      const result = await run.done;
      expect(result.status).toBe('completed');
      expect(calls).toBe(1);
      expect(result.steps.map((step) => step.type)).toContain('approval-granted');
    });
  });

  describe('agent approval floor', () => {
    it('cannot disable requiresApproval on a tool that requires it', async () => {
      const tool = defineAiTool({
        name: 'crm.note',
        description: 'Add a note',
        requiresApproval: true,
        execute: async () => ({ ok: true }),
      });
      const runner = createAiAgentRunner({
        context: context(1),
        tools: [tool],
        planner: () => ({
          goal: 'note',
          calls: [{ tool: 'crm.note', input: {}, reason: 'x', requiresApproval: false }],
        }),
      });
      const run = runner.start('add a note');
      await waitFor(() => run.status === 'awaiting-approval');
      run.reject('no');
      const result = await run.done;
      expect(result.status).toBe('completed');
      expect(result.answer).toMatch(/did not run|declined/i);
    });
  });
});

// --- merged from approvals.test.ts ---

describe('approvals', () => {
  const APPROVER: ApprovalActor = { id: 'person_avery', canApprove: true };
  const SUBJECT: ApprovalActor = { id: 'person_oscar', canApprove: false };
  const OTHER: ApprovalActor = { id: 'person_maria', canApprove: false };

  function level(
    levels: Partial<Record<string, AutonomyConfig['levels'][string]>>
  ): AutonomyConfig {
    return {
      levels: { ...DEFAULT_AUTONOMY.levels, ...levels } as AutonomyConfig['levels'],
      caps: { ...DEFAULT_AUTONOMY.caps },
    };
  }

  function candidate(overrides: Partial<SuggestionCandidate> = {}): SuggestionCandidate {
    return {
      sourceId: 'resp_1',
      subjectId: SUBJECT.id,
      kind: 'link_record',
      action: 'apply',
      summary: 'Link blocker to ENG-12',
      targetId: 'task_12',
      targetKey: 'ENG-12',
      targetLabel: 'Ship onboarding',
      payload: { responseId: 'resp_1' },
      ...overrides,
    };
  }

  function ctx(overrides: Partial<ApprovalContext> = {}): ApprovalContext {
    return {
      now: '2026-03-15T10:00:00.000Z',
      scopeId: 'org_example',
      buildEffects: (suggestion, _path) => ({
        apply: {
          type: 'link_record',
          targetId: suggestion.targetId ?? 'unknown',
          summary: `Link to ${suggestion.targetKey ?? 'target'}`,
          payload: {
            ...suggestion.payload,
            targetId: suggestion.targetId,
            subjectId: suggestion.subjectId,
          },
        },
        notify: {
          channelId: 'channel_onboarding',
          text: `Please review ${suggestion.targetKey ?? 'the target'}`,
          mentionId: 'person_owner',
        },
      }),
      ...overrides,
    };
  }

  describe('approval reducer', () => {
    it('only the subject or an approver decides; only an approver approves', () => {
      const pending = suggestFromCandidate(candidate(), DEFAULT_AUTONOMY, ctx()).suggestion;
      expect(mayDecide(SUBJECT, pending, 'confirm')).toBe(true);
      expect(mayDecide(OTHER, pending, 'confirm')).toBe(false);
      expect(mayDecide(SUBJECT, pending, 'approve')).toBe(false);
      expect(mayDecide(APPROVER, pending, 'approve')).toBe(true);

      expect(() => decideSuggestion(pending, 'confirm', OTHER, DEFAULT_AUTONOMY, ctx())).toThrow(
        /subject, or an approver/
      );

      const approval = suggestFromCandidate(candidate(), level({ records: 3 }), ctx()).suggestion;
      expect(approval.mode).toBe('act_with_approval');
      expect(approval.preparedApplySummary).toBe('Link to ENG-12');
      expect(approval.preparedNotifySummary).toContain('ENG-12');

      expect(() => decideSuggestion(approval, 'approve', SUBJECT, DEFAULT_AUTONOMY, ctx())).toThrow(
        /Only an approver may approve/
      );
      expect(() =>
        decideSuggestion(approval, 'confirm', APPROVER, DEFAULT_AUTONOMY, ctx())
      ).toThrow(/needs an approval/);
      expect(
        decideSuggestion(approval, 'approve', APPROVER, DEFAULT_AUTONOMY, ctx()).audit[0]?.action
      ).toBe('approved');
    });
  });

  describe('approval engine honesty', () => {
    it('never mutates the input suggestion or config', () => {
      const pending = suggestFromCandidate(candidate(), DEFAULT_AUTONOMY, ctx()).suggestion;
      const snapshot: Suggestion = structuredClone(pending);
      const configSnap = structuredClone(DEFAULT_AUTONOMY);
      decideSuggestion(pending, 'confirm', APPROVER, DEFAULT_AUTONOMY, ctx());
      expect(pending).toEqual(snapshot);
      expect(DEFAULT_AUTONOMY).toEqual(configSnap);
    });
  });
});
