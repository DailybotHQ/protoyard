import { describe, expect, it } from 'vitest';
import { COUNTERPART_DELAY, type CounterpartMessage, scriptedCounterpart } from '../src/index.ts';

const SCRIPTS = [
  ['Hi! Thanks for writing.', 'Let me check my calendar.', 'Talk soon.'],
  ['Hello, tell me more.', 'Got it, I will confirm here.'],
] as const;

const T0 = Date.parse('2026-03-02T09:00:00.000Z');
const at = (seconds: number) => new Date(T0 + seconds * 1000);
const msg = (
  id: string,
  author: CounterpartMessage['author'],
  seconds: number,
  conversationId = 'conv-a'
): CounterpartMessage => ({ id, conversationId, author, sentAt: at(seconds).toISOString() });

describe('scriptedCounterpart delays and scripts', () => {
  it('fixes each delay by message id inside 2–45 s and spreads them out', () => {
    const counterpart = scriptedCounterpart({ scripts: SCRIPTS });
    const delays = Array.from({ length: 500 }, (_, i) => counterpart.delaySeconds(`msg_${i}`));
    for (const d of delays) {
      expect(Number.isInteger(d)).toBe(true);
      expect(d).toBeGreaterThanOrEqual(COUNTERPART_DELAY.minSeconds);
      expect(d).toBeLessThanOrEqual(COUNTERPART_DELAY.maxSeconds);
    }
    expect(new Set(delays).size).toBeGreaterThan(30);
    expect(counterpart.delaySeconds('msg_7')).toBe(counterpart.delaySeconds('msg_7'));
  });

  it('replays identically for the same seed and differs for another seed', () => {
    const ids = Array.from({ length: 50 }, (_, i) => `m${i}`);
    const a = scriptedCounterpart({ scripts: SCRIPTS, seed: 42 });
    const b = scriptedCounterpart({ scripts: SCRIPTS, seed: 42 });
    const c = scriptedCounterpart({ scripts: SCRIPTS, seed: 43 });
    expect(ids.map(a.delaySeconds)).toEqual(ids.map(b.delaySeconds));
    expect(ids.map(a.delaySeconds)).not.toEqual(ids.map(c.delaySeconds));
    const convs = Array.from({ length: 20 }, (_, i) => `conv-${i}`);
    expect(convs.map(a.scriptFor)).toEqual(convs.map(b.scriptFor));
  });

  it('picks one script per conversation and walks its lines, then stops', () => {
    const counterpart = scriptedCounterpart({ scripts: SCRIPTS });
    const script = counterpart.scriptFor('conv-a');
    expect(SCRIPTS).toContainEqual(script);
    script.forEach((line, i) => {
      expect(counterpart.nextLine('conv-a', i)).toBe(line);
    });
    expect(counterpart.nextLine('conv-a', script.length)).toBeNull();
    expect(counterpart.nextLine('conv-a', -2)).toBe(script[0]);
  });

  it('honors a custom delay window and rejects invalid options', () => {
    const fast = scriptedCounterpart({ scripts: SCRIPTS, minDelaySeconds: 1, maxDelaySeconds: 1 });
    expect(fast.delaySeconds('x')).toBe(1);
    expect(() => scriptedCounterpart({ scripts: [] })).toThrow(/at least one line/);
    expect(() => scriptedCounterpart({ scripts: [[]] })).toThrow(/at least one line/);
    expect(() =>
      scriptedCounterpart({ scripts: SCRIPTS, minDelaySeconds: 10, maxDelaySeconds: 5 })
    ).toThrow(RangeError);
    expect(() => scriptedCounterpart({ scripts: SCRIPTS, minDelaySeconds: 1.5 })).toThrow(
      RangeError
    );
    expect(() => scriptedCounterpart({ scripts: SCRIPTS, typingSeconds: -1 })).toThrow(RangeError);
  });
});

