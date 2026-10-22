import {
  type AnyContentBlueprint,
  defineKindRuntime,
  KIND_DEFAULT_SCENARIO,
  KIND_GENERATOR_VERSION,
  type KindRuntimeOptions,
} from '@protoyard/blueprint/kinds';
import type { PrototypeDefinition } from '@protoyard/core';
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
}

/** Alias of the kind default scenario id (shared content-kind runtime). */
export const PAGES_DEFAULT_SCENARIO = KIND_DEFAULT_SCENARIO;
/** Alias of the kind generator version (shared content-kind runtime). */
export const PAGES_GENERATOR_VERSION = KIND_GENERATOR_VERSION;

/**
 * Builds the shared content-kind runtime for a page document by delegating to
 * `defineKindRuntime` (lead decision: one runtime with personas and policy).
 */
export function definePrototypeFromPage(
  page: PageDocument,
  options: RuntimeDefinitionOptions
): PrototypeDefinition {
  return defineKindRuntime(pageBlueprint(page, options), toKindOptions(options));
}

/**
 * Builds the shared content-kind runtime for a doc document by delegating to
 * `defineKindRuntime`.
 */
export function definePrototypeFromDoc(
  doc: DocDocument,
  options: RuntimeDefinitionOptions
): PrototypeDefinition {
  return defineKindRuntime(docBlueprint(doc, options), toKindOptions(options));
}

function toKindOptions(options: RuntimeDefinitionOptions): KindRuntimeOptions {
  return {
    namespace: options.namespace,
    slug: options.slug,
    version: options.version,
  };
}

function pageBlueprint(page: PageDocument, options: RuntimeDefinitionOptions): AnyContentBlueprint {
  return {
    formatVersion: 1,
    name: options.name ?? page.title,
    description: options.description ?? page.description ?? '',
    tags: options.tags ?? ['page'],
    ...(options.category ? { category: options.category } : {}),
    ...(options.icon ? { icon: options.icon } : {}),
    kind: 'page',
    page,
  } as AnyContentBlueprint;
}

function docBlueprint(doc: DocDocument, options: RuntimeDefinitionOptions): AnyContentBlueprint {
  return {
    formatVersion: 1,
    name: options.name ?? doc.title,
    description: options.description ?? doc.description ?? '',
    tags: options.tags ?? ['doc'],
    ...(options.category ? { category: options.category } : {}),
    ...(options.icon ? { icon: options.icon } : {}),
    kind: 'doc',
    doc,
  } as AnyContentBlueprint;
}
