// @ts-check
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = '@protoyard/cli';

/**
 * @protoyard/cli exports only its API (and only the `import` condition when
 * packed), so its manifest is found from the resolved entry: walk up to the
 * package.json named @protoyard/cli, then read its `bin.protoyard`. That is
 * ./bin/protoyard.mjs in this repository and ./dist/bin.js when installed.
 *
 * @param {string} [entry]
 * @returns {string}
 */
export function resolveCliBin(entry) {
  let resolved = entry;
  if (!resolved) {
    try {
      resolved = fileURLToPath(import.meta.resolve(CLI));
    } catch {
      throw new Error(
        `${CLI} is not installed next to protoyard. Reinstall protoyard (npm install protoyard), or run npx protoyard.`
      );
    }
  }
  for (let dir = dirname(resolved); ; dir = dirname(dir)) {
    const manifestPath = join(dir, 'package.json');
    if (existsSync(manifestPath)) {
      /** @type {{ name?: unknown, bin?: unknown }} */
      let manifest = {};
      try {
        manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      } catch {
        // unreadable manifest: keep walking
      }
      if (manifest.name === CLI) {
        const bin =
          typeof manifest.bin === 'string'
            ? manifest.bin
            : manifest.bin && typeof manifest.bin === 'object'
              ? /** @type {Record<string, unknown>} */ (manifest.bin).protoyard
              : undefined;
        if (typeof bin !== 'string') throw new Error(`${manifestPath} declares no protoyard bin.`);
        const path = resolve(dir, bin);
        if (!path.startsWith(`${dir}/`) && !path.startsWith(`${dir}\\`)) {
          throw new Error(`${manifestPath} points its bin outside the package.`);
        }
        return path;
      }
    }
    if (dirname(dir) === dir) throw new Error(`No ${CLI} package.json above ${resolved}.`);
  }
}
