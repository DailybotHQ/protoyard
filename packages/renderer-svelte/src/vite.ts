import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  MANIFEST_FILENAME,
  NamespaceSchema,
  type PrototypeManifest,
  parseManifest,
  ReviewBuildSchema,
  resolveReviewBuild,
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
import type { AvatarImageSize } from './avatars.ts';
import { AVATAR_DIR, AVATAR_IMAGE_SIZES, protoyardAvatars } from './avatars-plugin.ts';

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
 * PROTOYARD_BUILT_AT, PROTOYARD_TARGET, and for avatar images
 * PROTOYARD_AVATARS, PROTOYARD_AVATAR_BASE and PROTOYARD_AVATAR_SIZES.
 */

export interface ProtoyardConfigOptions extends UserConfig {
  /** The prototype folder (the one containing protoyard.json). */
  root: string;
  /**
   * Ship the avatar library images (default true: people appear everywhere).
   * False keeps them out of the build and makes `avatarUrl` return undefined
   * for avatar ids, so the UI falls back to initials.
   */
  avatars?: boolean;
}

/**
 * Build targets with their own output shape. `artifact` is the Claude
 * artifact export (`protoyard export <slug> --target artifact`): an artifact
 * version holds at most 511 files, and a regular build splits every lazy
 * screen and kit into its own chunk, so the artifact build emits one script
 * and one stylesheet instead (images, fonts and avatars stay files).
 */
export const PROTOYARD_TARGETS = ['artifact'] as const;
export type ProtoyardTarget = (typeof PROTOYARD_TARGETS)[number];

/**
 * PROTOYARD_TARGET: empty or unset is a regular build; anything other than a
 * known target fails, so a typo never silently ships the wrong shape.
 */
export function buildTarget(env: Env): ProtoyardTarget | null {
  const raw = env.PROTOYARD_TARGET?.trim();
  if (!raw) return null;
  if ((PROTOYARD_TARGETS as readonly string[]).includes(raw)) return raw as ProtoyardTarget;
  throw new Error(
    `PROTOYARD_TARGET must be empty or one of ${PROTOYARD_TARGETS.join(', ')} (got ${JSON.stringify(raw.slice(0, 40))})`
  );
}

/**
 * The Vite build options a target adds. For `artifact`: one chunk group that
 * takes every module, so the build emits a single script (dynamic imports
 * resolve inside it), plus one stylesheet. A group, unlike `codeSplitting:
 * false`, keeps Rolldown's tree-shaking of dynamic-import namespaces: with
 * `false`, `import('@faker-js/faker').then((m) => m.Faker)` keeps every
 * locale and the relay-chat-demo script grows from 1.27 MB to 3.24 MB raw.
 * A regular build gets nothing, so its lazy chunks are unchanged.
 */
export function targetBuildOptions(
  target: ProtoyardTarget | null
): NonNullable<UserConfig['build']> {
  if (target !== 'artifact') return {};
  return {
    cssCodeSplit: false,
    rolldownOptions: {
      output: { codeSplitting: { groups: [{ name: 'app', test: /./ }] } },
    },
  };
}

/**
 * A CSS module that comes from Texuli (`texuli` or any `@texuli/*` package),
 * whether linked from a workspace (`…/texuli/packages/<pkg>/…`) or installed
 * (`node_modules/texuli/…`, `node_modules/@texuli/<pkg>/…`): a stylesheet, or
 * a component's scoped `<style>` (`X.svelte?svelte&type=style&lang.css`).
 */
export const TEXULI_CSS_MODULE =
  /[\\/](?:texuli[\\/]packages[\\/][^\\/]+|node_modules[\\/](?:texuli|@texuli[\\/][^\\/]+))[\\/][^?]*\.(?:css(?:$|\?)|svelte\?svelte&type=style)/;

