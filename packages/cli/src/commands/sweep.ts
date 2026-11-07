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
import { BUILD_MARKER, guardOutputDir } from '../lib/output-guard.ts';
import { serveStatic } from '../lib/static-server.ts';
import { resolveTarget } from '../lib/workspace.ts';

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
/** The page URL for one shot: the mode the shot is named for, and no DevTools pill. */
export function sweepShotUrl(base: string, colorScheme: 'light' | 'dark'): string {
  const url = new URL(base);
  url.searchParams.set('mode', colorScheme);
  url.searchParams.set('devtools', '0');
  return url.toString();
}

type Shot = { id: string; file?: string; bytes?: number; error?: string };

async function sweepOne(
  ctx: Parameters<Handler>[0],
  slug: string,
  outRoot: string | undefined,
  browser: Extract<Awaited<ReturnType<typeof launchChromium>>, { ok: true }>['browser'],
  many: boolean
): Promise<{ slug: string; out: string; shots: Shot[] }> {
  const { entry } = await resolveTarget(ctx, slug, 'prototype');
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
  const out = guardOutputDir({
    root: ctx.root,
    paths: ctx.paths,
    requested: outRoot
      ? many
        ? join(outRoot, entry.slug)
        : outRoot
      : join('tmp', 'sweep', entry.slug),
    marker: BUILD_MARKER,
  });
  const server = await serveStatic({ dir: dist, base, port: 0, host: '127.0.0.1' });
  const shots: Shot[] = [];
  try {
    mkdirSync(out, { recursive: true });
    const origin = new URL(server.url).origin;
    for (const shot of SWEEP_SHOTS) {
      try {
        // ?mode= wins over the manifest's defaultMode, so a dark shot is dark
        // even when the prototype fixes its mode; ?devtools=0 hides the pill.
        const png = await withReadyPage(
          browser,
          sweepShotUrl(server.url, shot.options.colorScheme),
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
  }
  return { slug: entry.slug, out: relative(ctx.root, out), shots };
}

/**
 * `protoyard sweep <slug...>`: a visual sweep any workspace can run. It serves
 * each prototype's static build on loopback and captures light and dark,
 * desktop and phone PNGs with the deterministic capture of `protoyard/capture`
 * (only the build's own origin may be fetched). Each shot forces its mode with
 * `?mode=` and hides DevTools with `?devtools=0`. Needs a build per slug
 * (`protoyard build <slug>`) and Playwright's Chromium.
 */
export const sweepCommand: Handler = async (ctx, args, options): Promise<CommandResult> => {
  const slugs = args.filter((arg): arg is string => typeof arg === 'string' && arg.length > 0);
  if (slugs.length === 0) throw new CliError('usage', 'Name at least one prototype slug.');
  // Check every build before starting a browser, so a missing build is reported as such.
  for (const slug of slugs) {
    const { entry } = await resolveTarget(ctx, slug, 'prototype');
    if (!existsSync(join(artifactDir(ctx, entry), 'dist', 'index.html'))) {
      throw new CliError('not_found', `${entry.slug} has not been built yet.`, {
        hint: `Run \`pnpm protoyard build ${entry.slug}\` first.`,
      });
    }
  }
  const launch = await launchChromium();
  if (!launch.ok) {
    throw new CliError('not_found', 'The sweep needs Playwright and its Chromium.', {
      hint: 'Run `pnpm add -D @playwright/test && pnpm exec playwright install chromium`.',
      data: { reason: launch.reason },
    });
  }
  const results: { slug: string; out: string; shots: Shot[] }[] = [];
  try {
    for (const slug of slugs) {
      results.push(
        await sweepOne(ctx, slug, opt(options, 'out'), launch.browser, slugs.length > 1)
      );
    }
  } finally {
    await launch.browser.close();
  }
  const failed = results.flatMap((r) =>
    r.shots.filter((s) => s.error).map((s) => `${r.slug}/${s.id}: ${s.error}`)
  );
  const data = { prototypes: results };
  if (failed.length > 0) {
    throw new CliError('failure', `${failed.length} shot(s) failed.`, {
      data,
      hint: failed.join(' · '),
    });
  }
  return {
    data,
    render(o) {
      for (const r of results) {
        o.always(`✓ ${r.slug}: ${r.shots.length} shots in ${r.out}`);
        for (const shot of r.shots) o.info(`  ${shot.id}  ${shot.file} (${shot.bytes} B)`);
      }
    },
  };
};
