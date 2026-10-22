// @vitest-environment node

import { definePrototype } from '@protoyard/core';
import type { DocDocument, PageDocument } from '@protoyard/pages';
import { FORM_RESPONSES_STORE_STRING } from '@protoyard/pages';
import { describe, expect, it } from 'vitest';
import {
  definePrototypeFromDoc,
  definePrototypeFromPage,
  PAGES_DEFAULT_SCENARIO,
} from '../../src/kinds/page-doc-runtime.ts';

const options = {
  namespace: 'example-content',
  name: 'Example guide',
  description: 'Delegates to defineKindRuntime.',
};

const page: PageDocument = {
  id: 'example-page',
  title: 'Example page',
  sections: [
    {
      id: 'hero',
      role: 'hero',
      blocks: [{ type: 'heading', text: 'Hello', level: 1 }],
    },
  ],
};

const doc: DocDocument = {
  id: 'example-doc',
  title: 'Example guide',
  blocks: [
    { type: 'heading', text: 'Guide', level: 1 },
    {
      type: 'form',
      id: 'feedback',
      fields: [{ name: 'note', label: 'Note', type: 'longText' }],
      submitLabel: 'Send',
      successMessage: 'Ok',
    },
  ],
};

describe('definePrototypeFromPage/Doc (blueprint/kinds)', () => {
  it('builds a page runtime with kind personas, policy and shared stores', () => {
    const definition = definePrototypeFromPage(page, options);
    expect(definePrototype(definition)).toBe(definition);
    expect(definition.manifest.defaultScenario).toBe(PAGES_DEFAULT_SCENARIO);
    expect(definition.manifest.storage.namespace).toBe('example-content');
    expect(definition.manifest.name).toBe('Example guide');
    expect(definition.policy?.roles.presenter).toEqual(
      expect.arrayContaining(['form:submit', 'form:read', 'form:admin', 'blocks:interact'])
    );
    expect(definition.policy?.roles.viewer).toEqual(['form:submit', 'form:read']);
    expect(definition.database.versions[0]?.stores.blockStates).toMatch(/documentId/);
    expect(definition.database.versions[0]?.stores.formResponses).toBe(FORM_RESPONSES_STORE_STRING);
    expect(definition.generate).toBeTypeOf('function');
  });

  it('builds a doc runtime the same way', () => {
    const definition = definePrototypeFromDoc(doc, options);
    expect(definePrototype(definition)).toBe(definition);
    expect(definition.manifest.name).toBe('Example guide');
    expect(definition.manifest.defaultScenario).toBe(PAGES_DEFAULT_SCENARIO);
    expect(definition.database.versions[0]?.stores.formResponses).toBe(FORM_RESPONSES_STORE_STRING);
    expect(definition.policy?.roles.audience).toEqual(
      expect.arrayContaining(['form:submit', 'form:read', 'blocks:interact'])
    );
  });
});