/**
 * One chunk group for every Texuli CSS module, so a regular build emits
 * Texuli's component CSS as ONE stylesheet instead of one per lazy chunk.
 * Separate files cannot share a gzip dictionary: the same CSS measured
 * 11,349 B gzip as 10 files and 6,386 B as one. Only CSS modules match, so
 * JavaScript splitting is unchanged (the group's script is an empty shell).
 * The stylesheet loads with the first chunk that uses Texuli, after the
 * cascade-layer order declaration the page head carries.
 */
export const TEXULI_CSS_GROUP = { name: 'texuli-css', test: TEXULI_CSS_MODULE } as const;

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
  /**
   * Keep an explicit shell frame when embedded in an iframe (ADR-026):
   * `PROTOYARD_FRAME_WHEN_EMBEDDED`, else the manifest's `build.frameWhenEmbedded`.
   * The CLI's Claude artifact target sets it.
   */
  frameWhenEmbedded: boolean;
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
 * The real folders of the `link:` dependencies the workspace root declares
 * (Texuli is consumed from `../texuli/packages/*`). They live outside the
 * workspace, so each one, and nothing around it, joins the dev server's
 * allow list. Links that do not resolve, and a missing or unreadable
 * manifest, add nothing.
 */
export function linkedPackageRoots(workspace: string): string[] {
  let manifest: Record<string, unknown>;
  try {
    manifest = JSON.parse(readFileSync(resolve(workspace, 'package.json'), 'utf8'));
  } catch {
    return [];
  }
  const roots = new Set<string>();
  for (const field of ['dependencies', 'devDependencies']) {
    const deps = manifest[field];
    if (!deps || typeof deps !== 'object') continue;
    for (const spec of Object.values(deps as Record<string, unknown>)) {
      if (typeof spec !== 'string' || !spec.startsWith('link:')) continue;
      const target = resolve(workspace, spec.slice('link:'.length));
      if (!existsSync(target)) continue;
      roots.add(realpathSync(target));
    }
  }
  return [...roots].sort();
}

/**
 * What the dev server may serve through `/@fs`: this prototype, the shared
 * workspace packages, installed dependencies and the folders of the root's
 * `link:` dependencies — never the rest of the workspace (other prototypes,
 * artifacts, dotfiles). Vite's default `fs.deny` (.env, *.pem, *.crt…) still
 * applies on top.
 */
export function devFsAllow(root: string): string[] {
  const workspace = searchForWorkspaceRoot(root);
  return [
    resolve(root),
    resolve(workspace, 'packages'),
    resolve(workspace, 'node_modules'),
    ...linkedPackageRoots(workspace),
  ];
}

/** Where avatar images come from in this build (see src/avatars.ts). */
export interface AvatarSettings {
  /** Folder the app requests `<size>/<id>.webp` from, ending in `/`. */
  base: string;
  /** Sizes shipped and served; empty when avatars are off. */
  sizes: AvatarImageSize[];
  /** Emit the images into this build (false when a shared base serves them). */
  emit: boolean;
}

const AVATAR_BASE_PATTERN = /^(?:\.\/|\.\.\/|\/(?!\/)|https:\/\/)[A-Za-z0-9._~\-/:%@]*$/;

/**
 * Avatar settings from the env and the factory option. PROTOYARD_AVATAR_BASE
 * (the showcase's shared `/avatars/` folder) means another copy serves the
 * images, so this build emits none. PROTOYARD_AVATAR_SIZES narrows the sizes
 * (the artifact target ships `128` only).
 */
