import { describe, expect, it } from 'vitest';
import {
  applyOperations,
  type Condition,
  ConditionSchema,
  conditionRefs,
  describeCondition,
  evaluateCondition,
  FLOW_LIMITS,
  FLOW_RECIPES,
  type Flow,
  findRecipe,
  inspectPlainData,
  listSteps,
  parseFlow,
  resolveRef,
  STEP_KINDS,
  STEP_TYPES,
  type Step,
  stepsBefore,
  textPreview,
  validateFlow,
} from '../src/index.ts';

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

const codes = (diagnostics: readonly { code: string }[]) => diagnostics.map((d) => d.code);

describe('parseFlow', () => {
  it('accepts a valid flow and every recipe with no errors', () => {
    const result = parseFlow(base());
    expect(result.ok).toBe(true);
    for (const recipe of FLOW_RECIPES) {
      const parsed = parseFlow(recipe.build());
      expect(parsed.ok, `${recipe.id}: ${JSON.stringify(parsed.diagnostics)}`).toBe(true);
      expect(parsed.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    }
  });

  it('round-trips through JSON unchanged', () => {
    for (const recipe of FLOW_RECIPES) {
      const flow = recipe.build();
      const parsed = parseFlow(JSON.parse(JSON.stringify(flow)));
      expect(parsed.ok && parsed.flow).toEqual(flow);
    }
  });

  it('rejects unknown keys, wrong versions and missing starts with paths', () => {
    const extra = parseFlow({ ...base(), script: 'alert(1)' });
    expect(extra.ok).toBe(false);
    const version = parseFlow({ ...base(), formatVersion: 2 });
    expect(version.ok).toBe(false);
    const noStart = parseFlow({ ...base(), triggers: [] });
    expect(noStart.ok).toBe(false);
    expect(noStart.diagnostics[0]?.path).toBe('triggers');
  });

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

  it('has no step type that can run code, call a URL or hold credentials', () => {
    for (const type of ['run_code', 'call_api', 'http', 'script', 'webhook_call']) {
      const flow = { ...base(), steps: [{ id: 'bad', type, code: 'process.exit()' }] };
      expect(parseFlow(flow).ok, type).toBe(false);
    }
    const tool = {
      id: 'tool',
      type: 'call_tool',
      tool: 'crm',
      action: 'create',
      url: 'https://example.com',
    };
    expect(parseFlow({ ...base(), steps: [tool] }).ok).toBe(false);
    const hook = { id: 'hook', type: 'webhook', eventType: 'order.paid', secret: 'shh' };
    expect(parseFlow({ ...base(), triggers: [hook] }).ok).toBe(false);
  });

  it('rejects values JSON cannot hold before the schema runs', () => {
    const withFunction = { ...base(), name: () => 'x' };
    const result = parseFlow(withFunction);
    expect(result.ok).toBe(false);
    expect(result.diagnostics[0]).toMatchObject({ code: 'not_plain_data', path: '$.name' });
    class Box {
      value = 1;
    }
    expect(parseFlow({ ...base(), labels: [new Box()] }).diagnostics[0]?.code).toBe(
      'not_plain_data'
    );
    expect(parseFlow({ ...base(), labels: [Number.NaN] }).diagnostics[0]?.code).toBe(
      'not_plain_data'
    );
    expect(parseFlow(Object.assign(base(), { [Symbol('x')]: 1 })).diagnostics[0]?.code).toBe(
      'not_plain_data'
    );
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

  it('enforces condition depth and node caps', () => {
    let nested: Condition = { type: 'test', subject: { from: 'trigger' }, test: 'exists' };
    for (let i = 0; i < FLOW_LIMITS.maxConditionDepth; i += 1)
      nested = { type: 'not', condition: nested };
    expect(ConditionSchema.safeParse(nested).success).toBe(false);
    const leaf: Condition = { type: 'judge', phrase: 'ok' };
    const wide: Condition = {
      type: 'all',
      conditions: Array.from({ length: 16 }, () => ({
        type: 'any' as const,
        conditions: [leaf, leaf, leaf, leaf],
      })),
    };
    expect(ConditionSchema.safeParse(wide).success).toBe(false);
  });

  it('enforces the step count and branch depth', () => {
    const many: Step[] = Array.from({ length: FLOW_LIMITS.maxSteps + 1 }, (_, i) => ({
      id: `s${i}`,
      type: 'wait' as const,
      minutes: 1,
    }));
    expect(parseFlow({ ...base(), steps: many }).ok).toBe(false);
    let nested: Step = { id: 'leaf', type: 'wait', minutes: 1 };
    for (let i = 0; i < FLOW_LIMITS.maxStepDepth; i += 1) {
      nested = {
        id: `b${i}`,
        type: 'branch',
        when: { type: 'judge', phrase: 'go' },
        // biome-ignore lint/suspicious/noThenProperty: a branch arm, not a thenable
        then: [nested],
        otherwise: [],
      };
    }
    const result = parseFlow({ ...base(), steps: [nested] });
    expect(result.ok).toBe(false);
    expect(result.diagnostics.some((d) => d.message.includes('nest'))).toBe(true);
  });
});

describe('validateFlow', () => {
  it('reports duplicate ids across nested steps', () => {
    const flow = base();
    flow.steps.push({ id: 'close', type: 'wait', minutes: 5 });
    const diagnostics = validateFlow(flow);
    expect(diagnostics).toContainEqual(
      expect.objectContaining({ code: 'duplicate_id', path: 'steps[2]', stepId: 'close' })
    );
  });

  it('only lets a step read steps that have certainly run before it', () => {
    const flow = base();
    flow.steps.push(
      { id: 'after', type: 'reply', text: [{ ref: { from: 'step', stepId: 'close' } }] },
      { id: 'early', type: 'reply', text: [{ ref: { from: 'step', stepId: 'later' } }] },
      { id: 'later', type: 'wait', minutes: 1 },
      { id: 'ghost', type: 'reply', text: [{ ref: { from: 'step', stepId: 'nope' } }] }
    );
    const diagnostics = validateFlow(flow);
    expect(diagnostics).toContainEqual(
      expect.objectContaining({ code: 'ref_not_before', stepId: 'after', path: 'steps[2].text' })
    );
    expect(diagnostics).toContainEqual(
      expect.objectContaining({ code: 'ref_not_before', stepId: 'early' })
    );
    expect(diagnostics).toContainEqual(
      expect.objectContaining({ code: 'unknown_step_ref', stepId: 'ghost' })
    );
    expect(stepsBefore(flow.steps, 'after').map((s) => s.id)).toEqual(['ask', 'check']);
    expect(stepsBefore(flow.steps, 'close').map((s) => s.id)).toEqual(['ask', 'check']);
  });

  it('checks collections, states, lists and question options', () => {
    const flow = base();
    flow.steps = [
      { id: 'save', type: 'save_record', collection: 'missing' },
      { id: 'save2', type: 'save_record', collection: 'items', state: 'archived' },
      { id: 'state', type: 'set_state', state: 'gone' },
      { id: 'pick', type: 'pick_from_list', list: 'nobody', order: 'seeded' },
      {
        id: 'ask',
        type: 'ask',
        audience: [{ type: 'everyone', id: 'all', name: 'Everyone' }],
        questions: [
          { id: 'c', kind: 'choice', prompt: 'Pick one', choices: ['Only'] },
          { id: 'n', kind: 'number', prompt: 'How many?', choices: ['1'] },
        ],
      },
      { id: 'until', type: 'wait_until', until: 'time' },
    ];
    expect(codes(validateFlow(flow))).toEqual([
      'unknown_collection',
      'unknown_state',
      'unknown_state',
      'unknown_list',
      'choice_without_options',
      'options_on_non_choice',
      'missing_wait_detail',
    ]);
  });

  it('warns on shapes that parse but cannot do much', () => {
    const flow = base();
    flow.status = 'active';
    flow.collections = [];
    flow.steps = [
      {
        id: 'empty',
        type: 'branch',
        when: { type: 'judge', phrase: 'maybe' },
        // biome-ignore lint/suspicious/noThenProperty: a branch arm, not a thenable
        then: [],
        otherwise: [],
        enabled: false,
      },
      { id: 'self', type: 'start_flow', flowId: 'sample', enabled: false },
      {
        id: 'rec',
        type: 'reply',
        text: [{ ref: { from: 'record', path: ['title'] } }],
        enabled: false,
      },
    ];
    const diagnostics = validateFlow(flow);
    expect(diagnostics.every((d) => d.severity === 'warning')).toBe(true);
    expect(codes(diagnostics)).toEqual([
      'empty_branch',
      'starts_itself',
      'record_ref_without_collection',
      'nothing_to_run',
    ]);
    expect(parseFlow(flow).ok).toBe(true);
  });
});

describe('conditions', () => {
  const scope = {
    trigger: { payload: { status: 'Open', amount: '42', tags: ['vip', 'new'] } },
    outputs: { ask: { replies: [{ blocker: true }] }, empty: [] },
    record: { title: 'Fictional order', done: false },
  };
  const ref = (path: string[]) => ({ ref: { from: 'trigger' as const, path } });

  it('compares scalars with numeric coercion and case folding', () => {
    const cases: [Condition, 'pass' | 'fail'][] = [
      [
        { type: 'compare', left: ref(['payload', 'status']), op: 'eq', right: { value: 'open' } },
        'pass',
      ],
      [
        {
          type: 'compare',
          left: ref(['payload', 'status']),
          op: 'eq',
          right: { value: 'open' },
          caseSensitive: true,
        },
        'fail',
      ],
      [
        { type: 'compare', left: ref(['payload', 'amount']), op: 'gt', right: { value: 40 } },
        'pass',
      ],
      [
        { type: 'compare', left: ref(['payload', 'amount']), op: 'lte', right: { value: 41 } },
        'fail',
      ],
      [
        { type: 'compare', left: ref(['payload', 'status']), op: 'gt', right: { value: 1 } },
        'fail',
      ],
      [
        {
          type: 'compare',
          left: ref(['payload', 'tags']),
          op: 'contains',
          right: { value: 'VIP' },
        },
        'pass',
      ],
      [
        {
          type: 'compare',
          left: ref(['payload', 'status']),
          op: 'starts_with',
          right: { value: 'op' },
        },
        'pass',
      ],
      [
        {
          type: 'compare',
          left: ref(['payload', 'status']),
          op: 'in',
          right: { values: ['closed', 'open'] },
        },
        'pass',
      ],
      [
        {
          type: 'compare',
          left: ref(['payload', 'missing']),
          op: 'not_in',
          right: { values: ['x'] },
        },
        'pass',
      ],
      [{ type: 'compare', left: ref(['payload']), op: 'eq', right: { value: 'x' } }, 'fail'],
    ];
    for (const [condition, expected] of cases) {
      expect(evaluateCondition(condition, scope).status, describeCondition(condition)).toBe(
        expected
      );
    }
  });

  it('tests values from steps, triggers and records', () => {
    const test = (subject: Condition & { type: 'test' }) =>
      evaluateCondition(subject, scope).status;
    expect(
      test({
        type: 'test',
        subject: { from: 'step', stepId: 'ask', path: ['replies'] },
        test: 'not_empty',
      })
    ).toBe('pass');
    expect(test({ type: 'test', subject: { from: 'step', stepId: 'empty' }, test: 'empty' })).toBe(
      'pass'
    );
    expect(test({ type: 'test', subject: { from: 'step', stepId: 'nope' }, test: 'missing' })).toBe(
      'pass'
    );
    expect(test({ type: 'test', subject: { from: 'record', path: ['done'] }, test: 'false' })).toBe(
      'pass'
    );
    expect(test({ type: 'test', subject: { from: 'record', path: ['title'] }, test: 'true' })).toBe(
      'fail'
    );
  });

  it('never reads inherited properties', () => {
    expect(resolveRef({ from: 'trigger', path: ['toString'] }, { trigger: {} })).toBeUndefined();
    expect(resolveRef({ from: 'step', stepId: 'hasownproperty' }, { outputs: {} })).toBeUndefined();
  });

  it('combines with three-valued logic and leaves judgment to an injected judge', () => {
    const pass: Condition = { type: 'test', subject: { from: 'record' }, test: 'exists' };
    const fail: Condition = { type: 'not', condition: pass };
    const judge: Condition = { type: 'judge', phrase: 'it looks urgent' };
    expect(evaluateCondition({ type: 'all', conditions: [pass, judge] }, scope)).toEqual({
      status: 'needs_judgment',
      phrases: ['it looks urgent'],
    });
    expect(evaluateCondition({ type: 'all', conditions: [fail, judge] }, scope).status).toBe(
      'fail'
    );
    expect(evaluateCondition({ type: 'any', conditions: [judge, pass] }, scope).status).toBe(
      'pass'
    );
    expect(evaluateCondition({ type: 'not', condition: judge }, scope).status).toBe(
      'needs_judgment'
    );
    const seen: string[] = [];
    const outcome = evaluateCondition(judge, scope, {
      judge: (request) => {
        seen.push(`${request.judge}:${request.phrase}`);
        return true;
      },
    });
    expect(outcome.status).toBe('pass');
    expect(seen).toEqual(['assistant:it looks urgent']);
    expect(
      evaluateCondition({ type: 'not', condition: judge }, scope, { judge: () => true }).status
    ).toBe('fail');
  });

  it('lists references and reads as plain English', () => {
    const condition: Condition = {
      type: 'any',
      conditions: [
        {
          type: 'compare',
          left: ref(['payload', 'status']),
          op: 'neq',
          right: { value: 'closed' },
        },
        {
          type: 'all',
          conditions: [
            { type: 'test', subject: { from: 'step', stepId: 'ask' }, test: 'empty' },
            { type: 'judge', phrase: 'someone is stuck' },
          ],
        },
      ],
    };
    expect(conditionRefs(condition)).toEqual([
      { from: 'trigger', path: ['payload', 'status'] },
      { from: 'step', stepId: 'ask' },
    ]);
    expect(describeCondition(condition)).toBe(
      'trigger.payload.status is not "closed" or (step ask is empty and someone is stuck)'
    );
  });
});

describe('applyOperations', () => {
  it('adds, moves, duplicates and removes steps atomically', () => {
    const flow = base();
    const result = applyOperations(flow, [
      {
        op: 'add_step',
        step: { id: 'note', type: 'reply', text: 'Thanks' },
        parentId: 'check',
        branch: 'otherwise',
      },
      { op: 'move_step', stepId: 'close', index: 0 },
      { op: 'duplicate_step', stepId: 'check' },
      { op: 'update_step', stepId: 'ask', patch: { label: 'Ask the team' } },
      { op: 'remove_step', stepId: 'note' },
    ]);
    expect(result.ok, JSON.stringify(result.diagnostics)).toBe(true);
    if (!result.ok) return;
    expect(listSteps(result.flow.steps).map((l) => l.step.id)).toEqual([
      'close',
      'ask',
      'check',
      'check-copy',
      'note-copy',
    ]);
    expect(result.flow.steps[1]).toMatchObject({ id: 'ask', label: 'Ask the team' });
    // The input is never mutated.
    expect(flow.steps.map((s) => s.id)).toEqual(['ask', 'check']);
  });

  it('gives duplicates deterministic, unique ids', () => {
    const first = applyOperations(base(), [
      { op: 'duplicate_step', stepId: 'ask' },
      { op: 'duplicate_step', stepId: 'ask' },
    ]);
    const second = applyOperations(base(), [
      { op: 'duplicate_step', stepId: 'ask' },
      { op: 'duplicate_step', stepId: 'ask' },
    ]);
    expect(first).toEqual(second);
    expect(first.ok && first.flow.steps.map((s) => s.id)).toEqual([
      'ask',
      'ask-copy-2',
      'ask-copy',
      'check',
    ]);
  });

  it('edits triggers, questions, collections and lists', () => {
    const result = applyOperations(base(), [
      {
        op: 'add_trigger',
        trigger: {
          id: 'daily',
          type: 'schedule',
          days: ['monday'],
          time: '08:00',
          timezone: 'utc',
        },
      },
      { op: 'remove_trigger', triggerId: 'start' },
      {
        op: 'add_question',
        stepId: 'ask',
        question: { id: 'q2', kind: 'boolean', prompt: 'Blocked?' },
      },
      { op: 'remove_question', stepId: 'ask', questionId: 'q1' },
      { op: 'upsert_list', list: { id: 'names', name: 'People', items: [] } },
      { op: 'upsert_collection', collection: { id: 'notes', noun: 'note', states: [] } },
      { op: 'update_flow', patch: { name: 'Renamed' } },
      { op: 'set_status', status: 'active' },
    ]);
    expect(result.ok, JSON.stringify(result.diagnostics)).toBe(true);
    if (!result.ok) return;
    expect(result.flow.triggers.map((t) => t.id)).toEqual(['daily']);
    expect(result.flow.name).toBe('Renamed');
    expect(result.flow.lists?.[0]?.name).toBe('People');
    expect(result.flow.collections?.map((c) => c.id)).toEqual(['items', 'notes']);
  });

  it('changes nothing when an operation fails, and names the operation', () => {
    const flow = base();
    const missing = applyOperations(flow, [
      { op: 'set_status', status: 'paused' },
      { op: 'remove_step', stepId: 'nope' },
    ]);
    expect(missing).toMatchObject({ ok: false, failedAt: 1 });
    expect(missing.flow).toBe(flow);
    const into = applyOperations(flow, [
      { op: 'move_step', stepId: 'check', parentId: 'close', index: 0 },
    ]);
    expect(into).toMatchObject({ ok: false, failedAt: 0 });
    const self = applyOperations(flow, [
      { op: 'move_step', stepId: 'check', parentId: 'check', index: 0 },
    ]);
    expect(self.diagnostics[0]?.message).toContain('inside itself');
  });

  it('rejects a batch whose result breaks the flow', () => {
    const removeCollection = applyOperations(base(), [
      { op: 'remove_collection', collectionId: 'items' },
    ]);
    expect(removeCollection).toMatchObject({ ok: false, failedAt: null });
    expect(codes(removeCollection.diagnostics)).toContain('unknown_state');
    const badPatch = applyOperations(base(), [
      { op: 'update_step', stepId: 'ask', patch: { questions: [] } },
    ]);
    expect(badPatch.ok).toBe(false);
  });

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

describe('catalog and recipes', () => {
  it('registers every step type once', () => {
    expect(new Set(STEP_TYPES).size).toBe(STEP_KINDS.length);
    expect(STEP_TYPES).toContain('branch');
    expect(STEP_TYPES).not.toContain('run_code');
  });

  it('builds recipes as fresh copies with overrides', () => {
    const recipe = findRecipe('approval-request');
    expect(recipe).toBeDefined();
    const a = recipe?.build({ id: 'my-approvals', name: 'My approvals' });
    const b = recipe?.build();
    expect(a?.id).toBe('my-approvals');
    expect(b?.id).toBe('approval-request');
    a?.steps.pop();
    expect(recipe?.build().steps).toHaveLength(3);
  });

  it('previews text with references', () => {
    expect(
      textPreview(['Hi ', { ref: { from: 'step', stepId: 'pick-host', path: ['name'] } }])
    ).toBe('Hi {step pick-host.name}');
  });
});
