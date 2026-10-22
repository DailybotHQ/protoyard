import { definePrototypeFromPage } from '@protoyard/blueprint/kinds';
import { parseManifest } from '@protoyard/core';
import { PageDocumentSchema } from '@protoyard/pages';
import blueprintJson from '../blueprint.json';
import manifestJson from '../protoyard.json';

/**
 * Content-kind runtime for this page template (ADR-040).
 * `definePrototypeFromPage` → `defineKindRuntime` (personas, policy, stores).
 * Form responses use `@protoyard/pages` createFormServices (FormResponse row).
 */
const manifest = parseManifest(manifestJson);
const page = PageDocumentSchema.parse((blueprintJson as { page?: unknown }).page ?? blueprintJson);

export const pageDocument = page;

export const definition = definePrototypeFromPage(page, {
  namespace: manifest.storage.namespace,
  slug: manifest.slug,
  version: manifest.version,
  name: manifest.name,
  description: manifest.description,
  category: manifest.category,
  tags: manifest.tags,
  ...(manifest.icon ? { icon: manifest.icon } : {}),
});

// Template identity (defineKindRuntime defaults to kind: prototype).
definition.manifest.kind = 'template';
definition.manifest.blueprintKind = 'page';
if (manifest.catalog) definition.manifest.catalog = manifest.catalog;
definition.manifest.build = manifest.build;
definition.manifest.thumbnail = manifest.thumbnail;
definition.manifest.status = manifest.status;
