import { parseScenario } from '@protoyard/core';
import { createGenerateContext, validateWorld } from '@protoyard/scenarios';
import { afterEach, describe, expect, it } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import type { ChatDatabase, Message, Order } from '../src/database/schema.ts';
import { SUPPORT_THREAD_ID } from '../src/database/schema.ts';
import { ASSISTANT, chunkReply, GREETING, scriptedReply } from '../src/domain/assistant.ts';
import { ChatValidationError, createChatServices } from '../src/domain/chat.ts';
import { definition } from '../src/prototype.ts';
import { generateChatWorld } from '../src/scenarios/generators.ts';

const SCENARIOS = definition.scenarios.map((s) => s.id);
const scenario = (id: string) => {
  const input = definition.scenarios.find((s) => s.id === id);
  if (!input) throw new Error(`missing scenario ${id}`);
  return parseScenario(input);
};

describe('support-widget-demo generator', () => {
  it('is deterministic with integrity across every scenario', () => {
    for (const id of SCENARIOS) {
      const s = scenario(id);
      const a = generateChatWorld(createGenerateContext(s));
      expect(generateChatWorld(createGenerateContext(s)), id).toEqual(a);
      expect(
        validateWorld(a, { ...definition.integrity, referenceTime: s.referenceTime }),
        id
      ).toEqual([]);
      expect(a.tables.conversations).toHaveLength(1);
      expect((a.tables.orders as Order[]).length).toBeGreaterThan(0);
      for (const o of a.tables.orders as Order[]) {
        expect(o.email).toMatch(/@example\.com$/);
        expect(Number.isInteger(o.totalCents)).toBe(true);
      }
    }
    const first = generateChatWorld(createGenerateContext(scenario('first-visit')));
    expect((first.tables.messages as Message[])[0]?.body).toBe(GREETING);
    const open = generateChatWorld(createGenerateContext(scenario('open-return')));
    expect((open.tables.returns ?? []).length).toBe(1);
  });

  it('scripts deterministic replies', () => {
    const text = scriptedReply('track my shipping');
    expect(scriptedReply('track my shipping')).toBe(text);
    expect(chunkReply(text).join('')).toBe(text);
  });
});

describe('support-widget-demo services', () => {
  let harness = createHarness<ChatDatabase>(definition);
  afterEach(() => {
    harness.closeAll();
    harness = createHarness<ChatDatabase>(definition);
  });

  it('looks up a fictional order by number and starts a return that survives reload', async () => {
    let runtime = await harness.boot('returning-customer');
    const chat = createChatServices(runtime, { chunkDelayMs: 0 });
    await chat.ensureSupportThread();

    const orders = await runtime.db.orders.toArray();
    const delivered = orders.find((o) => o.status === 'delivered') ?? orders[0]!;
    const found = await chat.lookupOrder(delivered.number);
    expect(found.id).toBe(delivered.id);
    expect(found.totalCents).toBe(delivered.totalCents);

    const ret = await chat.requestReturn({
      orderId: delivered.id,
      reason: 'Too small for weekend trips',
    });
    expect(ret.status).toBe('requested');
    expect(ret.amountCents).toBe(delivered.totalCents);

    runtime = await harness.reload(runtime);
    const again = await runtime.db.returns.get(ret.id);
    expect(again).toMatchObject({
      orderId: delivered.id,
      reason: 'Too small for weekend trips',
      status: 'requested',
    });
    const msgs = await runtime.db.messages
      .where('[conversationId+at]')
      .between([SUPPORT_THREAD_ID, ''], [SUPPORT_THREAD_ID, '￿'])
      .toArray();
    expect(msgs.some((m) => m.authorId === ASSISTANT.id && m.body.includes(ret.id))).toBe(true);
  });

  it('rejects unknown orders and empty return reasons', async () => {
    const runtime = await harness.boot('first-visit');
    const chat = createChatServices(runtime, { chunkDelayMs: 0 });
    await expect(chat.lookupOrder('NOPE')).rejects.toBeInstanceOf(ChatValidationError);
    const order = (await runtime.db.orders.toArray())[0]!;
    await expect(chat.requestReturn({ orderId: order.id, reason: 'no' })).rejects.toBeInstanceOf(
      ChatValidationError
    );
  });

  it('streams assistant replies and supports handoff', async () => {
    const runtime = await harness.boot('first-visit');
    const chat = createChatServices(runtime, { chunkDelayMs: 0 });
    await chat.ensureSupportThread();
    const { reply } = await chat.send(SUPPORT_THREAD_ID, 'hello help');
    const answered = await reply;
    expect(answered.status).toBe('sent');
    const handoff = await chat.requestHandoff(SUPPORT_THREAD_ID);
    expect(handoff.handoffJoined).toBe(true);
  });
});
