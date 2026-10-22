import {
  evaluateCondition,
  type Flow,
  type FlowJudge,
  type FlowText,
  isStepEnabled,
  parseFlow,
  type RefScope,
  resolveRef,
  type Step,
  textPreview,
} from '../model/index.ts';
import { createMockClock, type MockClock } from './clock.ts';
import { cloneLists, cloneRecords } from './keeps.ts';
import { maskUrl } from './outbox.ts';
import { createIdFactory, createRng, shuffleInPlace } from './seed.ts';
import type {
  FlowKeepRecord,
  FlowListState,
  FlowPerson,
  FlowRun,
  FlowRunResult,
  FlowRuntimeOptions,
  OutboxItem,
  OutboxKind,
  ProposedEffect,
  Signal,
} from './types.ts';

/**
 * Deterministic mock workflow runtime (ADR-041).
 *
 * Runs a validated flow against a seeded mock context with an injected clock,
 * optional answers/decisions, keeps and a masked outbox. Returns proposed
 * effects for a service adapter. Performs no external network requests.
 */

interface EngineState {
  clock: MockClock;
  nextId: (prefix: string) => string;
  rng: () => number;
  outputs: Record<string, unknown>;
  effects: ProposedEffect[];
  outbox: OutboxItem[];
  signals: Signal[];
  records: Record<string, FlowKeepRecord[]>;
  lists: Record<string, FlowListState>;
  people: readonly FlowPerson[];
  answers: Readonly<Record<string, unknown>>;
  decisions: Readonly<Record<string, 'approved' | 'declined'>>;
  tools: Readonly<Record<string, (input: Readonly<Record<string, unknown>>) => unknown>>;
  judge?: FlowJudge;
  trigger: Readonly<Record<string, unknown>>;
  record: unknown;
  waitForPeople: boolean;
  path: string[];
  runId: string;
  flowId: string;
  status: FlowRun['status'];
  error: string | null;
  currentRecordId: string | null;
}

function resolveText(value: FlowText | undefined, scope: RefScope): string {
  if (value === undefined) return '';
  if (typeof value === 'string') return value;
  return value
    .map((part) => {
      if (typeof part === 'string') return part;
      const resolved = resolveRef(part.ref, scope);
      if (resolved === undefined || resolved === null) return '';
      if (typeof resolved === 'object') return JSON.stringify(resolved);
      return String(resolved);
    })
    .join('');
}

function scopeOf(state: EngineState): RefScope {
  return {
    trigger: state.trigger,
    outputs: state.outputs,
    record: state.record,
  };
}

function resolveFields(
  fields: Readonly<Record<string, FlowText>> | undefined,
  scope: RefScope
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!fields) return out;
  for (const [key, value] of Object.entries(fields)) {
    out[key] = resolveText(value, scope);
  }
  return out;
}

function audienceIds(audience: readonly { id: string; type: string; name: string }[]): string[] {
  return audience.map((item) => item.id);
}

function channelKind(channel: string): OutboxKind {
  if (channel === 'email') return 'email';
  if (channel === 'inbox') return 'inbox';
  if (channel === 'notification') return 'notification';
  return 'channel';
}

function pushOutbox(
  state: EngineState,
  stepId: string,
  item: Omit<OutboxItem, 'id' | 'at' | 'flowId' | 'runId' | 'stepId'>
): void {
  state.outbox.push({
    id: state.nextId('out'),
    at: state.clock.nowIso(),
    flowId: state.flowId,
    runId: state.runId,
    stepId,
    ...item,
  });
}

function pushEffect(
  state: EngineState,
  type: string,
  stepId: string,
  payload: Record<string, unknown>
): void {
  state.effects.push({ type, stepId, payload });
}

function pushSignal(
  state: EngineState,
  kind: Signal['kind'],
  stepId: string,
  title: string,
  detail: string
): void {
  state.signals.push({
    id: state.nextId('sig'),
    kind,
    at: state.clock.nowIso(),
    resolved: false,
    flowId: state.flowId,
    runId: state.runId,
    stepId,
    title,
    detail,
  });
}

