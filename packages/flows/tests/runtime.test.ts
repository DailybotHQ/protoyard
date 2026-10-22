import { describe, expect, it } from 'vitest';
import { type Flow, findRecipe, parseFlow } from '../src/model/index.ts';
import {
  attentionOf,
  createFlowRuntime,
  createMockClock,
  maskUrl,
  runFlow,
} from '../src/runtime/index.ts';

const FROZEN = '2026-03-15T10:00:00.000Z';

function simpleMessageFlow(): Flow {
  return {
    formatVersion: 1,
    id: 'hello-flow',
    name: 'Hello',
    status: 'active',
    triggers: [{ id: 'start', type: 'manual', label: 'Start' }],
    steps: [
      {
        id: 'greet',
        type: 'message',
        channel: 'chat',
        to: [{ type: 'person', id: 'ada', name: 'Ada Example' }],
        text: ['Hello ', { ref: { from: 'trigger', path: ['name'] } }],
      },
      {
        id: 'pause',
        type: 'wait',
        minutes: 5,
      },
      {
        id: 'follow-up',
        type: 'reply',
        text: 'Done waiting.',
      },
    ],
  };
}

describe('maskUrl', () => {
  it('keeps the host and first path segment; masks deeper segments and query values', () => {
    expect(maskUrl('https://hooks.example.com/v1/secret-token/send?key=abc')).toBe(
      'https://hooks.example.com/v1/••••/••••?••••'
    );
    expect(maskUrl('not a url')).toBe('••••');
  });
});

describe('runFlow determinism', () => {
  it('repeated runs with the same flow, inputs and clock match exactly', () => {
    const flow = simpleMessageFlow();
    const options = {
      now: FROZEN,
      seed: 42,
      trigger: { name: 'Ada' },
    };
    const a = runFlow(flow, options);
    const b = runFlow(flow, options);
    expect(a).toEqual(b);
    expect(a.run.status).toBe('done');
    expect(a.outbox.map((item) => item.text)).toEqual(['Hello Ada', 'Done waiting.']);
    expect(a.now).toBe('2026-03-15T10:05:00.000Z');
    expect(a.effects.map((e) => e.type)).toEqual(['message', 'reply']);
  });

  it('produces identical masked outbox records for tool URLs', () => {
    const flow: Flow = {
      formatVersion: 1,
      id: 'tool-flow',
      name: 'Tool',
      status: 'active',
      triggers: [{ id: 'start', type: 'manual', label: 'Start' }],
      steps: [
        {
          id: 'hit',
          type: 'call_tool',
          tool: 'webhook',
          action: 'post',
          input: { label: 'ping' },
        },
      ],
    };
    const tools = {
      webhook: (input: Readonly<Record<string, unknown>>) => ({
        ok: true,
        label: input.label,
        url: 'https://api.example.com/hooks/super-secret/run?token=abc',
      }),
    };
    const opts = { now: FROZEN, seed: 7, tools };
    const a = runFlow(flow, opts);
    const b = runFlow(flow, opts);
    expect(a).toEqual(b);
    expect(a.run.status).toBe('done');
    const http = a.outbox.find((item) => item.kind === 'http');
    expect(http?.url).toBe('https://api.example.com/hooks/••••/••••?••••');
    expect(JSON.stringify(a.outbox)).not.toContain('super-secret');
    expect(JSON.stringify(a.outbox)).not.toContain('token=abc');
  });

  it('runs the approval-request recipe with decisions and keeps records', () => {
    const flow = findRecipe('approval-request')!.build({ id: 'expense-approvals' });
    expect(parseFlow(flow).ok).toBe(true);

    const approved = runFlow(flow, {
      now: FROZEN,
      seed: 1,
      trigger: { summary: 'Laptop for Ada Example' },
      decisions: { approve: 'approved' },
    });
    expect(approved.run.status).toBe('done');
    expect(approved.run.path).toContain('save-request');
    expect(approved.run.path).toContain('mark-approved');
    expect(approved.keeps.records).toHaveLength(1);
    expect(approved.keeps.records[0]?.state).toBe('approved');
    expect(approved.outbox.some((item) => item.text.includes('approved'))).toBe(true);

    const declined = runFlow(flow, {
      now: FROZEN,
      seed: 1,
      trigger: { summary: 'Laptop for Ada Example' },
      decisions: { approve: 'declined' },
    });
    expect(declined.keeps.records[0]?.state).toBe('declined');
    expect(declined.run.path).toContain('mark-declined');
  });

  it('leaves ask steps waiting when answers are missing', () => {
    const flow = findRecipe('daily-check-in')!.build();
    const waiting = runFlow(flow, { now: FROZEN, seed: 3 });
    expect(waiting.run.status).toBe('waiting');
    expect(waiting.signals.some((s) => s.kind === 'waiting')).toBe(true);
    expect(attentionOf(waiting.signals)[0]?.kind).toBe('waiting');

    const done = runFlow(flow, {
      now: FROZEN,
      seed: 3,
      answers: {
        'ask-team': { done: 'Shipped the demo', next: 'Write docs', blocked: false },
      },
    });
    expect(done.run.status).toBe('done');
    expect(done.outputs.summarize).toBeTruthy();
    expect(done.outbox.some((item) => item.kind === 'channel')).toBe(true);
  });

  it('createFlowRuntime binds defaults and stays deterministic', () => {
    const runtime = createFlowRuntime({ now: FROZEN, seed: 'suite' });
    const flow = simpleMessageFlow();
    const a = runtime.run(flow, { trigger: { name: 'Sam' } });
    const b = runtime.run(flow, { trigger: { name: 'Sam' } });
    expect(a).toEqual(b);
    expect(a.outbox[0]?.text).toBe('Hello Sam');
  });

  it('does not mutate the caller keeps maps', () => {
    const lists = { hosts: { items: ['Ada', 'Sam'], used: [], history: [] as string[][] } };
    const flow: Flow = {
      formatVersion: 1,
      id: 'list-flow',
      name: 'List',
      status: 'active',
      triggers: [{ id: 'start', type: 'manual', label: 'Start' }],
      lists: [{ id: 'hosts', name: 'Hosts', items: ['Ada', 'Sam'] }],
      steps: [{ id: 'pick', type: 'pick_from_list', list: 'hosts', order: 'next_unused' }],
    };
    const result = runFlow(flow, { now: FROZEN, seed: 9, lists });
    expect(result.outputs.pick).toEqual({ item: 'Ada', list: 'hosts' });
    expect(lists.hosts.used).toEqual([]);
    expect(result.keeps.lists.hosts?.used).toEqual(['Ada']);
  });

  it('advances the mock clock for waits', () => {
    const clock = createMockClock(FROZEN);
    clock.advanceMinutes(10);
    expect(clock.nowIso()).toBe('2026-03-15T10:10:00.000Z');
  });
});
