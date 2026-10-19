import { PermissionDeniedError, parseScenario } from '@protoyard/core';
import { createGenerateContext, validateWorld } from '@protoyard/scenarios';
import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import type { AppDatabase } from '../src/database/schema.ts';
import { createItemServices, ItemValidationError, sortItems } from '../src/domain/items.ts';
import { definition } from '../src/prototype.ts';
import { generateMobileWorld } from '../src/scenarios/generators.ts';
import AppHost from './AppHost.svelte';

const scenario = (id: string) => {
  const input = definition.scenarios.find((s) => s.id === id);
  if (!input) throw new Error(`missing scenario ${id}`);
  return parseScenario(input);
};

describe('generator', () => {
  it('is deterministic and keeps referential integrity in every scenario', () => {
    for (const id of ['empty', 'active', 'viewer']) {
      const s = scenario(id);
      const a = generateMobileWorld(createGenerateContext(s));
      expect(generateMobileWorld(createGenerateContext(s))).toEqual(a);
      expect(
        validateWorld(a, { ...definition.integrity, referenceTime: s.referenceTime }),
        id
      ).toEqual([]);
    }
    expect(generateMobileWorld(createGenerateContext(scenario('empty'))).tables.items).toHaveLength(
      0
    );
    expect(
      generateMobileWorld(createGenerateContext(scenario('active'))).tables.items
    ).toHaveLength(12);
  });
});

describe('item services on the real runtime', () => {
  let harness = createHarness<AppDatabase>(definition);
  afterEach(() => {
    harness.closeAll();
    harness = createHarness<AppDatabase>(definition);
  });

  it('creates, edits, changes status and deletes — and edits survive reload', async () => {
    let runtime = await harness.boot('empty');
    const items = createItemServices(runtime);
    const item = await items.create({ title: '  First item ', notes: 'hello', status: 'todo' });
    expect(item).toMatchObject({ title: 'First item', ownerId: 'user_0001' });
    await items.update(item.id, { title: 'Renamed', notes: '', status: 'doing' });
    runtime = await harness.reload(runtime);
    expect(await runtime.db.items.get(item.id)).toMatchObject({
      title: 'Renamed',
      status: 'doing',
    });

    const again = createItemServices(runtime);
    await expect(again.setStatus(item.id, 'archived' as never)).rejects.toBeInstanceOf(
      ItemValidationError
    );
    await expect(again.setStatus('item_missing', 'done')).rejects.toThrow(/no longer exists/);
    await again.setStatus(item.id, 'done');
    expect((await runtime.db.items.get(item.id))?.status).toBe('done');
    await again.remove(item.id);
    expect(await runtime.db.items.count()).toBe(0);
  });

  it('reports field-level validation issues for forms', async () => {
    const runtime = await harness.boot('empty');
    const error = await createItemServices(runtime)
      .create({ title: ' ', notes: '', status: 'todo' })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ItemValidationError);
    expect((error as ItemValidationError).issues).toEqual({ title: 'Give the item a title.' });
  });

  it('blocks the viewer at service level and writes nothing offline', async () => {
    const runtime = await harness.boot('viewer');
    const items = createItemServices(runtime);
    const [first] = await runtime.db.items.toArray();
    await expect(items.create({ title: 'x', notes: '', status: 'todo' })).rejects.toBeInstanceOf(
      PermissionDeniedError
    );
    await expect(items.remove(first?.id ?? '')).rejects.toBeInstanceOf(PermissionDeniedError);

    await runtime.session.switchActor('user_0001');
    await runtime.overrides.set({ environment: { network: 'offline' } });
    const before = await runtime.db.items.count();
    await expect(items.create({ title: 'x', notes: '', status: 'todo' })).rejects.toMatchObject({
      code: 'offline',
    });
    expect(await runtime.db.items.count()).toBe(before);
  });

  it('sorts in progress first, then to do, then done', async () => {
    const runtime = await harness.boot('active');
    const order = sortItems(await runtime.db.items.toArray()).map((i) => i.status);
    const rank = { doing: 0, todo: 1, done: 2 } as const;
    expect(order.map((s) => rank[s])).toEqual([...order.map((s) => rank[s])].sort());
  });
});

describe('app shell', () => {
  let harness = createHarness<AppDatabase>(definition);
  afterEach(() => {
    cleanup();
    location.hash = '';
    harness.closeAll();
    harness = createHarness<AppDatabase>(definition);
  });

  it('renders the bottom nav in normal flow, after the only scrolling region', async () => {
    const runtime = await harness.boot('active');
    const { container } = render(AppHost, { runtime });
    const nav = await screen.findByRole('navigation', { name: 'Primary' });
    const main = await waitFor(() => {
      const element = container.querySelector('main');
      expect(element).toBeTruthy();
      return element;
    });

    // In flow: not fixed to the window, so no viewport preset or frame can push it off screen.
    expect(nav.className).not.toMatch(/\bfixed\b/);
    expect(main?.className).toMatch(/\boverflow-y-auto\b/);
    expect(main?.contains(nav)).toBe(false);
    const tabBar = container.querySelector('[data-py-tab-bar]');
    expect(main?.parentElement?.contains(tabBar)).toBe(true);
    expect(
      (main?.compareDocumentPosition(tabBar ?? nav) ?? 0) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    // The shell is exactly one app-height tall; no desktop card or md: frame remains.
    expect(main?.parentElement?.className).toMatch(/\bh-app\b/);
    expect(container.querySelector('[data-py-layout-host]')?.getAttribute('data-layout')).toBe(
      'mobile-tabs'
    );
    expect(container.querySelector('[data-py-layout="mobile-tabs"]')).toBeTruthy();

    expect(await screen.findByRole('heading', { name: 'Items', level: 1 })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Items' }).getAttribute('aria-current')).toBe('page');
  });
});