export function resolveAvatarSettings(
  base: string,
  env: Env,
  options: { avatars?: boolean } = {}
): AvatarSettings {
  const enabled = envFlag(env.PROTOYARD_AVATARS) ?? options.avatars ?? true;
  let sizes: AvatarImageSize[] = [...AVATAR_IMAGE_SIZES];
  const rawSizes = env.PROTOYARD_AVATAR_SIZES?.trim();
  if (rawSizes) {
    const parsed = rawSizes.split(',').map((part) => Number(part.trim()));
    const valid = parsed.filter((n): n is AvatarImageSize =>
      (AVATAR_IMAGE_SIZES as readonly number[]).includes(n)
    );
    if (valid.length !== parsed.length) {
      throw new Error(
        `PROTOYARD_AVATAR_SIZES must list ${AVATAR_IMAGE_SIZES.join(' and/or ')} (got ${JSON.stringify(rawSizes.slice(0, 40))})`
      );
    }
    sizes = [...new Set(valid)].sort((a, b) => a - b);
  }
  const shared = env.PROTOYARD_AVATAR_BASE?.trim();
  if (shared && !AVATAR_BASE_PATTERN.test(shared)) {
    throw new Error(
      `PROTOYARD_AVATAR_BASE must be a path such as /avatars/ or ./avatars/, or an https URL (got ${JSON.stringify(shared.slice(0, 80))})`
    );
  }
  const folder = shared || `${base.endsWith('/') ? base : `${base}/`}${AVATAR_DIR}/`;
  return {
    base: folder.endsWith('/') ? folder : `${folder}/`,
    sizes: enabled ? sizes : [],
    emit: enabled && !shared,
  };
}

export interface ResolvedProtoyardSettings {
  base: string;
  outDir: string;
  includeDevtools: boolean;
  demoBadge: boolean;
  reviewEnabled: boolean;
  /**
   * PROTOYARD_REVIEW_ADAPTER (+ PROTOYARD_REVIEW_ENDPOINT): the comments
   * backend for this build instead of the manifest's, e.g. a local test
   * server. `null` keeps `build.review` from the manifest.
   */
  reviewAdapter: { adapter: string; endpoint?: string } | null;
  /** Opt-in offline service worker (builds only; never in dev). */
  offline: boolean;
  port: number | undefined;
  avatars: AvatarSettings;
  /** PROTOYARD_TARGET for builds; always null in dev. */
  target: ProtoyardTarget | null;
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

/**
 * PROTOYARD_REVIEW_ADAPTER=local|http|cloudflare|artifact and
 * PROTOYARD_REVIEW_ENDPOINT, checked by the manifest's own `build.review`
 * schema (so `http` needs an endpoint, and endpoints carry no credentials).
 */
function reviewAdapterOverride(env: Env): { adapter: string; endpoint?: string } | null {
  const adapter = env.PROTOYARD_REVIEW_ADAPTER?.trim();
  const endpoint = env.PROTOYARD_REVIEW_ENDPOINT?.trim() || undefined;
  if (!adapter) {
    if (endpoint) throw new Error('PROTOYARD_REVIEW_ENDPOINT needs PROTOYARD_REVIEW_ADAPTER');
    return null;
  }
  const parsed = ReviewBuildSchema.safeParse({
    enabled: true,
    adapter,
    ...(endpoint ? { endpoint } : {}),
  });
  if (!parsed.success) {
    throw new Error(
      `PROTOYARD_REVIEW_ADAPTER / PROTOYARD_REVIEW_ENDPOINT are invalid: ${parsed.error.issues.map((i) => i.message).join('; ')}`
    );
  }
  const { adapter: kind, endpoint: url } = resolveReviewBuild(parsed.data);
  return { adapter: kind, ...(url ? { endpoint: url } : {}) };
}

/** Pure resolution step (unit-tested): manifest + env + command → settings. */
export function resolveProtoyardSettings(
  manifest: PrototypeManifest,
  command: ConfigEnv['command'],
  env: Env,
  root: string,
  options: { avatars?: boolean } = {}
): ResolvedProtoyardSettings {
  const isBuild = command === 'build';
  const base = env.PROTOYARD_BASE || manifest.build.base || './';
  const offline = isBuild ? (envFlag(env.PROTOYARD_OFFLINE) ?? manifest.build.offline) : false;
  const configuredReview = resolveReviewBuild(manifest.build.review);
  const review = {
    enabled: envFlag(env.PROTOYARD_REVIEW) ?? configuredReview.enabled,
    adapter: configuredReview.adapter,
  };
  const port = env.PROTOYARD_PORT ? Number.parseInt(env.PROTOYARD_PORT, 10) : undefined;
  return {
    base,
    outDir: env.PROTOYARD_OUT_DIR ? resolve(env.PROTOYARD_OUT_DIR) : resolve(root, 'dist'),
    includeDevtools: isBuild
      ? (envFlag(env.PROTOYARD_INCLUDE_DEVTOOLS) ?? manifest.build.includeDevtools)
      : true,
    demoBadge: isBuild ? (envFlag(env.PROTOYARD_DEMO_BADGE) ?? manifest.build.demoBadge) : false,
    offline,
    port: port !== undefined && Number.isFinite(port) && port > 0 ? port : undefined,
    avatars: resolveAvatarSettings(base, env, options),
    reviewEnabled: review.enabled,
    reviewAdapter: reviewAdapterOverride(env),
    target: isBuild ? buildTarget(env) : null,
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
      frameWhenEmbedded: isBuild
        ? (envFlag(env.PROTOYARD_FRAME_WHEN_EMBEDDED) ?? manifest.build.frameWhenEmbedded)
        : manifest.build.frameWhenEmbedded,
    },
  };
}

