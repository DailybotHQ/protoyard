import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  MANIFEST_FILENAME,
  NamespaceSchema,
  type PrototypeManifest,
  parseManifest,
} from '@protoyard/core/manifest';
// Subpath imports keep the config graph erasable-only TS (Node strip-types can load it).
import { protoyardOffline } from '@protoyard/offline';
import { noFlashScript } from '@protoyard/themes/no-flash';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import {
  type ConfigEnv,
  defineConfig,
  mergeConfig,
  type Plugin,
  searchForWorkspaceRoot,
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
  /** True when the build ships the offline service worker. */
  offline: boolean;
}

type Env = Record<string, string | undefined>;

/**
 * Where builds write Vite's chunk manifest, relative to the output folder.
 * The CLI reads it to tell initial from lazy chunks (bundle budgets), then
 * deletes it so it never ships. A dot-folder, so the offline precache skips it
 * even in a plain `vite build`.
 */
export const VITE_MANIFEST_PATH = '.vite/manifest.json';

export function readPrototypeManifest(root: string): PrototypeManifest {
  const file = resolve(root, MANIFEST_FILENAME);
  if (!existsSync(file)) {
    throw new Error(
      `[protoyard] ${MANIFEST_FILENAME} not found in ${root}. Every prototype needs one (see docs/ARCHITECTURE.md#the-prototype-contract).`
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

/**
 * What the dev server may serve through `/@fs`: this prototype, the shared
 * workspace packages and installed dependencies — never the rest of the
 * workspace (other prototypes, artifacts, dotfiles). Vite's default
 * `fs.deny` (.env, *.pem, *.crt…) still applies on top.
 */
export function devFsAllow(root: string): string[] {
  const workspace = searchForWorkspaceRoot(root);
  return [resolve(root), resolve(workspace, 'packages'), resolve(workspace, 'node_modules')];
}

export interface ResolvedProtoyardSettings {
  base: string;
  outDir: string;
  includeDevtools: boolean;
  demoBadge: boolean;
  /** Opt-in offline service worker (builds only; never in dev). */
  offline: boolean;
  port: number | undefined;
  build: ProtoyardBuildInfo;
}

/**
 * PROTOYARD_STORAGE_NAMESPACE overrides the manifest namespace (template live
 * demos). It names IndexedDB databases and is embedded in the inline no-flash
 * script, so it must pass the same check as a manifest namespace.
 */
function storageNamespace(manifest: PrototypeManifest, env: Env): string {
  const override = env.PROTOYARD_STORAGE_NAMESPACE?.trim();
  if (!override) return manifest.storage.namespace;
  const parsed = NamespaceSchema.safeParse(override);
  if (!parsed.success) {
    throw new Error(
      `PROTOYARD_STORAGE_NAMESPACE must be lowercase kebab-case, 2-64 characters (got ${JSON.stringify(override.slice(0, 80))})`
    );
  }
  return parsed.data;
}

/** Pure resolution step (unit-tested): manifest + env + command → settings. */
export function resolveProtoyardSettings(
  manifest: PrototypeManifest,
  command: ConfigEnv['command'],
  env: Env,
  root: string
): ResolvedProtoyardSettings {
  const isBuild = command === 'build';
  const offline = isBuild ? (envFlag(env.PROTOYARD_OFFLINE) ?? manifest.build.offline) : false;
  const port = env.PROTOYARD_PORT ? Number.parseInt(env.PROTOYARD_PORT, 10) : undefined;
  return {
    base: env.PROTOYARD_BASE || manifest.build.base || './',
    outDir: env.PROTOYARD_OUT_DIR ? resolve(env.PROTOYARD_OUT_DIR) : resolve(root, 'dist'),
    includeDevtools: isBuild
      ? (envFlag(env.PROTOYARD_INCLUDE_DEVTOOLS) ?? manifest.build.includeDevtools)
      : true,
    demoBadge: isBuild ? (envFlag(env.PROTOYARD_DEMO_BADGE) ?? manifest.build.demoBadge) : false,
    offline,
    port: port !== undefined && Number.isFinite(port) && port > 0 ? port : undefined,
    build: {
      id: manifest.id,
      slug: manifest.slug,
      version: manifest.version,
      // PROTOYARD_STORAGE_NAMESPACE isolates template live demos (template-demo-<name>).
      namespace: storageNamespace(manifest, env),
      // Build metadata only — never used for seeded data.
      builtAt: env.PROTOYARD_BUILT_AT || new Date().toISOString(),
      mode: isBuild ? 'build' : 'dev',
      offline,
    },
  };
}

/** Injects the no-flash appearance script and prototype metadata into index.html. */
function protoyardHtml(manifest: PrototypeManifest, namespace: string): Plugin {
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
            children: noFlashScript(namespace),
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
      plugins: [
        svelte(),
        tailwindcss(),
        protoyardHtml(manifest, settings.build.namespace),
        // Structurally typed Vite plugin (the offline package has no vite dependency).
        ...(settings.offline ? (protoyardOffline({ enabled: true }) as unknown as Plugin[]) : []),
      ],
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
        // `--host` exposes /@fs to the LAN: keep it to what this prototype needs.
        fs: { allow: devFsAllow(root) },
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
        manifest: VITE_MANIFEST_PATH,
      },
    };
    return mergeConfig(base, overrides) as UserConfig;
  });
}
