import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
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

/**
 * The library's `assets/` folder. The avatars package is a workspace sibling
 * of the renderer, so it resolves without a package dependency (and without
 * pulling its manifest into any bundle).
 */
export function avatarAssetsDir(): string {
  // `import.meta.dirname` is set by Node and Vite's config loader; the URL
  // form covers loaders that only provide a file: `import.meta.url`.
  const here = import.meta.dirname ?? dirname(fileURLToPath(import.meta.url));
  return resolve(here, '../../avatars/assets');
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
        `[protoyard] avatar images not found at ${dir}. They come from packages/avatars; turn avatars off with defineProtoyardConfig({ avatars: false }) or PROTOYARD_AVATARS=0.`
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