/**
 * The cascade layer order, declared before any stylesheet: Texuli's component
 * layers sit above Tailwind's base (its reset) and below Tailwind's
 * utilities, so a component keeps its own styles and a utility class on it
 * still wins. Layer order is fixed by first appearance, so this must come
 * first in the document.
 */
export const CASCADE_LAYER_ORDER =
  '@layer theme, base, tx.base, tx.components, components, utilities;';

/** Injects the layer order, the no-flash appearance script and prototype metadata into index.html. */
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
          { tag: 'style', children: CASCADE_LAYER_ORDER, injectTo: 'head-prepend' },
        ];
      },
    },
  };
}

export function defineProtoyardConfig(options: ProtoyardConfigOptions): UserConfigFnObject {
  const { root, avatars, ...overrides } = options;
  return defineConfig((configEnv) => {
    const manifest = readPrototypeManifest(root);
    const settings = resolveProtoyardSettings(manifest, configEnv.command, process.env, root, {
      ...(avatars !== undefined ? { avatars } : {}),
    });
    const base: UserConfig = {
      root,
      base: settings.base,
      plugins: [
        svelte(),
        tailwindcss(),
        protoyardHtml(manifest, settings.build.namespace),
        protoyardAvatars({ sizes: settings.avatars.sizes, emit: settings.avatars.emit }),
        // Structurally typed Vite plugin (the offline package has no vite dependency).
        ...(settings.offline ? (protoyardOffline({ enabled: true }) as unknown as Plugin[]) : []),
      ],
      resolve: {
        // Workspace packages are linked; one copy of each runtime library.
        dedupe: ['svelte', 'dexie'],
      },
      define: {
        __PROTOYARD_DEVTOOLS__: JSON.stringify(settings.includeDevtools),
        __PROTOYARD_DEMO_BADGE__: JSON.stringify(settings.demoBadge),
        __PROTOYARD_REVIEW__: JSON.stringify(settings.reviewEnabled),
        __PROTOYARD_REVIEW_ADAPTER__: JSON.stringify(settings.reviewAdapter),
        __PROTOYARD_BUILD__: JSON.stringify(settings.build),
        __PROTOYARD_AVATARS__: JSON.stringify({
          base: settings.avatars.base,
          sizes: settings.avatars.sizes,
        }),
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
        // The artifact target already emits one stylesheet (cssCodeSplit: false).
        ...(settings.target === 'artifact'
          ? {}
          : { rolldownOptions: { output: { codeSplitting: { groups: [TEXULI_CSS_GROUP] } } } }),
        ...targetBuildOptions(settings.target),
      },
    };
    return mergeConfig(base, overrides) as UserConfig;
  });
}
