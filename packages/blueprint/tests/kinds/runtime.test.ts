import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BlockSchema } from '@protoyard/blocks';
import { BlockActionError, pollResults, stateKey } from '@protoyard/blocks/interactive';
import { definePrototype, PermissionDeniedError, type PrototypeRuntime } from '@protoyard/core';
import { afterEach, describe, expect, it } from 'vitest';
import { createHarness } from '../../../../tests/support/runtime.ts';
import {
  type AnyContentBlueprint,
  createKindServices,
  defineKindPrototype,
  defineKindRuntime,
  FormResponseError,
  findDocumentBlock,
  KIND_DEFAULT_SCENARIO,
  KIND_PERSONAS,
  KIND_STORES,
  kindBrandTheme,
  kindDefaultThemeId,
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
  it('uses fixtures the block schema accepts', () => {
    for (const block of Object.values(blocks)) {
      expect(BlockSchema.safeParse(block).success, block.type).toBe(true);
    }
  });

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
      storage: { namespace: NAMESPACE, schemaVersion: 1 },
      scenarios: ['default'],
    });
    expect(definition.database.versions).toEqual([{ version: 1, stores: { ...KIND_STORES } }]);
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

  it('builds a brand theme, or opens a library theme by id', () => {
    const seeded = defineKindRuntime(deck({ brand: { seed: '#2563eb' } }), {
      namespace: NAMESPACE,
    });
    expect(seeded.themes).toHaveLength(1);
    expect(seeded.manifest.defaultTheme).toBe(seeded.themes?.[0]?.id);
    const library = defineKindRuntime(deck({ brand: { libraryTheme: 'fintech-ledger' } }), {
      namespace: NAMESPACE,
    });
    expect(library.themes).toBeUndefined();
    expect(library.manifest.defaultTheme).toBe('fintech-ledger');
  });

  it('matches defineKindPrototype given the brand resolved ahead (generated prototypes)', () => {
    for (const brand of [undefined, { seed: '#2563eb' }, { libraryTheme: 'fintech-ledger' }]) {
      const doc = deck(brand ? { brand } : {});
      const ahead = defineKindPrototype(doc, {
        namespace: NAMESPACE,
        brandTheme: kindBrandTheme(doc),
        defaultThemeId: kindDefaultThemeId(doc),
      });
      const resolved = defineKindRuntime(doc, { namespace: NAMESPACE });
      expect(ahead.manifest).toEqual(resolved.manifest);
      expect(ahead.themes).toEqual(resolved.themes);
    }
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
    expect(a.tables).toEqual({ blockStates: [], formResponses: [] });
  });

  it('keeps the blueprint world generator and Faker out of its import graph', () => {
    const src = resolve(dirname(fileURLToPath(import.meta.url)), '../../src');
    const visited = new Set<string>();
    const external = new Set<string>();
    const visit = (file: string) => {
      if (visited.has(file)) return;
      visited.add(file);
      const text = readFileSync(file, 'utf8');
      for (const [, spec] of text.matchAll(
        /^\s*(?:import|export)[^'"]*from\s+['"]([^'"]+)['"]/gm
      )) {
        if (!spec) continue;
        if (spec.startsWith('.')) visit(join(dirname(file), spec));
        else external.add(spec);
      }
    };
    visit(join(src, 'kinds/runtime.ts'));
    visit(join(src, 'kinds/services.ts'));
    const local = [...visited].map((file) => file.slice(src.length + 1));
    expect(local).not.toContain('generator.ts');
    expect(local.some((file) => file.startsWith('generator'))).toBe(false);
    expect(
      [...external].some((spec) => spec.includes('faker') || spec.endsWith('/generator'))
    ).toBe(false);
  });
});

