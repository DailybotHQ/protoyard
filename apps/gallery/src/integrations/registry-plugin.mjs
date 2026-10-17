// @ts-check
import { existsSync, readFileSync } from 'node:fs';

const VIRTUAL_ID = 'virtual:protoyard-registry';
const RESOLVED_ID = `\0${VIRTUAL_ID}`;

/**
 * Exposes the registry JSON as `virtual:protoyard-registry` ({ registry, source }).
 * A missing or malformed file yields `registry: null` so the gallery can show
 * its first-run state instead of failing the build. In dev, re-running
 * `pnpm protoyard index` triggers a reload because the file is watched.
 *
 * @param {{ registryPath: string }} options
 * @returns {import('vite').Plugin}
 */
export function protoyardRegistry(options) {
  const { registryPath } = options;
  return {
    name: 'protoyard-registry',
    resolveId(id) {
      return id === VIRTUAL_ID ? RESOLVED_ID : undefined;
    },
    load(id) {
      if (id !== RESOLVED_ID) return undefined;
      this.addWatchFile(registryPath);
      let registry = null;
      let error = null;
      if (existsSync(registryPath)) {
        try {
          const parsed = JSON.parse(readFileSync(registryPath, 'utf8'));
          if (parsed && parsed.format === 'protoyard.registry' && Array.isArray(parsed.entries)) {
            registry = parsed;
          } else {
            error = 'The registry file has an unexpected format.';
          }
        } catch (e) {
          error = `The registry file is not valid JSON (${/** @type {Error} */ (e).message}).`;
        }
      }
      return `export const registry = ${JSON.stringify(registry)};\nexport const registryError = ${JSON.stringify(error)};\n`;
    },
    configureServer(server) {
      server.watcher.add(registryPath);
      server.watcher.on('change', (file) => {
        if (file !== registryPath) return;
        const mod = server.moduleGraph.getModuleById(RESOLVED_ID);
        if (mod) server.moduleGraph.invalidateModule(mod);
        server.ws.send({ type: 'full-reload' });
      });
    },
  };
}
