import { BlockActionError, pollResults, stateKey } from '@protoyard/blocks/interactive';
import { definePrototype, PermissionDeniedError, type PrototypeRuntime } from '@protoyard/core';
import { DOC_EDITS_STORE_STRING } from '@protoyard/pages';
import { afterEach, describe, expect, it } from 'vitest';
import { createHarness } from '../../../../tests/support/runtime.ts';
import {
  type AnyContentBlueprint,
  createKindServices,
  defineKindRuntime,
  FormResponseError,
  KIND_DEFAULT_SCENARIO,
  KIND_PERSONAS,
  KIND_STORES,
  kindWorld,
} from '../../src/kinds/index.ts';

const NAMESPACE = 'bp-kindruntime';

/** Every block in the fixture is checked against the real block schema first. */
const blocks = {
  poll: {
    type: 'poll',
    id: 'favorite',
    question: 'Which kind should ship first?',
    options: [
      { id: 'decks', label: 'Decks' },
      { id: 'pages', label: 'Pages' },
    ],
  },
  counter: { type: 'counter', id: 'claps', label: 'Claps', step: 1, min: 0, max: 10 },
  form: {
    type: 'form',
    id: 'signup',
    fields: [
      { name: 'email', label: 'Email', type: 'email', required: true },
      { name: 'team', label: 'Team size', type: 'number', min: 1, max: 500 },
      {
        name: 'plan',
        label: 'Plan',
        type: 'enum',
        options: [
          { value: 'free', label: 'Free' },
          { value: 'team', label: 'Team' },
        ],
      },
    ],
    submitLabel: 'Join',
    successMessage: 'Thanks!',
  },
} as const;

function deck(extra: Record<string, unknown> = {}): AnyContentBlueprint {
  return {
    formatVersion: 1,
    name: 'Launch review',
    description: 'A short deck with a poll, a counter and a form.',
    tags: ['launch'],
    kind: 'deck',
    deck: {
      slides: [
        { id: 'intro', blocks: [{ type: 'heading', text: 'Launch review', level: 1 }] },
        { id: 'vote', blocks: [blocks.poll, { type: 'columns', columns: [[blocks.counter]] }] },
        { id: 'join', blocks: [blocks.form] },
      ],
    },
    ...extra,
  } as unknown as AnyContentBlueprint;
}

let harnesses: ReturnType<typeof createHarness>[] = [];
afterEach(() => {
  for (const harness of harnesses) harness.closeAll();
  harnesses = [];
});

async function boot(doc = deck()) {
  const harness = createHarness(defineKindRuntime(doc, { namespace: NAMESPACE }));
  harnesses.push(harness);
  const runtime = await harness.boot();
  const services = await createKindServices(runtime, doc);
  return { harness, runtime, services, doc };
}

const rows = (runtime: PrototypeRuntime, table: string) =>
  (runtime.db as { table(name: string): { toArray(): Promise<Record<string, unknown>[]> } })
    .table(table)
    .toArray();

describe('defineKindRuntime', () => {
  it('returns a definePrototype-valid definition with the kind stores, one scenario and three roles', () => {
    const definition = defineKindRuntime(deck({ icon: '🎤', category: 'talks' }), {
      namespace: NAMESPACE,
    });
    expect(definePrototype(definition)).toBe(definition);
    expect(definition.manifest).toMatchObject({
      id: `local.${NAMESPACE}`,
      slug: NAMESPACE,
      kind: 'prototype',
      name: 'Launch review',
      category: 'talks',
      icon: '🎤',
      defaultScenario: KIND_DEFAULT_SCENARIO,
      defaultTheme: 'violet',
      storage: { namespace: NAMESPACE, schemaVersion: 2 },
      scenarios: ['default'],
    });
    // Version 2 adds docEdits; version 1 keeps the stores older browsers hold.
    expect(definition.database.versions).toEqual([
      {
        version: 1,
        stores: { blockStates: KIND_STORES.blockStates, formResponses: KIND_STORES.formResponses },
      },
      { version: 2, stores: { ...KIND_STORES } },
    ]);
    expect(KIND_STORES.docEdits).toBe(DOC_EDITS_STORE_STRING);
    expect(definition.scenarios.map((s) => s.id)).toEqual(['default']);
    expect(Object.keys(definition.policy?.roles ?? {}).sort()).toEqual([
      'audience',
      'presenter',
      'viewer',
    ]);
    expect(definition.policy?.roles.viewer).toEqual(['form:submit', 'form:read']);
    expect(definition.themes).toBeUndefined();
    expect(defineKindRuntime(deck(), { namespace: NAMESPACE }).manifest.category).toBe('deck');
  });

  it('builds the same world for the same scenario, from fixed data only', () => {
    const scenario = {
      referenceTime: '2026-06-01T09:00:00.000Z',
      organization: { id: 'org_kind', subscription: 'free' },
    } as Parameters<typeof kindWorld>[0];
    const a = kindWorld(scenario);
    expect(kindWorld(scenario)).toEqual(a);
    expect(a.personas.map((p) => p.id)).toEqual(['presenter', 'audience', 'viewer']);
    expect(a.personas.every((p) => p.email?.endsWith('@example.com'))).toBe(true);
    expect(a.memberships.map((m) => m.role)).toEqual(['presenter', 'audience', 'viewer']);
    expect(a.tables).toEqual({ blockStates: [], formResponses: [], docEdits: [] });
  });
});

