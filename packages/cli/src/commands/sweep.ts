import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { artifactDir, BUILD_MANIFEST_FILENAME } from '../lib/build.ts';
import {
  type CaptureOptions,
  launchChromium,
  screenshot,
  withReadyPage,
} from '../lib/capture/index.ts';
import type { CommandResult, Handler } from '../lib/command.ts';
import { opt } from '../lib/command.ts';
import { CliError } from '../lib/output.ts';
import { serveStatic } from '../lib/static-server.ts';
import { resolveTarget } from '../lib/workspace.ts';
import { workspaceFile } from '../lib/workspace-file.ts';

/** The four default shots: light and dark, desktop and phone. */
export const SWEEP_SHOTS: readonly {
  id: string;
  options: CaptureOptions;
}[] = [
  {
    id: 'desktop-light',
    options: { viewport: { width: 1280, height: 800 }, colorScheme: 'light' },
  },
  { id: 'desktop-dark', options: { viewport: { width: 1280, height: 800 }, colorScheme: 'dark' } },
  {
    id: 'phone-light',
    options: { viewport: { width: 390, height: 844 }, colorScheme: 'light', mobile: true },
  },
  {
    id: 'phone-dark',
    options: { viewport: { width: 390, height: 844 }, colorScheme: 'dark', mobile: true },
  },
];

/**
 * `protoyard sweep <slug>`: a visual sweep any workspace can run. It serves
 * the prototype's static build on loopback and captures light and dark,
 * desktop and phone PNGs with the same deterministic capture as thumbnails
 * and `quick` screenshots (only the build's own origin may be fetched).
 * Needs a build (`protoyard build <slug>`) and Playwright's Chromium.
 */
export const sweepCommand: Handler = async (ctx, args, options): Promise<CommandResult> => {
  const { entry } = await resolveTarget(ctx, args[0], 'prototype');
  const artifacts = artifactDir(ctx, entry);
  const dist = join(artifacts, 'dist');
  if (!existsSync(join(dist, 'index.html'))) {
    throw new CliError('not_found', `${entry.slug} has not been built yet.`, {
      hint: `Run \`pnpm protoyard build ${entry.slug}\` first.`,
    });
  }
  let base = './';
  try {
    base =
      (
        JSON.parse(await readFile(join(artifacts, BUILD_MANIFEST_FILENAME), 'utf8')) as {
          base?: string;
        }
      ).base ?? './';
  } catch {
    // A dist without a manifest is served at the root.
  }
  const out = workspaceFile(ctx.root, opt(options, 'out') ?? join('tmp', 'sweep', entry.slug));
  const launch = await launchChromium();
  if (!launch.ok) {
    throw new CliError('not_found', 'The sweep needs Playwright and its Chromium.', {
      hint: 'Run `pnpm add -D @playwright/test && pnpm exec playwright install chromium`.',
      data: { reason: launch.reason },
    });
  }
  const server = await serveStatic({ dir: dist, base, port: 0, host: '127.0.0.1' });
  const shots: { id: string; file?: string; bytes?: number; error?: string }[] = [];
  try {
    mkdirSync(out, { recursive: true });
    const origin = new URL(server.url).origin;
    for (const shot of SWEEP_SHOTS) {
      try {
        const png = await withReadyPage(
          launch.browser,
          server.url,
          { ...shot.options, allowOrigin: origin },
          screenshot
        );
        const file = join(out, `${shot.id}.png`);
        writeFileSync(file, png);
        shots.push({ id: shot.id, file: relative(ctx.root, file), bytes: png.byteLength });
      } catch (error) {
        shots.push({ id: shot.id, error: (error as Error).message.slice(0, 300) });
      }
    }
  } finally {
    await server.close();
    await launch.browser.close();
  }
  const failed = shots.filter((shot) => shot.error);
  const data = { slug: entry.slug, out: relative(ctx.root, out), shots };
  if (failed.length > 0) {
    throw new CliError('failure', `${failed.length} of ${shots.length} shots failed.`, {
      data,
      hint: failed.map((shot) => `${shot.id}: ${shot.error}`).join(' · '),
    });
  }
  return {
    data,
    render(o) {
      o.always(`✓ ${entry.slug}: ${shots.length} shots in ${data.out}`);
      for (const shot of shots) o.info(`  ${shot.id}  ${shot.file} (${shot.bytes} B)`);
    },
  };
};
