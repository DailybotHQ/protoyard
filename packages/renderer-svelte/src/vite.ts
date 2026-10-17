import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MANIFEST_FILENAME, type PrototypeManifest, parseManifest } from '@protoyard/core/manifest';
// Subpath imports keep the config graph erasable-only TS (Node strip-types can load it).
import { noFlashScript } from '@protoyard/themes/no-flash';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import {
  type ConfigEnv,
  defineConfig,
  mergeConfig,
  type Plugin,
  type UserConfig,
  type UserConfigFnObject,
} from 'vite';

/**
 * Vite config factory shared by every prototype and template:
 *
 *   // vite.config.ts
 *   import { defineProtoyardConfig } from '@protoyard/renderer-svelte/vite';
 *   export default defineProtoyardConfig({ root: import.meta.dirname });
 *
 * The CLI drives builds through environment variables so the config file
 * never needs editing: PROTOYARD_BASE, PROTOYARD_OUT_DIR,
 * PROTOYARD_INCLUDE_DEVTOOLS, PROTOYARD_DEMO_BADGE, PROTOYARD_PORT,
 * PROTOYARD_BUILT_AT.
 */

export interface ProtoyardConfigOptions extends UserConfig {
  /** The prototype folder (the one containing protoyard.json). */
  root: string;
}

/** Shape of the `__PROTOYARD_BUILD__` global. */
export interface ProtoyardBuildInfo {
  id: string;
  slug: string;
  version: string;
  namespace: string;
  builtAt: string;
  mode: 'dev' | 'build';
}

type Env = Record<string, string | undefined>;

export function readPrototypeManifest(root: string): PrototypeManifest {
  const file = resolve(root, MANIFEST_FILENAME);
  if (!existsSync(file)) {
    throw new Error(
      `[protoyard] ${MANIFEST_FILENAME} not found in ${root}. Every prototype needs one (see docs/PROTOTYPES.md).`
    );
  }
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`[protoyard] ${file} is not valid JSON: ${(error as Error).message}`);
  }
  return parseManifest(json);
}

/** `"1" | "true" | "yes"` → true, `"0" | "false" | "no"` → false, otherwise undefined. */
export function envFlag(value: string | undefined): boolean | undefined {
  if (value === undefined || value === '') return undefined;
  const v = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(v)) return true;
  if (['0', 'false', 'no', 'off'].includes(v)) return false;
  return undefined;
}

export interface ResolvedProtoyardSettings {
  base: string;
  outDir: string;
  includeDevtools: boolean;
  demoBadge: boolean;
  port: number | undefined;
  build: ProtoyardBuildInfo;
}

/** Pure resolution step (unit-tested): manifest + env + command → settings. */
export function resolveProtoyardSettings(
  manifest: PrototypeManifest,
  command: ConfigEnv['command'],
  env: Env,
  root: string
): ResolvedProtoyardSettings {
  const isBuild = command === 'build';
  const port = env.PROTOYARD_PORT ? Number.parseInt(env.PROTOYARD_PORT, 10) : undefined;
  return {
    base: env.PROTOYARD_BASE || manifest.build.base || './',
    outDir: env.PROTOYARD_OUT_DIR ? resolve(env.PROTOYARD_OUT_DIR) : resolve(root, 'dist'),
    includeDevtools: isBuild
      ? (envFlag(env.PROTOYARD_INCLUDE_DEVTOOLS) ?? manifest.build.includeDevtools)
      : true,
    demoBadge: isBuild ? (envFlag(env.PROTOYARD_DEMO_BADGE) ?? manifest.build.demoBadge) : false,
    port: port !== undefined && Number.isFinite(port) && port > 0 ? port : undefined,
    build: {
      id: manifest.id,
      slug: manifest.slug,
      version: manifest.version,
      namespace: manifest.storage.namespace,
      // Build metadata only — never used for seeded data.
      builtAt: env.PROTOYARD_BUILT_AT || new Date().toISOString(),
      mode: isBuild ? 'build' : 'dev',
    },
  };
}

/** Injects the no-flash appearance script and prototype metadata into index.html. */
function protoyardHtml(manifest: PrototypeManifest): Plugin {
  return {
    name: 'protoyard:html',
    transformIndexHtml: {
      order: 'pre',
      handler() {
        return [
          {
            tag: 'meta',
            attrs: { name: 'protoyard:prototype', content: manifest.id },
            injectTo: 'head',
          },
          {
            tag: 'script',
            children: noFlashScript(manifest.storage.namespace),
            injectTo: 'head-prepend',
          },
        ];
      },
    },
  };
}

export function defineProtoyardConfig(options: ProtoyardConfigOptions): UserConfigFnObject {
  const { root, ...overrides } = options;
  return defineConfig((configEnv) => {
    const manifest = readPrototypeManifest(root);
    const settings = resolveProtoyardSettings(manifest, configEnv.command, process.env, root);
    const base: UserConfig = {
      root,
      base: settings.base,
      plugins: [svelte(), tailwindcss(), protoyardHtml(manifest)],
      resolve: {
        // Workspace packages are linked; one copy of each runtime library.
        dedupe: ['svelte', 'dexie', 'bits-ui'],
      },
      define: {
        __PROTOYARD_DEVTOOLS__: JSON.stringify(settings.includeDevtools),
        __PROTOYARD_DEMO_BADGE__: JSON.stringify(settings.demoBadge),
        __PROTOYARD_BUILD__: JSON.stringify(settings.build),
      },
      server: {
        ...(settings.port ? { port: settings.port } : {}),
        strictPort: false,
      },
      preview: {
        ...(settings.port ? { port: settings.port } : {}),
        strictPort: false,
      },
      build: {
        outDir: settings.outDir,
        emptyOutDir: true,
        target: 'es2022',
        sourcemap: false,
        reportCompressedSize: false,
      },
    };
    return mergeConfig(base, overrides) as UserConfig;
  });
}
