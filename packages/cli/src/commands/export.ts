import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  artifactDir,
  BUILD_MANIFEST_FILENAME,
  type BuildManifest,
  buildPrototype,
  scanForForeignCode,
  verifyDist,
} from '../lib/build.ts';
import { digestDirectory } from '../lib/checksum.ts';
import type { CommandResult, Handler } from '../lib/command.ts';
import { flag } from '../lib/command.ts';
import { CliError, formatBytes, mark } from '../lib/output.ts';
import { toPosixRelative } from '../lib/paths.ts';
import { resolveTarget } from '../lib/workspace.ts';
import { zipDirectory } from '../lib/zip.ts';
import { buildOptionsFrom } from './build.ts';

/** Confirms an existing dist still matches its build manifest byte for byte. */
async function verifyExistingBuild(outDir: string, manifestPath: string) {
  if (!existsSync(outDir) || !existsSync(manifestPath)) {
    throw new CliError('not_found', 'No previous build to export.', {
      hint: 'Drop --skip-build, or run `pnpm protoyard build <slug>` first.',
    });
  }
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as BuildManifest;
  const current = await digestDirectory(outDir);
  const expected = new Map(manifest.files.map((f) => [f.path, f.sha256]));
  const changed =
    current.length !== manifest.files.length ||
    current.some((f) => expected.get(f.path) !== f.sha256);
  if (changed) {
    throw new CliError('validation', 'dist/ no longer matches build-manifest.json.', {
      hint: 'Rebuild without --skip-build so the archive and its manifest agree.',
    });
  }
  return manifest;
}

export const exportCommand: Handler = async (ctx, args, options): Promise<CommandResult> => {
  const { entry, dir, registry } = await resolveTarget(ctx, args[0]);
  const artifacts = artifactDir(ctx, entry.slug);
  const outDir = join(artifacts, 'dist');
  const manifestPath = join(artifacts, BUILD_MANIFEST_FILENAME);

  let manifest: BuildManifest;
  if (flag(options, 'skipBuild')) {
    manifest = await verifyExistingBuild(outDir, manifestPath);
    const problems = await verifyDist(outDir, manifest.base);
    if (problems.length > 0) throw new CliError('validation', problems.join(' '));
  } else {
    const { out: _ignored, ...buildOptions } = buildOptionsFrom(options);
    ctx.out.info(`Building ${ctx.out.c.bold(entry.slug)}…`);
    manifest = (await buildPrototype(ctx, entry, dir, buildOptions)).manifest;
  }

  const foreign = await scanForForeignCode(outDir, entry, registry.entries);
  if (foreign.length > 0) {
    throw new CliError(
      'validation',
      `The ${entry.slug} bundle contains code from other prototypes.`,
      {
        hint: foreign.map((f) => `${f.file} references ${f.slug} (${f.id})`).join('; '),
        data: { foreign },
      }
    );
  }

  const zipPath = join(artifacts, `${entry.slug}.zip`);
  const zip = await zipDirectory(outDir, zipPath);
  return {
    data: {
      slug: entry.slug,
      zip: toPosixRelative(ctx.root, zip.path),
      size: zip.size,
      sha256: zip.sha256,
      files: zip.files,
      base: manifest.base,
      includeDevtools: manifest.includeDevtools,
      buildManifest: toPosixRelative(ctx.root, manifestPath),
      isolation: { checkedAgainst: registry.entries.length - 1, foreign: [] },
    },
    render(out) {
      const { c } = out;
      out.always(`${mark(c, 'pass')} Exported ${c.bold(entry.slug)}`);
      out.always(
        `  ${c.cyan(toPosixRelative(ctx.root, zip.path))}  ${formatBytes(zip.size)}  (${zip.files} files)`
      );
      out.always(`  sha256 ${zip.sha256}`);
      out.info(
        c.dim(
          `  Isolation: no references to the other ${registry.entries.length - 1} registered projects.`
        )
      );
      out.info(
        c.dim(
          manifest.base === './'
            ? '  Relocatable (base ./): unzip into any folder of any static host.'
            : `  Built for base ${manifest.base}: serve it from that path.`
        )
      );
    },
  };
};
