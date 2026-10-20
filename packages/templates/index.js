// @ts-check
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** @typedef {import('./index.d.ts').TemplateEntry} TemplateEntry */

const here = dirname(fileURLToPath(import.meta.url));
const MANIFEST = 'protoyard.json';
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Packed, `prepack` copied the templates next to this file. Unpacked, this is
 * packages/templates inside the repository, whose templates/ is the source.
 */
export const TEMPLATES_ROOT = existsSync(join(here, 'templates'))
  ? join(here, 'templates')
  : resolve(here, '..', '..', 'templates');

/**
 * @param {string} [root]
 * @returns {TemplateEntry[]}
 */
export function listTemplates(root = TEMPLATES_ROOT) {
  /** @type {TemplateEntry[]} */
  const entries = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || !SLUG.test(entry.name)) continue;
    const dir = join(root, entry.name);
    const path = join(dir, MANIFEST);
    if (!existsSync(path)) continue;
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(path, 'utf8'));
    } catch (error) {
      throw new Error(
        `[protoyard] ${path} is not valid JSON: ${/** @type {Error} */ (error).message}`
      );
    }
    entries.push({ name: entry.name, dir, manifest });
  }
  return entries.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * @param {string} name
 * @param {string} [root]
 * @returns {string}
 */
export function templateDir(name, root = TEMPLATES_ROOT) {
  if (typeof name !== 'string' || !SLUG.test(name)) {
    throw new Error(
      `[protoyard] "${String(name)}" is not a template name (lowercase letters, digits and dashes).`
    );
  }
  const dir = join(root, name);
  if (!existsSync(join(dir, MANIFEST))) {
    throw new Error(`[protoyard] No template "${name}" in ${root}.`);
  }
  return dir;
}
