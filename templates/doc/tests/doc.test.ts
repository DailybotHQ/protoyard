import type { DocBlueprint } from '@protoyard/blueprint';
import { type AnyContentBlueprint, defineKindRuntime } from '@protoyard/blueprint/kinds';
import { DocDocumentSchema } from '@protoyard/pages';
import { describe, expect, it } from 'vitest';
import blueprintJson from '../blueprint.json';
import { definition, docDocument } from '../src/prototype.ts';

describe('templates/doc', () => {
  it('exports a defineKindRuntime definition with doc blueprintKind and TOC', () => {
    expect(definition.manifest.slug).toBe('doc');
    expect(definition.manifest.kind).toBe('template');
    expect(definition.manifest.blueprintKind).toBe('doc');
    expect(definition.manifest.defaultScenario).toBe('default');
    expect(definition.policy?.roles.presenter).toEqual(
      expect.arrayContaining(['form:submit', 'form:read', 'form:admin', 'blocks:interact'])
    );
    expect(definition.policy?.roles.viewer).toEqual(['form:submit', 'form:read']);
    expect(DocDocumentSchema.safeParse(docDocument).success).toBe(true);
    expect(docDocument.toc?.depth).toBeGreaterThanOrEqual(2);
    expect(docDocument.blocks.some((b) => b.type === 'heading' && b.level === 2)).toBe(true);
  });

  it('defineKindRuntime accepts the doc body as a content blueprint', () => {
    const docBp = {
      formatVersion: 1,
      name: definition.manifest.name,
      kind: 'doc',
      doc: docDocument,
    } as unknown as AnyContentBlueprint;
    const def = defineKindRuntime(docBp, {
      namespace: 'template-doc-test',
      slug: 'doc-test',
    });
    expect(def.database.versions[0]?.stores.formResponses).toBeTruthy();
    expect(def.scenarios.map((s) => s.id)).toEqual(['default']);
  });

  it('loads the catalog report blueprint body', () => {
    expect((blueprintJson as { kind?: string }).kind).toBe('doc');
    expect((blueprintJson as DocBlueprint).doc.id).toBe(docDocument.id);
  });
});
