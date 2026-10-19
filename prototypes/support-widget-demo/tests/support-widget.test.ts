import { parseScenario, SimulatedServiceError } from '@protoyard/core';
import { createGenerateContext, validateWorld } from '@protoyard/scenarios';
import { afterEach, describe, expect, it } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import type { ChatDatabase, Message, Order } from '../src/database/schema.ts';
import { SUPPORT_THREAD_ID } from '../src/database/schema.ts';
import { ASSISTANT, chunkReply, GREETING, scriptedReply } from '../src/domain/assistant.ts';
import { ChatValidationError, createChatServices } from '../src/domain/chat.ts';
import { createUnreadSync } from '../src/lib/unread.ts';
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
  it('keeps the old reply when a retry fails, and replaces it atomically when it succeeds', async () => {
    const runtime = await harness.boot('outage');
    const chat = createChatServices(runtime, { chunkDelayMs: 0 });
    const { message, reply } = await chat.send(SUPPORT_THREAD_ID, 'where is my order');
    const failed = await reply;
    expect(failed.status).toBe('failed');
    const before = await runtime.db.messages.count();

    await expect(chat.retry(failed.id)).rejects.toBeInstanceOf(SimulatedServiceError);
    expect(await runtime.db.messages.get(failed.id)).toMatchObject({
      status: 'failed',
      promptId: message.id,
    });
    expect(await runtime.db.messages.count()).toBe(before);

    runtime.environment.set({ failureMode: 'none' });
    const fresh = await chat.retry(failed.id);
    expect(fresh).toMatchObject({ status: 'sent', promptId: message.id });
    expect(await runtime.db.messages.get(failed.id)).toBeUndefined();
    expect(await runtime.db.messages.count()).toBe(before);
  });

  it('scopes order lookup, listing and returns to the visitor; agents see every order', async () => {
    const runtime = await harness.boot('returning-customer');
    const chat = createChatServices(runtime, { chunkDelayMs: 0 });
    const own = await runtime.db.orders.toArray();
    await runtime.db.orders.add({
      id: 'ord_other',
      number: 'NW-20001',
      email: 'jordan.lee@example.com',
      status: 'delivered',
      totalCents: 2_800,
      itemSummary: 'Trail mug (steel)',
      orderedAt: '2026-10-15T10:00:00.000Z',
      shippedAt: '2026-10-15T12:00:00.000Z',
      trackingCode: 'TRK200001',
    });
    await runtime.db.returns.add({
      id: 'ret_other',
      orderId: 'ord_other',
      reason: 'Someone else returning a mug',
      status: 'requested',
      amountCents: 2_800,
      createdAt: '2026-10-15T13:00:00.000Z',
      updatedAt: '2026-10-15T13:00:00.000Z',
      createdBy: 'user_agent',
    });

    await expect(chat.lookupOrder('NW-20001')).rejects.toThrow(/on your account/);
    await expect(chat.lookupOrder('ord_other')).rejects.toBeInstanceOf(ChatValidationError);
    await expect(
      chat.requestReturn({ orderId: 'ord_other', reason: 'Wrong size' })
    ).rejects.toThrow(/not found on your account/);
    await expect(chat.listOrdersForEmail('jordan.lee@example.com')).rejects.toBeInstanceOf(
      ChatValidationError
    );
    expect(await chat.listOrdersForEmail('Alex.Trail@example.com')).toHaveLength(own.length);
    expect((await chat.listReturns()).map((r) => r.id)).not.toContain('ret_other');
    expect((await chat.latestOrder())?.id).not.toBe('ord_other');
    expect(await runtime.db.returns.where('orderId').equals('ord_other').count()).toBe(1);

    await runtime.session.switchActor('user_agent');
    expect((await chat.lookupOrder('NW-20001')).id).toBe('ord_other');
    expect((await chat.listReturns()).map((r) => r.id)).toContain('ret_other');
  });

  it("returns the visitor's most recent order as the lookup default in every scenario", async () => {
    for (const id of SCENARIOS) {
      const local = createHarness<ChatDatabase>(definition);
      const runtime = await local.boot(id);
      runtime.environment.set({ network: 'online', failureMode: 'none' });
      const chat = createChatServices(runtime, { chunkDelayMs: 0 });
      const orders = await runtime.db.orders.toArray();
      const newest = [...orders].sort(
        (a, b) => b.orderedAt.localeCompare(a.orderedAt) || b.id.localeCompare(a.id)
      )[0];
      const latest = await chat.latestOrder();
      expect(latest?.id, id).toBe(newest?.id);
      expect((await chat.lookupOrder(latest!.number)).id, id).toBe(latest!.id);
      local.closeAll();
    }
  });
});

describe('launcher unread sync', () => {
  it('applies updates in order so the badge ends on the latest state', async () => {
    const calls: string[] = [];
    let unread = 0;
    let readUpTo = 0;
    let messages = 3;
    const shown: number[] = [];
    const sync = createUnreadSync({
      async unreadCount() {
        calls.push('count');
        await Promise.resolve();
        unread = messages - readUpTo;
        return unread;
      },
      async markRead() {
        calls.push('read');
        await Promise.resolve();
        readUpTo = messages;
      },
      setUnread: (n) => shown.push(n),
    });

    await sync.sync(false);
    expect(shown.at(-1)).toBe(3);
    // Closed: a burst of changes; only the newest one runs.
    messages = 5;
    void sync.sync(false);
    await sync.sync(false);
    expect(shown.at(-1)).toBe(5);
    expect(readUpTo).toBe(0);
    // Opened: read first, then 0 — never a stale count afterwards.
    void sync.sync(false);
    await sync.sync(true);
    expect(shown.at(-1)).toBe(0);
    expect(readUpTo).toBe(5);
    expect(calls).toEqual(['count', 'count', 'read']);
  });
});