describe('kind runtime and services on a real runtime', () => {
  it('boots in fake-indexeddb, loads the default scenario as the presenter', async () => {
    const { runtime } = await boot();
    expect(runtime.scenarios.active()?.scenario.id).toBe('default');
    expect(
      runtime.session
        .personas()
        .map((p) => p.id)
        .sort()
    ).toEqual(['audience', 'presenter', 'viewer']);
    expect(runtime.session.principal()?.persona.id).toBe(KIND_PERSONAS.presenter);
    expect(runtime.session.principal()?.role).toBe('presenter');
  });

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

  it('resolves the block from the document, not from the caller', async () => {
    const { runtime, services } = await boot();
    const key = stateKey(NAMESPACE, 'claps');
    // A forged definition (max 1000) cannot widen the document's bounds (max 10).
    const forged = { ...blocks.counter, max: 1000 };
    for (let i = 0; i < 10; i++) {
      await services.blockStates.dispatch(key, forged as never, { type: 'increment' });
    }
    await expect(
      services.blockStates.dispatch(key, forged as never, { type: 'increment' })
    ).rejects.toBeInstanceOf(BlockActionError);
    expect((await rows(runtime, 'blockStates'))[0]?.state).toEqual({ value: 10 });

    await expect(
      services.blockStates.dispatch(stateKey(NAMESPACE, 'missing'), blocks.counter as never, {
        type: 'increment',
      })
    ).rejects.toThrow(/No interactive block "missing"/);
    await expect(
      services.blockStates.dispatch(stateKey('other-doc', 'claps'), blocks.counter as never, {
        type: 'increment',
      })
    ).rejects.toThrow(/does not belong to this document/);
    await expect(
      services.blockStates.dispatch(stateKey(NAMESPACE, 'signup'), blocks.counter as never, {
        type: 'increment',
      })
    ).rejects.toThrow(/No interactive block "signup"/);
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

  it('keeps state across a reload and clears it with a scenario reset', async () => {
    const { harness, runtime, services, doc } = await boot();
    const key = stateKey(NAMESPACE, 'claps');
    await services.blockStates.dispatch(key, blocks.counter as never, { type: 'increment' });
    services.destroy();

    const reloaded = await harness.reload(runtime);
    const again = await createKindServices(reloaded, doc);
    expect(again.blockStates.read(key)).toEqual({ value: 1 });

    const heard: unknown[] = [];
    again.blockStates.subscribe(key, (state) => heard.push(state));
    await reloaded.scenarios.reset();
    await again.blockStates.refresh();
    expect(again.blockStates.read(key)).toBeUndefined();
    expect(heard.at(-1)).toBeUndefined();
    again.destroy();
  });

  it('finds blocks nested anywhere in the document body', () => {
    const doc = deck();
    expect(findDocumentBlock(doc, 'claps')).toMatchObject({ type: 'counter' });
    expect(findDocumentBlock(doc, 'signup')).toMatchObject({ type: 'form' });
    expect(findDocumentBlock(doc, 'nothing')).toBeNull();
  });
});

describe('page form through kind runtime (lead form contract)', () => {
  function pageDoc(): AnyContentBlueprint {
    return {
      formatVersion: 1,
      name: 'Landing with form',
      description: 'Page form persistence through defineKindRuntime.',
      tags: ['page'],
      kind: 'page',
      page: {
        id: 'landing-form',
        title: 'Landing',
        sections: [
          {
            id: 'waitlist',
            role: 'cta',
            blocks: [blocks.form],
          },
        ],
        forms: [{ formId: 'signup', sectionId: 'waitlist' }],
      },
    } as unknown as AnyContentBlueprint;
  }

  it('submits and lists a page form through createKindServices / createFormServices', async () => {
    const doc = pageDoc();
    // Validate the form block against the real schema.
    expect(BlockSchema.parse(blocks.form).type).toBe('form');
    const { runtime, services } = await boot(doc);
    const saved = await services.responses.submit('signup', {
      email: 'ada@example.com',
      team: 3,
      plan: 'free',
    });
    expect(saved).toMatchObject({
      formId: 'signup',
      personaId: 'presenter',
      documentId: NAMESPACE,
      values: { email: 'ada@example.com', team: 3, plan: 'free' },
    });
    expect(saved.createdAt).toBeTruthy();
    const listed = await services.responses.list('signup');
    expect(listed).toHaveLength(1);
    expect(listed[0]?.id).toBe(saved.id);
    expect(await rows(runtime, 'formResponses')).toHaveLength(1);
  });
});
