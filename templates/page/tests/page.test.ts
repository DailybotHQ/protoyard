import type { PageBlueprint } from '@protoyard/blueprint';
import {
  type AnyContentBlueprint,
  createKindServices,
  defineKindRuntime,
  KIND_PERSONAS,
} from '@protoyard/blueprint/kinds';
import type { PrototypeRuntime } from '@protoyard/core';
import { PageDocumentSchema } from '@protoyard/pages';
import { afterEach, describe, expect, it } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import blueprintJson from '../blueprint.json';
import { definition, pageDocument } from '../src/prototype.ts';

const NAMESPACE = 'template-page-test';

let harnesses: ReturnType<typeof createHarness>[] = [];
afterEach(() => {
  for (const h of harnesses) h.closeAll();
  harnesses = [];
});

const rows = (runtime: PrototypeRuntime, table: string) =>
  (runtime.db as { table(name: string): { toArray(): Promise<Record<string, unknown>[]> } })
    .table(table)
    .toArray();

describe('templates/page', () => {
  it('exports a defineKindRuntime definition with page blueprintKind and form policy', () => {
    expect(definition.manifest.slug).toBe('page');
    expect(definition.manifest.kind).toBe('template');
    expect(definition.manifest.blueprintKind).toBe('page');
    expect(definition.manifest.defaultScenario).toBe('default');
    expect(definition.policy?.roles.presenter).toEqual(
      expect.arrayContaining(['form:submit', 'form:read', 'form:admin', 'blocks:interact'])
    );
    expect(definition.policy?.roles.audience).toEqual(
      expect.arrayContaining(['form:submit', 'form:read', 'blocks:interact'])
    );
    expect(definition.policy?.roles.viewer).toEqual(['form:submit', 'form:read']);
    expect(PageDocumentSchema.safeParse(pageDocument).success).toBe(true);
    expect(pageDocument.sections.some((s) => s.blocks.some((b) => b.type === 'form'))).toBe(true);
  });

  it('persists a waitlist form through the kind runtime and lists it', async () => {
    const pageBp = {
      formatVersion: 1,
      name: definition.manifest.name,
      kind: 'page',
      page: pageDocument,
    } as unknown as AnyContentBlueprint;
    const harness = createHarness(
      defineKindRuntime(pageBp, { namespace: NAMESPACE, slug: 'page-test' })
    );
    harnesses.push(harness);
    const runtime = await harness.boot();
    const services = await createKindServices(runtime, pageBp);

    // Audience may submit and read.
    await runtime.session.switchActor(KIND_PERSONAS.audience);
    const saved = await services.responses.submit('waitlist-form', {
      email: 'ada@example.com',
      plan: 'starter',
    });
    expect(saved.formId).toBe('waitlist-form');
    expect(saved.values.email).toBe('ada@example.com');
    expect(saved.personaId).toBe(KIND_PERSONAS.audience);

    const listed = await services.responses.list('waitlist-form');
    expect(listed).toHaveLength(1);
    expect(listed[0]?.id).toBe(saved.id);
    expect(await rows(runtime, 'formResponses')).toHaveLength(1);

    // Viewer can also submit (form:submit) and read.
    await runtime.session.switchActor(KIND_PERSONAS.viewer);
    await services.responses.submit('waitlist-form', {
      email: 'viewer@example.com',
      plan: 'household',
    });
    expect(await services.responses.list('waitlist-form')).toHaveLength(2);
  });

  it('loads the catalog blueprint body as a page blueprint', () => {
    expect((blueprintJson as { kind?: string }).kind).toBe('page');
    expect((blueprintJson as PageBlueprint).page.id).toBe(pageDocument.id);
  });
});