describe('scriptedCounterpart state on the simulated clock', () => {
  const counterpart = scriptedCounterpart({ scripts: SCRIPTS, seed: 'world-1' });

  it('is idle without messages or when the counterpart spoke last', () => {
    expect(counterpart.state([], at(0))).toEqual({ status: 'idle' });
    expect(
      counterpart.state([msg('m1', 'person', 0), msg('r1', 'counterpart', 5)], at(10))
    ).toEqual({
      status: 'idle',
    });
  });

  it('waits, then types, then is due at a time fixed by the message', () => {
    const thread = [msg('m1', 'person', 0)];
    const delay = counterpart.delaySeconds('m1');
    const typingFrom = Math.max(0, delay - 4);
    const waiting = counterpart.state(thread, at(0));
    const expectedDue = at(delay).toISOString();
    if (typingFrom > 0) {
      expect(waiting).toMatchObject({ status: 'waiting', replyTo: 'm1', dueAt: expectedDue });
    }
    expect(counterpart.state(thread, at(typingFrom))).toMatchObject({
      status: 'typing',
      typingAt: at(typingFrom).toISOString(),
      dueAt: expectedDue,
    });
    const due = counterpart.state(thread, at(delay));
    expect(due).toMatchObject({
      status: 'due',
      replyTo: 'm1',
      reply: {
        id: 'm1~reply',
        conversationId: 'conv-a',
        replyTo: 'm1',
        sentAt: expectedDue,
        text: counterpart.nextLine('conv-a', 0),
      },
    });
    // Overdue is still due, at the original time (not "now").
    expect(counterpart.state(thread, at(3_600))).toEqual(due);
  });

  it('answers the latest person message, whatever the input order', () => {
    const thread = [msg('m2', 'person', 30), msg('m1', 'person', 0)];
    const state = counterpart.state(thread, at(30 + counterpart.delaySeconds('m2')));
    expect(state).toMatchObject({ status: 'due', replyTo: 'm2' });
  });

  it('uses the next line after the counterpart lines already sent, and is done after the script', () => {
    const script = counterpart.scriptFor('conv-a');
    const thread: CounterpartMessage[] = [];
    let second = 0;
    for (let i = 0; i < script.length; i++) {
      thread.push(msg(`p${i}`, 'person', second));
      second += 60;
      const due = counterpart.state(thread, at(second));
      expect(due).toMatchObject({ status: 'due', text: script[i] });
      thread.push(msg(`c${i}`, 'counterpart', second));
      second += 1;
    }
    thread.push(msg('p-last', 'person', second));
    expect(counterpart.state(thread, at(second + 3_600))).toEqual({ status: 'done' });
  });

  it('keeps a reply strictly after its message even with a zero delay', () => {
    const instant = scriptedCounterpart({
      scripts: SCRIPTS,
      minDelaySeconds: 0,
      maxDelaySeconds: 0,
    });
    const state = instant.state([msg('m1', 'person', 0)], at(1));
    expect(state.status).toBe('due');
    if (state.status === 'due') expect(Date.parse(state.reply.sentAt)).toBe(T0 + 1);
  });
});

describe('dueReplies drives an idempotent clock pass', () => {
  /** A tiny world tick: store every due reply whose id is new (the service's job). */
  function tick(store: CounterpartMessage[], now: Date, seed = 'world-1') {
    const counterpart = scriptedCounterpart({ scripts: SCRIPTS, seed });
    const known = new Set(store.map((m) => m.id));
    const written: string[] = [];
    for (const reply of counterpart.dueReplies(store, now)) {
      if (known.has(reply.id)) continue;
      store.push({
        id: reply.id,
        conversationId: reply.conversationId,
        author: 'counterpart',
        sentAt: reply.sentAt,
      });
      written.push(`${reply.conversationId}:${reply.text}`);
    }
    return written;
  }

  function run(seed: string) {
    const store: CounterpartMessage[] = [
      msg('a1', 'person', 0, 'conv-a'),
      msg('b1', 'person', 10, 'conv-b'),
      msg('c1', 'person', 20, 'conv-c'),
    ];
    const log: string[][] = [];
    for (const seconds of [1, 30, 60, 90]) {
      log.push(tick(store, at(seconds), seed));
      // A second pass at the same instant changes nothing.
      expect(tick(store, at(seconds), seed)).toEqual([]);
    }
    return { store, log };
  }

  it('delivers every reply within one simulated minute, once, in time order', () => {
    const { store, log } = run('world-1');
    const replies = store.filter((m) => m.author === 'counterpart');
    expect(replies).toHaveLength(3);
    expect(log.flat()).toHaveLength(3);
    const times = replies.map((m) => Date.parse(m.sentAt));
    expect([...times].sort((x, y) => x - y)).toEqual(times);
  });

  it('replays the same transcript for the same seed', () => {
    expect(run('world-1')).toEqual(run('world-1'));
    expect(JSON.stringify(run('world-1').store)).not.toBe(JSON.stringify(run('world-2').store));
  });

  it('orders simultaneous replies by conversation id', () => {
    const fixed = scriptedCounterpart({ scripts: SCRIPTS, minDelaySeconds: 5, maxDelaySeconds: 5 });
    const replies = fixed.dueReplies(
      [msg('x', 'person', 0, 'conv-z'), msg('y', 'person', 0, 'conv-m')],
      at(5)
    );
    expect(replies.map((r) => r.conversationId)).toEqual(['conv-m', 'conv-z']);
    expect(fixed.dueReplies([msg('x', 'person', 0, 'conv-z')], at(4))).toEqual([]);
  });
});