function mockAssistant(
  task: string,
  input: unknown,
  labels: readonly string[] | undefined,
  rng: () => number
): unknown {
  const text =
    input === undefined || input === null
      ? ''
      : typeof input === 'string'
        ? input
        : JSON.stringify(input);
  switch (task) {
    case 'summarize':
      return { text: text ? `Summary: ${text.slice(0, 120)}` : 'Summary: (empty)' };
    case 'classify': {
      if (labels && labels.length > 0) {
        const index = Math.floor(rng() * labels.length) % labels.length;
        return { label: labels[index], confidence: 0.5 + rng() * 0.49 };
      }
      return { label: 'unknown', confidence: 0 };
    }
    case 'extract':
      return { fields: typeof input === 'object' && input !== null ? input : { value: text } };
    case 'draft':
      return { text: text ? `Draft: ${text.slice(0, 200)}` : 'Draft: (empty)' };
    case 'check':
      return { ok: true, notes: text ? `Checked: ${text.slice(0, 80)}` : 'Checked' };
    default:
      return { text: textPreview(String(task)) };
  }
}

function answerForAsk(state: EngineState, stepId: string, questions: readonly { id: string }[]) {
  const raw = state.answers[stepId];
  if (raw === undefined) return null;
  if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  const first = questions[0]?.id;
  return first ? { [first]: raw } : { value: raw };
}