describe('kind runtime and services on a real runtime', () => {
  it('records a poll vote through the service, as the active persona', async () => {
    const { runtime, services } = await boot();
    const key = stateKey(NAMESPACE, 'favorite');
    const heard: unknown[] = [];
    const off = services.blockStates.subscribe(key, (state) => heard.push(state));
    expect(services.blockStates.read(key)).toBeUndefined();

    // The caller's viewer is ignored: the session decides who votes.
    const state = await services.blockStates.dispatch(key, blocks.poll as never, {
      type: 'vote',
      viewer: 'someone-else',
      options: ['decks'],
    });
    expect(state).toEqual({ votes: { presenter: ['decks'] } });
    expect(services.blockStates.read(key)).toEqual(state);
    expect(heard).toEqual([state]);
    expect(await rows(runtime, 'blockStates')).toEqual([
      expect.objectContaining({ key, documentId: NAMESPACE, blockId: 'favorite', state }),
    ]);

    await runtime.session.switchActor(KIND_PERSONAS.audience);
    await services.blockStates.dispatch(key, blocks.poll as never, {
      type: 'vote',
      options: ['pages'],
    });
    const results = pollResults(
      blocks.poll as never,
      services.blockStates.read(key) as never,
      'audience'
    );
    expect(results.voters).toBe(2);
    off();
  });

  it('rejects a refused action with BlockActionError and writes nothing', async () => {
    const { runtime, services } = await boot();
    const key = stateKey(NAMESPACE, 'favorite');
    await expect(
      services.blockStates.dispatch(key, blocks.poll as never, { type: 'vote', options: ['nope'] })
    ).rejects.toBeInstanceOf(BlockActionError);
    await expect(
      services.blockStates.dispatch(key, blocks.poll as never, { type: 'explode' })
    ).rejects.toBeInstanceOf(BlockActionError);
    expect(await rows(runtime, 'blockStates')).toEqual([]);
    expect(services.blockStates.read(key)).toBeUndefined();
  });

  it('asserts the simulated policy: viewers cannot mutate interactive blocks but may submit forms', async () => {
    const { runtime, services } = await boot();
    await runtime.session.switchActor(KIND_PERSONAS.viewer);
    await expect(
      services.blockStates.dispatch(stateKey(NAMESPACE, 'claps'), blocks.counter as never, {
        type: 'increment',
      })
    ).rejects.toBeInstanceOf(PermissionDeniedError);
    const saved = await services.responses.submit('signup', { email: 'v@example.com' });
    expect(saved.personaId).toBe('viewer');
    expect(await rows(runtime, 'blockStates')).toEqual([]);
    expect(await rows(runtime, 'formResponses')).toHaveLength(1);
  });

  it('goes through environment.run: an offline environment fails the write and stores nothing', async () => {
    const { runtime, services } = await boot();
    runtime.environment.set({ network: 'offline' });
    await expect(
      services.blockStates.dispatch(stateKey(NAMESPACE, 'claps'), blocks.counter as never, {
        type: 'increment',
      })
    ).rejects.toThrow();
    await expect(services.responses.submit('signup', { email: 'a@example.com' })).rejects.toThrow();
    expect(await rows(runtime, 'blockStates')).toEqual([]);
    expect(await rows(runtime, 'formResponses')).toEqual([]);
  });

  it('records a form response validated against the form, and scopes who reads them', async () => {
    const { runtime, services } = await boot();
    const first = await services.responses.submit('signup', {
      email: 'rowan@example.com',
      team: 12,
      plan: 'team',
    });
    expect(first).toMatchObject({
      documentId: NAMESPACE,
      formId: 'signup',
      personaId: 'presenter',
      values: { email: 'rowan@example.com', team: 12, plan: 'team' },
    });
    expect(first.createdAt).toBe(runtime.clock.now().toISOString());
    expect(first.id).toMatch(/^response-/);

    const bad = services.responses.submit('signup', { email: 'not-an-email', team: 0, extra: 1 });
    await expect(bad).rejects.toBeInstanceOf(FormResponseError);
    const error = (await bad.catch((e: unknown) => e)) as FormResponseError;
    expect(Object.keys(error.issues).sort()).toEqual(['email', 'form', 'team'].sort());
    await expect(services.responses.submit('nope', {})).rejects.toThrow(/No form "nope"/);
    await expect(services.responses.submit('favorite', {})).rejects.toThrow(/No form "favorite"/);

    await runtime.session.switchActor(KIND_PERSONAS.audience);
    await services.responses.submit('signup', { email: 'sam@example.com' });
    // form:read is granted to audience and presenter — both see every response.
    expect((await services.responses.list('signup')).map((r) => r.personaId).sort()).toEqual([
      'audience',
      'presenter',
    ]);
    await runtime.session.switchActor(KIND_PERSONAS.presenter);
    expect((await services.responses.list()).map((r) => r.personaId).sort()).toEqual([
      'audience',
      'presenter',
    ]);
  });
});
