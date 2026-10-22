import { definePrototype, type GenerateContext, parseScenario } from '@protoyard/core';
import { describe, expect, it } from 'vitest';
import {
  DocDocumentSchema,
  definePrototypeFromDoc,
  definePrototypeFromPage,
  PageDocumentSchema,
} from '../src/index.ts';

const options = {
  namespace: 'bp-example',
  slug: 'example-content',
  brandThemeId: 'ocean',
};

describe('page and doc minimal runtime definitions', () => {
  it('builds a definePrototype-valid page runtime from document metadata and brand theme', async () => {
    const page = PageDocumentSchema.parse({
      id: 'landing',
      title: 'Example landing',
      description: 'A short landing page.',
      sections: [{ id: 'hero', blocks: [{ type: 'text', markdown: 'Welcome' }] }],
    });

    const definition = definePrototypeFromPage(page, options);
    expect(definePrototype(definition)).toBe(definition);
    expect(definition.manifest).toMatchObject({
      name: 'Example landing',
      description: 'A short landing page.',
      defaultTheme: 'ocean',
      defaultScenario: 'default',
      preview: { layout: { id: 'marketing' } },
      storage: { namespace: 'bp-example', schemaVersion: 1 },
    });
    expect(definition.database.versions).toEqual([{ version: 1, stores: {} }]);
    expect(definition.scenarios).toHaveLength(1);
    expect(definition.scenarios[0]).toMatchObject({ id: 'default', seed: 0, density: 'empty' });
    expect(definition.generatorVersion).toBe(1);
    expect(await definition.generateWorld?.(parseScenario(definition.scenarios[0]))).toEqual({
      organizations: [],
      personas: [],
      memberships: [],
      tables: {},
    });
    expect(definition.generate({} as GenerateContext)).toEqual({
      organizations: [],
      personas: [],
      memberships: [],
      tables: {},
    });
  });

  it('declares form response storage for forms nested in a page section', () => {
    const page = PageDocumentSchema.parse({
      id: 'signup',
      title: 'Sign up',
      sections: [
        {
          id: 'contact',
          blocks: [
            {
              type: 'reveal',
              id: 'expand-form',
              label: 'Show form',
              blocks: [
                {
                  type: 'form',
                  id: 'contact-form',
                  fields: [{ name: 'email', label: 'Email', type: 'email' }],
                  submitLabel: 'Send',
                  successMessage: 'Thanks.',
                },
              ],
            },
          ],
        },
      ],
      forms: [{ formId: 'contact-form', sectionId: 'contact' }],
    });

    const definition = definePrototypeFromPage(page, options);
    expect(definition.database.versions[0]?.stores).toEqual({
      formResponses: 'id, formId, createdAt, [formId+createdAt]',
    });
  });

  it('builds a doc runtime and includes storage for a direct form block', () => {
    const doc = DocDocumentSchema.parse({
      id: 'guide',
      title: 'Example guide',
      blocks: [
        {
          type: 'form',
          id: 'feedback',
          fields: [{ name: 'comment', label: 'Comment', type: 'longText' }],
          submitLabel: 'Send feedback',
          successMessage: 'Feedback received.',
        },
      ],
    });

    const definition = definePrototypeFromDoc(doc, options);
    expect(definePrototype(definition)).toBe(definition);
    expect(definition.manifest).toMatchObject({
      name: 'Example guide',
      defaultScenario: 'default',
      preview: { layout: { id: 'docs' } },
    });
    expect(definition.database.versions[0]?.stores.formResponses).toBe(
      'id, formId, createdAt, [formId+createdAt]'
    );
  });
});
