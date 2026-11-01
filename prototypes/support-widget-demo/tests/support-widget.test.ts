import { afterEach, describe, expect, it } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import { expectBootableWorld } from '../../../tests/support/smoke.ts';
import type { ChatDatabase } from '../src/database/schema.ts';
import { SUPPORT_THREAD_ID } from '../src/database/schema.ts';
import { ASSISTANT } from '../src/domain/assistant.ts';
import { ChatValidationError, createChatServices } from '../src/domain/chat.ts';
import { definition } from '../src/prototype.ts';

describe('support-widget-demo services', () => {
  let harness = createHarness<ChatDatabase>(definition);
  afterEach(() => {
    harness.closeAll();
    harness = createHarness<ChatDatabase>(definition);
  });

  it('generates deterministic worlds and boots the default scenario', async () => {
    await expectBootableWorld(definition, harness);
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
});
