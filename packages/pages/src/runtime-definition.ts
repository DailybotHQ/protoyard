import type { Block } from '@protoyard/blocks';
import { definePrototype, parseManifest, type Theme, type WorldSeed } from '@protoyard/core';
import type { DocDocument, PageDocument } from './schema.ts';

export interface RuntimeDefinitionOptions {
  /** Storage namespace (IndexedDB name), usually the blueprint content namespace. */
  namespace: string;
  /** Manifest slug; defaults to the namespace. */
  slug?: string;
  /** Manifest version. */
  version?: string;
  /** Root blueprint metadata takes precedence over the document's title and description. */
  name?: string;
  description?: string;
  category?: string;
  tags?: string[];
  icon?: string;
  /** Theme resolved from the optional blueprint brand by the caller. */
  brandTheme?: Theme;
  /** Theme id from the brand, including a library theme with no local Theme object. */
  brandThemeId?: string;
}

export const PAGES_DEFAULT_SCENARIO = 'default';
export const PAGES_GENERATOR_VERSION = 1;

const FORM_RESPONSES_STORE = 'id, formId, createdAt, [formId+createdAt]';

/** Creates a minimal runtime definition for a page document. */
export function definePrototypeFromPage(page: PageDocument, options: RuntimeDefinitionOptions) {
  return defineContentPrototype(page, options, 'marketing', hasPageForms(page));
}

/** Creates a minimal runtime definition for a doc document. */
export function definePrototypeFromDoc(doc: DocDocument, options: RuntimeDefinitionOptions) {
  return defineContentPrototype(doc, options, 'docs', hasDocForms(doc));
}

function defineContentPrototype(
  document: PageDocument | DocDocument,
  options: RuntimeDefinitionOptions,
  layout: 'marketing' | 'docs',
  hasForms: boolean
) {
  const slug = options.slug ?? options.namespace;
  const scenarios = [
    {
      id: PAGES_DEFAULT_SCENARIO,
      name: 'Default',
      description: 'An empty preview world for this content.',
      seed: 0,
      referenceTime: '2026-01-01T00:00:00.000Z',
      density: 'empty' as const,
      activity: { level: 'none' as const },
    },
  ];
  const manifest = parseManifest({
    id: `local.${slug}`,
    slug,
    kind: 'prototype',
    name: options.name ?? document.title,
    description: options.description ?? document.description ?? '',
    version: options.version ?? '0.1.0',
    category: options.category ?? 'general',
    tags: options.tags ?? [],
    ...(options.icon ? { icon: options.icon } : {}),
    defaultScenario: PAGES_DEFAULT_SCENARIO,
    defaultTheme: options.brandThemeId ?? options.brandTheme?.id ?? 'violet',
    preview: { viewport: 'desktop', layout: { id: layout } },
    storage: { namespace: options.namespace, schemaVersion: 1 },
    scenarios: [PAGES_DEFAULT_SCENARIO],
  });

  const stores: Record<string, string | null> = {};
  if (hasForms) stores.formResponses = FORM_RESPONSES_STORE;

  return definePrototype({
    manifest,
    database: { versions: [{ version: 1, stores }] },
    scenarios,
    policy: { roles: {} },
    generate: emptyWorld,
    generateWorld: async () => emptyWorld(),
    generatorVersion: PAGES_GENERATOR_VERSION,
    ...(options.brandTheme ? { themes: [options.brandTheme] } : {}),
  });
}

function emptyWorld(): WorldSeed {
  return { organizations: [], personas: [], memberships: [], tables: {} };
}

function hasPageForms(page: PageDocument): boolean {
  return page.sections.some((section) => section.blocks.some(containsForm));
}

function hasDocForms(doc: DocDocument): boolean {
  return doc.blocks.some(containsForm);
}

function containsForm(block: Block): boolean {
  if (block.type === 'form') return true;
  if (block.type === 'columns') return block.columns.some((column) => column.some(containsForm));
  if (block.type === 'tabs') return block.panels.some((panel) => panel.blocks.some(containsForm));
  if (block.type === 'reveal') return block.blocks.some(containsForm);
  return false;
}