function executeStep(state: EngineState, step: Step): 'ok' | 'waiting' | 'failed' {
  if (!isStepEnabled(step)) return 'ok';

  const scope = scopeOf(state);
  if (step.only) {
    const outcome = evaluateCondition(step.only, scope, { judge: state.judge });
    if (outcome.status === 'fail') return 'ok';
    if (outcome.status === 'needs_judgment') {
      state.status = 'waiting';
      state.error = 'Condition needs judgment';
      pushSignal(state, 'waiting', step.id, 'Waiting on judgment', outcome.phrases.join('; '));
      return 'waiting';
    }
  }

  if (step.delayMinutes) state.clock.advanceMinutes(step.delayMinutes);
  state.path.push(step.id);

  switch (step.type) {
    case 'wait': {
      state.clock.advanceMinutes(step.minutes);
      state.outputs[step.id] = { waitedMinutes: step.minutes };
      return 'ok';
    }
    case 'wait_until': {
      // Single-shot mock: treat as immediate for time; otherwise wait for people/events.
      if (step.until === 'time') {
        state.outputs[step.id] = { until: 'time', time: step.time ?? null };
        return 'ok';
      }
      state.status = 'waiting';
      pushSignal(
        state,
        'waiting',
        step.id,
        'Waiting',
        `Waiting until ${step.until}${step.event ? ` (${step.event})` : ''}`
      );
      state.outputs[step.id] = { until: step.until, waiting: true };
      return 'waiting';
    }
    case 'message': {
      const text = resolveText(step.text, scope);
      const to = audienceIds(step.to);
      pushOutbox(state, step.id, {
        kind: channelKind(step.channel),
        text,
        to,
        channel: step.channel,
        ...(step.subject ? { subject: step.subject } : {}),
      });
      pushEffect(state, 'message', step.id, {
        channel: step.channel,
        to,
        text,
        subject: step.subject ?? null,
      });
      state.outputs[step.id] = { sent: true, text };
      return 'ok';
    }
    case 'reply': {
      const text = resolveText(step.text, scope);
      pushOutbox(state, step.id, { kind: 'reply', text });
      pushEffect(state, 'reply', step.id, { text });
      state.outputs[step.id] = { text };
      return 'ok';
    }
    case 'ask': {
      const answers = answerForAsk(state, step.id, step.questions);
      if (!answers) {
        if (state.waitForPeople) {
          state.status = 'waiting';
          pushSignal(state, 'waiting', step.id, 'Waiting for replies', 'Ask step needs answers');
          state.outputs[step.id] = { waiting: true, questions: step.questions.map((q) => q.id) };
          return 'waiting';
        }
        state.status = 'failed';
        state.error = `Missing answers for ask step ${step.id}`;
        pushSignal(state, 'failed', step.id, 'Missing answers', state.error);
        return 'failed';
      }
      pushEffect(state, 'ask', step.id, {
        audience: audienceIds(step.audience),
        questions: step.questions,
        answers,
      });
      state.outputs[step.id] = { answers, replies: answers };
      return 'ok';
    }
    case 'approval': {
      const decision = state.decisions[step.id];
      if (!decision) {
        if (state.waitForPeople) {
          state.status = 'waiting';
          pushSignal(
            state,
            'approval',
            step.id,
            'Needs approval',
            resolveText(step.prompt, scope) || 'Approval required'
          );
          state.outputs[step.id] = { waiting: true };
          return 'waiting';
        }
        state.status = 'failed';
        state.error = `Missing decision for approval step ${step.id}`;
        pushSignal(state, 'failed', step.id, 'Missing decision', state.error);
        return 'failed';
      }
      const prompt = resolveText(step.prompt, scope);
      pushEffect(state, 'approval', step.id, {
        decision,
        prompt,
        approvers: audienceIds(step.approvers),
      });
      state.outputs[step.id] = { decision, prompt };
      return 'ok';
    }
    case 'branch': {
      const outcome = evaluateCondition(step.when, scope, { judge: state.judge });
      if (outcome.status === 'needs_judgment') {
        state.status = 'waiting';
        state.error = 'Branch needs judgment';
        pushSignal(state, 'waiting', step.id, 'Waiting on judgment', outcome.phrases.join('; '));
        return 'waiting';
      }
      const arm = outcome.status === 'pass' ? step.then : step.otherwise;
      state.outputs[step.id] = {
        result: outcome.status,
        arm: outcome.status === 'pass' ? 'then' : 'otherwise',
      };
      return executeSteps(state, arm);
    }
    case 'assistant': {
      const input = step.input ? resolveRef(step.input, scope) : undefined;
      const result = mockAssistant(step.task, input, step.labels, state.rng);
      pushEffect(state, 'assistant', step.id, {
        task: step.task,
        result,
        instructions: resolveText(step.instructions, scope) || null,
      });
      state.outputs[step.id] = result;
      return 'ok';
    }
    case 'save_record': {
      const title = resolveText(step.title, scope) || step.collection;
      const fields = resolveFields(step.fields, scope);
      const record: FlowKeepRecord = {
        id: state.nextId('rec'),
        collection: step.collection,
        title,
        state: step.state ?? null,
        fields,
        runId: state.runId,
        createdAt: state.clock.nowIso(),
        history: step.state ? [{ to: step.state, at: state.clock.nowIso(), by: null }] : [],
      };
      const bucket = state.records[step.collection] ?? [];
      bucket.push(record);
      state.records[step.collection] = bucket;
      state.currentRecordId = record.id;
      pushEffect(state, 'save_record', step.id, {
        collection: step.collection,
        recordId: record.id,
        title,
        state: record.state,
        fields,
      });
      state.outputs[step.id] = { recordId: record.id, title, state: record.state, fields };
      return 'ok';
    }
    case 'get_records': {
      const all = state.records[step.collection] ?? [];
      const sinceMs = state.clock.nowMs() - step.sinceDays * 86_400_000;
      const filtered = all
        .filter((row) => Date.parse(row.createdAt) >= sinceMs)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
        .slice(0, step.limit);
      state.outputs[step.id] = { records: filtered, count: filtered.length };
      return 'ok';
    }
    case 'set_state': {
      // Apply to the current record when one was saved in this run; else record-level output only.
      if (state.currentRecordId) {
        for (const rows of Object.values(state.records)) {
          const row = rows.find((r) => r.id === state.currentRecordId);
          if (row) {
            row.state = step.state;
            row.history.push({ to: step.state, at: state.clock.nowIso(), by: null });
            break;
          }
        }
      }
      pushEffect(state, 'set_state', step.id, {
        state: step.state,
        recordId: state.currentRecordId,
      });
      state.outputs[step.id] = { state: step.state, recordId: state.currentRecordId };
      return 'ok';
    }
    case 'pick_from_list': {
      const list = state.lists[step.list] ?? { items: [], used: [], history: [] };
      state.lists[step.list] = list;
      let picked: string | null = null;
      if (step.order === 'next_unused') {
        picked = list.items.find((item) => !list.used.includes(item)) ?? null;
        if (picked) list.used.push(picked);
      } else {
        if (list.items.length > 0) {
          const index = Math.floor(state.rng() * list.items.length) % list.items.length;
          picked = list.items[index] ?? null;
        }
      }
      state.outputs[step.id] = { item: picked, list: step.list };
      pushEffect(state, 'pick_from_list', step.id, { list: step.list, item: picked });
      return 'ok';
    }
    case 'update_list': {
      const list = state.lists[step.list] ?? { items: [], used: [], history: [] };
      state.lists[step.list] = list;
      const value = resolveText(step.value, scope);
      if (step.action === 'add') {
        if (!list.items.includes(value)) list.items.push(value);
      } else {
        list.items = list.items.filter((item) => item !== value);
        list.used = list.used.filter((item) => item !== value);
      }
      pushEffect(state, 'update_list', step.id, { list: step.list, action: step.action, value });
      state.outputs[step.id] = {
        list: step.list,
        action: step.action,
        value,
        items: [...list.items],
      };
      return 'ok';
    }
    case 'group_people': {
      const pool = [...step.from];
      const ids = pool.map((p) => p.id);
      shuffleInPlace(ids, state.rng);
      let groups: string[][] = [];
      if (step.mode === 'pick_one') {
        const first = ids[0];
        groups = first !== undefined ? [[first]] : [];
      } else if (step.mode === 'pairs') {
        for (let i = 0; i < ids.length; i += 2) {
          groups.push(ids.slice(i, i + 2));
        }
      } else {
        const size = step.size ?? 3;
        for (let i = 0; i < ids.length; i += size) {
          groups.push(ids.slice(i, i + size));
        }
      }
      pushEffect(state, 'group_people', step.id, { mode: step.mode, groups });
      state.outputs[step.id] = { groups, mode: step.mode };
      return 'ok';
    }
    case 'call_tool': {
      const input = resolveFields(step.input, scope);
      const handler = state.tools[step.tool];
      if (!handler) {
        state.status = 'failed';
        state.error = `Unknown tool: ${step.tool}`;
        pushSignal(state, 'failed', step.id, 'Tool missing', state.error);
        return 'failed';
      }
      const result = handler(input);
      const maybeUrl =
        result && typeof result === 'object' && result !== null && 'url' in result
          ? String((result as { url: unknown }).url)
          : undefined;
      // Outbox never stores raw URLs; effects keep the full result for the service adapter.
      const outboxText =
        typeof result === 'string'
          ? result
          : JSON.stringify(
              maybeUrl && result && typeof result === 'object'
                ? { ...(result as Record<string, unknown>), url: maskUrl(maybeUrl) }
                : (result ?? null)
            );
      pushOutbox(state, step.id, {
        kind: 'tool',
        text: outboxText,
        tool: step.tool,
        action: step.action,
      });
      if (maybeUrl) {
        pushOutbox(state, step.id, {
          kind: 'http',
          text: `Tool ${step.tool} · ${step.action}`,
          url: maskUrl(maybeUrl),
          method: 'TOOL',
          tool: step.tool,
          action: step.action,
        });
      }
      pushEffect(state, 'call_tool', step.id, {
        tool: step.tool,
        action: step.action,
        input,
        result,
      });
      state.outputs[step.id] = { result, tool: step.tool, action: step.action };
      return 'ok';
    }
    case 'start_flow': {
      pushEffect(state, 'start_flow', step.id, { flowId: step.flowId });
      state.outputs[step.id] = { flowId: step.flowId, started: true };
      return 'ok';
    }
    default: {
      state.status = 'failed';
      state.error = `Unsupported step type`;
      return 'failed';
    }
  }
}

