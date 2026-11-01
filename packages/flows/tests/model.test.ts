import { describe, expect, it } from 'vitest';
import {
  applyOperations,
  type Condition,
  ConditionSchema,
  FLOW_LIMITS,
  inspectPlainData,
  resolveRef,
} from '../src/index.ts';
import { type Flow, parseFlow } from '../src/model/index.ts';
import { runFlow } from '../src/runtime/index.ts';

const base = (): Flow => ({
  formatVersion: 1,
  id: 'sample',
  name: 'Sample flow',
  status: 'draft',
  triggers: [{ id: 'start', type: 'manual', label: 'Start' }],
  collections: [
    {
      id: 'items',
      noun: 'item',
      states: [
        { id: 'open', label: 'Open' },
        { id: 'done', label: 'Done', final: true },
      ],
    },
  ],
  lists: [{ id: 'names', name: 'Names', items: ['Ada Example'] }],
  steps: [
    {
      id: 'ask',
      type: 'ask',
      audience: [{ type: 'team', id: 'team', name: 'Team' }],
      questions: [{ id: 'q1', kind: 'text', prompt: 'How is it going?' }],
    },
    {
      id: 'check',
      type: 'branch',
      when: { type: 'test', subject: { from: 'step', stepId: 'ask' }, test: 'not_empty' },
      // biome-ignore lint/suspicious/noThenProperty: a branch arm, not a thenable
      then: [{ id: 'close', type: 'set_state', state: 'done' }],
      otherwise: [],
    },
  ],
});

describe('parseFlow', () => {
  it('rejects every executable or code-shaped payload', () => {
    const hostile: unknown[] = [
      // A condition node type that does not exist.
      { type: 'expression', expression: 'user.isAdmin && 1' },
      { type: 'code', code: 'return true' },
      // An extra key on a real node.
      { type: 'test', subject: { from: 'trigger' }, test: 'exists', eval: 'x' },
      { type: 'judge', phrase: 'ok', script: 'fetch("https://example.com")' },
      // An operand that is not a ref, value or values.
      { type: 'compare', left: { expression: '1+1' }, op: 'eq', right: { value: 2 } },
      { type: 'compare', left: { value: { nested: true } }, op: 'eq', right: { value: 1 } },
      { type: 'compare', left: { value: 1 }, op: 'matches_regex', right: { value: '.*' } },
    ];
    for (const condition of hostile) {
      const flow = {
        ...base(),
        steps: [{ id: 'gate', type: 'reply', text: 'hi', only: condition }],
      };
      expect(parseFlow(flow).ok, JSON.stringify(condition)).toBe(false);
      expect(ConditionSchema.safeParse(condition).success).toBe(false);
    }
  });

  it('rejects prototype keys anywhere, including JSON-parsed __proto__', () => {
    const polluted = JSON.parse(
      '{"formatVersion":1,"id":"p","name":"P","status":"draft","triggers":[{"id":"w","type":"webhook","eventType":"x.y","samplePayload":{"__proto__":{"admin":true}}}],"steps":[]}'
    );
    const result = parseFlow(polluted);
    expect(result.ok).toBe(false);
    expect(result.diagnostics[0]?.message).toContain('__proto__');
    const path = {
      ...base(),
      steps: [
        { id: 'r', type: 'reply', text: [{ ref: { from: 'trigger', path: ['constructor'] } }] },
      ],
    };
    expect(parseFlow(path).ok).toBe(false);
  });

  it('stops hostile depth and size without recursing', () => {
    let deep: Condition = { type: 'test', subject: { from: 'trigger' }, test: 'exists' };
    for (let i = 0; i < 5_000; i += 1) deep = { type: 'not', condition: deep };
    const flow = { ...base(), steps: [{ id: 'r', type: 'reply', text: 'x', only: deep }] };
    expect(() => parseFlow(flow)).not.toThrow();
    expect(parseFlow(flow).diagnostics[0]?.code).toBe('not_plain_data');
    const wide = {
      ...base(),
      labels: Array.from({ length: FLOW_LIMITS.maxDataNodes + 1 }, () => 'x'),
    };
    expect(parseFlow(wide).diagnostics[0]?.code).toBe('not_plain_data');
    expect(inspectPlainData('x'.repeat(FLOW_LIMITS.maxStringLength + 1))).not.toBeNull();
  });
});

describe('conditions', () => {
  it('never reads inherited properties', () => {
    expect(resolveRef({ from: 'trigger', path: ['toString'] }, { trigger: {} })).toBeUndefined();
    expect(resolveRef({ from: 'step', stepId: 'hasownproperty' }, { outputs: {} })).toBeUndefined();
  });
});

describe('applyOperations', () => {
  it('validates operations as untrusted input', () => {
    const hostile: unknown[] = [
      [{ op: 'eval', code: '1' }],
      [{ op: 'update_step', stepId: 'ask', patch: { id: 'renamed' } }],
      [{ op: 'update_step', stepId: 'ask', patch: { type: 'wait' } }],
      [{ op: 'add_step', step: { id: 'x', type: 'run_code', code: 'x' } }],
      [{ op: 'set_status', status: 'paused', extra: true }],
      'not a list',
      Array.from({ length: FLOW_LIMITS.maxOperations + 1 }, () => ({
        op: 'set_status',
        status: 'draft',
      })),
    ];
    for (const operations of hostile) {
      expect(applyOperations(base(), operations).ok, JSON.stringify(operations).slice(0, 80)).toBe(
        false
      );
    }
    const polluted = JSON.parse(
      '[{"op":"update_step","stepId":"ask","patch":{"__proto__":{"x":1}}}]'
    );
    expect(applyOperations(base(), polluted).ok).toBe(false);
  });
});

// --- merged from runtime.test.ts ---

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
});
