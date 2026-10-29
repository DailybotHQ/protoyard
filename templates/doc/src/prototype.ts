import { definePrototypeFromDoc } from '@protoyard/blueprint/kinds';
import { parseManifest } from '@protoyard/core';
import { DocDocumentSchema } from '@protoyard/pages';
import blueprintJson from '../blueprint.json';
import manifestJson from '../protoyard.json';

/**
 * Content-kind runtime for this doc template (ADR-040).
 * `definePrototypeFromDoc` → `defineKindPrototype` (no brand, so no palette
 * generator in the first chunk).
 */
const manifest = parseManifest(manifestJson);
const doc = DocDocumentSchema.parse((blueprintJson as { doc?: unknown }).doc ?? blueprintJson);

export const docDocument = doc;

export const definition = definePrototypeFromDoc(doc, {
  namespace: manifest.storage.namespace,
  slug: manifest.slug,
  version: manifest.version,
  name: manifest.name,
  description: manifest.description,
  category: manifest.category,
  tags: manifest.tags,
  ...(manifest.icon ? { icon: manifest.icon } : {}),
});

definition.manifest.kind = 'template';
definition.manifest.blueprintKind = 'doc';
if (manifest.catalog) definition.manifest.catalog = manifest.catalog;
definition.manifest.build = manifest.build;
definition.manifest.thumbnail = manifest.thumbnail;
definition.manifest.status = manifest.status;