function executeSteps(state: EngineState, steps: readonly Step[]): 'ok' | 'waiting' | 'failed' {
  for (const step of steps) {
    if (state.status === 'waiting' || state.status === 'failed' || state.status === 'cancelled') {
      return state.status === 'failed' ? 'failed' : 'waiting';
    }
    const result = executeStep(state, step);
    if (result !== 'ok') return result;
  }
  return 'ok';
}

function seedListsFromFlow(flow: Flow, lists: Record<string, FlowListState>): void {
  for (const list of flow.lists ?? []) {
    if (!lists[list.id]) {
      lists[list.id] = { items: [...(list.items ?? [])], used: [], history: [] };
    }
  }
}

/**
 * Run a flow once against a mock context. Pure with respect to the inputs:
 * the same flow, options and clock produce identical results. Does not mutate
 * the input flow or the caller's keeps maps.
 */
export function runFlow(flow: Flow, options: FlowRuntimeOptions = {}): FlowRunResult {
  const parsed = parseFlow(flow);
  if (!parsed.ok || !parsed.flow) {
    const clock = createMockClock(options.now);
    const nextId = createIdFactory(options.seed);
    const runId = nextId('run');
    return {
      run: {
        id: runId,
        flowId: flow.id,
        status: 'failed',
        startedAt: clock.nowIso(),
        finishedAt: clock.nowIso(),
        trigger: { ...(options.trigger ?? {}) },
        error: 'Flow failed validation',
        path: [],
      },
      outputs: {},
      effects: [],
      outbox: [],
      keeps: { records: [], lists: {} },
      signals: [
        {
          id: nextId('sig'),
          kind: 'failed',
          at: clock.nowIso(),
          resolved: false,
          flowId: flow.id,
          runId,
          title: 'Invalid flow',
          detail: parsed.diagnostics
            .filter((d) => d.severity === 'error')
            .map((d) => d.message)
            .join('; '),
        },
      ],
      now: clock.nowIso(),
    };
  }

  const valid = parsed.flow;
  const clock = createMockClock(options.now);
  const nextId = createIdFactory(options.seed);
  const runId = nextId('run');
  const startedAt = clock.nowIso();

  const lists = cloneLists(options.lists);
  seedListsFromFlow(valid, lists);
  const records = cloneRecords(options.records);

  const injectedJudge = options.judge;
  const judge: FlowJudge | undefined = injectedJudge
    ? (request) => {
        const value = injectedJudge({ phrase: request.phrase, judge: request.judge });
        if (value === 'undecided') return null;
        return value;
      }
    : undefined;

  const state: EngineState = {
    clock,
    nextId,
    rng: createRng(options.seed),
    outputs: {},
    effects: [],
    outbox: [],
    signals: [],
    records,
    lists,
    people: options.people ?? [],
    answers: options.answers ?? {},
    decisions: options.decisions ?? {},
    tools: options.tools ?? {},
    judge,
    trigger: options.trigger ?? {},
    record: options.record,
    waitForPeople: options.waitForPeople !== false,
    path: [],
    runId,
    flowId: valid.id,
    status: 'running',
    error: null,
    currentRecordId: null,
  };

  const walk = executeSteps(state, valid.steps);
  if (walk === 'ok' && state.status === 'running') state.status = 'done';
  const finishedAt = clock.nowIso();

  const allRecords = Object.values(state.records).flat();

  return {
    run: {
      id: runId,
      flowId: valid.id,
      status: state.status,
      startedAt,
      finishedAt: state.status === 'running' ? null : finishedAt,
      trigger: { ...state.trigger },
      error: state.error,
      path: [...state.path],
    },
    outputs: { ...state.outputs },
    effects: [...state.effects],
    outbox: state.outbox.map((item) =>
      item.url ? { ...item, url: maskUrl(item.url) } : { ...item }
    ),
    keeps: {
      records: allRecords.map((row) => ({
        ...row,
        fields: { ...row.fields },
        history: row.history.map((h) => ({ ...h })),
      })),
      lists: cloneLists(state.lists),
    },
    signals: [...state.signals],
    now: clock.nowIso(),
  };
}

/**
 * Convenience: create a reusable runner bound to default options (people,
 * tools, seed). Each `run` call still takes a fresh flow and overrides.
 */
export function createFlowRuntime(defaults: FlowRuntimeOptions = {}) {
  return {
    run(flow: Flow, overrides: FlowRuntimeOptions = {}): FlowRunResult {
      return runFlow(flow, {
        ...defaults,
        ...overrides,
        answers: { ...defaults.answers, ...overrides.answers },
        decisions: { ...defaults.decisions, ...overrides.decisions },
        tools: { ...defaults.tools, ...overrides.tools },
        people: overrides.people ?? defaults.people,
        records: overrides.records ?? defaults.records,
        lists: overrides.lists ?? defaults.lists,
        trigger: overrides.trigger ?? defaults.trigger,
        record: overrides.record ?? defaults.record,
      });
    },
  };
}
