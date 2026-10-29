import type { PrototypeDefinition } from '@protoyard/core';
import type { DocDocument, PageDocument } from '@protoyard/pages';
import { defineKindRuntime } from './brand-runtime.ts';
import {
  type AnyContentBlueprint,
  KIND_DEFAULT_SCENARIO,
  KIND_GENERATOR_VERSION,
  type KindRuntimeOptions,
} from './runtime.ts';

/**
 * Options for building a page/doc runtime from a document body alone
 * (when the caller does not already have a full content blueprint).
 */
export interface PageDocRuntimeOptions {
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

/** Kind default scenario id (shared content-kind runtime). */
export const PAGES_DEFAULT_SCENARIO = KIND_DEFAULT_SCENARIO;
/** Kind generator version (shared content-kind runtime). */
export const PAGES_GENERATOR_VERSION = KIND_GENERATOR_VERSION;

/**
 * Builds the shared content-kind runtime for a page document body by wrapping
 * it as a `kind: "page"` blueprint and calling {@link defineKindRuntime}.
 * Lives in `@protoyard/blueprint/kinds` so `@protoyard/pages` stays free of a
 * blueprint dependency (no package cycle).
 */
export function definePrototypeFromPage(
  page: PageDocument,
  options: PageDocRuntimeOptions
): PrototypeDefinition {
  return defineKindRuntime(pageBlueprint(page, options), toKindOptions(options));
}

/**
 * Builds the shared content-kind runtime for a doc document body.
 */
export function definePrototypeFromDoc(
  doc: DocDocument,
  options: PageDocRuntimeOptions
): PrototypeDefinition {
  return defineKindRuntime(docBlueprint(doc, options), toKindOptions(options));
}

function toKindOptions(options: PageDocRuntimeOptions): KindRuntimeOptions {
  return {
    namespace: options.namespace,
    slug: options.slug,
    version: options.version,
  };
}

function pageBlueprint(page: PageDocument, options: PageDocRuntimeOptions): AnyContentBlueprint {
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

function docBlueprint(doc: DocDocument, options: PageDocRuntimeOptions): AnyContentBlueprint {
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
