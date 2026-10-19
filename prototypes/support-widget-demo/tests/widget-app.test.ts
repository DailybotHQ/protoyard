import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import type { ChatDatabase } from '../src/database/schema.ts';
import { readMarkerId, SUPPORT_THREAD_ID } from '../src/database/schema.ts';
import { createChatServices } from '../src/domain/chat.ts';
import { definition } from '../src/prototype.ts';
import AppHost from './AppHost.svelte';
import { FakeWidgetHost } from './fake-widget-host.svelte.ts';

const SCENARIOS = definition.scenarios.map((s) => s.id);

let harness = createHarness<ChatDatabase>(definition);
afterEach(() => {
  cleanup();
  delete window.__protoyardWidget;
  harness.closeAll();
  harness = createHarness<ChatDatabase>(definition);
});

describe('support widget app (component, real runtime)', () => {
  it('raises the launcher badge while the panel is closed and clears it when opened', async () => {
    const runtime = await harness.boot('returning-customer');
    const chat = createChatServices(runtime, { chunkDelayMs: 0 });
    const host = new FakeWidgetHost();
    window.__protoyardWidget = host;
    const marker = async () =>
      (await runtime.db.reads.get(readMarkerId(SUPPORT_THREAD_ID, 'user_visitor')))?.lastReadAt;
    const seededRead = await marker();
    render(AppHost, { runtime });
    await screen.findByTestId('order-tools');

    // A message from someone else arrives while the panel is closed.
    await chat.requestHandoff(SUPPORT_THREAD_ID);
    await waitFor(() => expect(host.getUnread()).toBe(1));
    expect(await marker()).toBe(seededRead);

    // Opening the panel marks the thread read and clears the badge.
    host.open();
    await waitFor(() => expect(host.getUnread()).toBe(0));
    const thread = await runtime.db.conversations.get(SUPPORT_THREAD_ID);
    await waitFor(async () =>
      expect((await marker()) ?? '').toBe(thread?.lastMessageAt ?? 'missing')
    );

    // Closed again: the next message raises the badge again.
    host.close();
    const order = (await runtime.db.orders.toArray()).find((o) => o.status === 'delivered')!;
    await chat.requestReturn({ orderId: order.id, reason: 'Too small for weekend trips' });
    await waitFor(() => expect(host.getUnread()).toBe(1));
  });

  it('marks the thread read when the widget frame mounts with the panel already open', async () => {
    const runtime = await harness.boot('returning-customer');
    const chat = createChatServices(runtime, { chunkDelayMs: 0 });
    await chat.requestHandoff(SUPPORT_THREAD_ID);
    render(AppHost, { runtime });
    await screen.findByTestId('order-tools');

    // The frame loads lazily after the app; it marks the panel when it mounts.
    const host = new FakeWidgetHost();
    host.open();
    window.__protoyardWidget = host;
    document.body.dataset.pyWidgetPanel = 'open';
    await waitFor(async () => {
      const read = await runtime.db.reads.get(readMarkerId(SUPPORT_THREAD_ID, 'user_visitor'));
      const thread = await runtime.db.conversations.get(SUPPORT_THREAD_ID);
      expect(read?.lastReadAt).toBe(thread?.lastMessageAt);
    });
    expect(host.getUnread()).toBe(0);
    delete document.body.dataset.pyWidgetPanel;
  });

  it.each(SCENARIOS)('prefills an order number that the lookup finds (%s)', async (id) => {
    const runtime = await harness.boot(id);
    // Offline and failure modes are the scenario's conditions, not the default's fault.
    runtime.environment.set({ network: 'online', failureMode: 'none' });
    window.__protoyardWidget = new FakeWidgetHost();
    render(AppHost, { runtime });

    const input = (await screen.findByTestId('order-lookup-input')) as HTMLInputElement;
    await waitFor(() => expect(input.value).not.toBe(''));
    const prefilled = input.value;
    await fireEvent.click(screen.getByTestId('order-lookup-submit'));
    const card = await screen.findByTestId('order-card');
    expect(card.getAttribute('data-order-number')).toBe(prefilled);
    expect(screen.queryByTestId('order-lookup-error')).toBeNull();
  });
});
