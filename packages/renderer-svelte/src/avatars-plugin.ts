import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import { type AvatarImageSize, isAvatarId } from './avatars.ts';

/**
 * Build side of the avatar library: emits `@protoyard/avatars` images into
 * every build as `avatars/<size>/<id>.webp` (fixed names, no content hash, so
 * rebuilds never churn) and serves the same paths from the dev server.
 *
 * The images are static files, never imported by JavaScript: they add 0 KB
 * to initial JS and load only when an `<img>` asks for them.
 */

/** Sizes the library ships (`AVATAR_SIZES` in @protoyard/avatars). */
export const AVATAR_IMAGE_SIZES: readonly AvatarImageSize[] = [64, 128];

/** Output folder inside a build (and the shared folder at a showcase root). */
export const AVATAR_DIR = 'avatars';

const AVATARS_PACKAGE = '@protoyard/avatars';

/**
 * The library's `assets/` folder, found by Node package resolution from the
 * renderer, so it works in this monorepo, from a packed `dist/`, and from a
 * consumer's `node_modules` (flat or pnpm symlinks). Only the path is
 * resolved: the manifest is never loaded, so nothing reaches a bundle.
 * `from` is the module location to resolve from (tests point it at fixtures).
 */
export function avatarAssetsDir(from: string = import.meta.url): string {
  const require = createRequire(from);
  const root = avatarsPackageRoot(require);
  if (!root) {
    throw new Error(
      `[protoyard] ${AVATARS_PACKAGE} is not resolvable from ${from.startsWith('file:') ? fileURLToPath(from) : from}. Install it next to @protoyard/renderer-svelte, or turn avatars off with defineProtoyardConfig({ avatars: false }) or PROTOYARD_AVATARS=0.`
    );
  }
  return join(root, 'assets');
}

/** The avatars package folder, or null when it cannot be resolved. */
function avatarsPackageRoot(require: NodeJS.Require): string | null {
  try {
    return dirname(require.resolve(`${AVATARS_PACKAGE}/package.json`));
  } catch {
    // `./package.json` is not in the exports map: walk up from the entry.
  }
  let entry: string;
  try {
    entry = require.resolve(AVATARS_PACKAGE);
  } catch {
    return null;
  }
  for (let dir = dirname(entry); ; dir = dirname(dir)) {
    const manifest = join(dir, 'package.json');
    if (existsSync(manifest)) {
      try {
        if (
          (JSON.parse(readFileSync(manifest, 'utf8')) as { name?: unknown }).name ===
          AVATARS_PACKAGE
        ) {
          return dir;
        }
      } catch {
        // unreadable manifest: keep walking
      }
    }
    if (dirname(dir) === dir) return null;
  }
}

export interface AvatarFile {
  /** Path inside a build, e.g. `avatars/64/av-001.webp`. */
  fileName: string;
  /** Absolute source path. */
  source: string;
}

/**
 * Every library image for `sizes`, sorted by size then id. Only files named
 * like a library id are listed, so stray files never ship.
 */
export function listAvatarFiles(
  sizes: readonly AvatarImageSize[],
  assetsDir = avatarAssetsDir()
): AvatarFile[] {
  const files: AvatarFile[] = [];
  for (const size of [...sizes].sort((a, b) => a - b)) {
    const dir = join(assetsDir, String(size));
    if (!existsSync(dir)) {
      throw new Error(
        `[protoyard] avatar images not found at ${dir}. They come from @protoyard/avatars; turn avatars off with defineProtoyardConfig({ avatars: false }) or PROTOYARD_AVATARS=0.`
      );
    }
    const names = readdirSync(dir)
      .filter((name) => name.endsWith('.webp') && isAvatarId(name.slice(0, -5)))
      .sort();
    for (const name of names) {
      files.push({ fileName: `${AVATAR_DIR}/${size}/${name}`, source: join(dir, name) });
    }
  }
  return files;
}

export interface ProtoyardAvatarsOptions {
  /** Sizes to emit and serve; `[]` turns the plugin off. */
  sizes: readonly AvatarImageSize[];
  /**
   * Emit the images into the build. False when the build points at a shared
   * copy elsewhere (PROTOYARD_AVATAR_BASE, the showcase).
   */
  emit: boolean;
  /** Override the library folder (tests). */
  assetsDir?: string;
}

const DEV_PATH = /^avatars\/(\d+)\/(av-\d{3})\.webp$/;

export function protoyardAvatars(options: ProtoyardAvatarsOptions): Plugin {
  const sizes = options.sizes;
  // Resolved on first use: a config that never builds or serves never looks.
  let assetsDir = options.assetsDir;
  const assets = () => {
    assetsDir ??= avatarAssetsDir();
    return assetsDir;
  };
  return {
    name: 'protoyard:avatars',
    configureServer(server) {
      if (sizes.length === 0) return;
      server.middlewares.use((req, res, next) => {
        const base = server.config.base || '/';
        const url = (req.url ?? '').split(/[?#]/)[0] ?? '';
        if (!url.startsWith(base)) return next();
        const match = DEV_PATH.exec(url.slice(base.length));
        const size = Number(match?.[1]) as AvatarImageSize;
        const id = match?.[2];
        if (!match || !id || !sizes.includes(size) || !isAvatarId(id)) return next();
        const file = join(assets(), String(size), `${id}.webp`);
        if (!existsSync(file)) return next();
        res.setHeader('Content-Type', 'image/webp');
        res.setHeader('Cache-Control', 'no-cache');
        res.end(readFileSync(file));
      });
    },
    generateBundle() {
      if (!options.emit || sizes.length === 0) return;
      for (const file of listAvatarFiles(sizes, assets())) {
        this.emitFile({
          type: 'asset',
          fileName: file.fileName,
          source: readFileSync(file.source),
        });
      }
    },
  };
}
