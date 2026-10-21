import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Browser } from '@playwright/test';
import {
  type CaptureUnavailable,
  type ChromiumLaunch,
  launchChromium,
  optimizePng,
  screenshot,
  withReadyPage,
} from '../../lib/capture/index.ts';
import { sha256Text } from '../../lib/checksum.ts';
import type { CommandResult, Handler } from '../../lib/command.ts';
import { flag } from '../../lib/command.ts';
import { mark } from '../../lib/output.ts';
import { toPosixRelative } from '../../lib/paths.ts';
import { writeQuickAtomic } from '../../lib/quick/atomic-write.ts';
import {
  type QuickScreenshot,
  readQuickRecord,
  touchQuickRecord,
  writeQuickRecord,
} from '../../lib/quick/model.ts';
import { QUICK_PLAYER_DIR } from '../../lib/quick/paths.ts';
import { serveStatic } from '../../lib/static-server.ts';
import { quickCommand } from './index.ts';
import { type QuickServeTarget, resolveQuickServeTarget } from './serve.ts';

/**
 * `protoyard quick shot <slug|dir> [--phone]` and `protoyard quick … --screenshot`:
 * one PNG per exploration and variant at 1280×800 (plus 390×844 with
 * `--phone`), recorded in quick.json.
 *
 * The exploration is served on 127.0.0.1 on a port the OS assigns, only for
 * the capture. Each page opens the player URL its launcher points to (read
 * from index.html rather than following the meta refresh), in a fresh browser
 * context, and is captured after the shared ready-mark wait
 * (`withReadyPage`): `data-py-ready`, fonts, network idle and a quiet DOM.
 * PNGs are re-compressed losslessly.
 *
 * Playwright is optional: without it (or without its Chromium build) the run
 * records a skip in quick.json (`playwright-unavailable` or
 * `browser-unavailable`) and exits 0. A page that fails to boot records
 * `capture-failed`, also without failing the command.
 */

export const QUICK_SHOT_DIR = 'screenshots';
export const QUICK_SHOT_SIZES = {
  desktop: { width: 1280, height: 800, mobile: false },
  phone: { width: 390, height: 844, mobile: true },
} as const;
/** Thumbnail budget per PNG; larger captures are kept but reported. */
export const QUICK_SHOT_BUDGET_BYTES = 150 * 1024;

type SizeName = keyof typeof QUICK_SHOT_SIZES;

/** How the browser starts. Tests swap it to simulate a machine without Playwright. */
let launch: () => Promise<ChromiumLaunch> = () => launchChromium();
export function setQuickShotLauncher(next: () => Promise<ChromiumLaunch>): () => void {
  const previous = launch;
  launch = next;
  return () => {
    launch = previous;
  };
}

export type QuickShotSkipReason = CaptureUnavailable['reason'] | 'capture-failed';

export interface QuickShotResult {
  slug: string;
  files: (Omit<QuickScreenshot, 'capturedAt'> & { size: SizeName; overBudget: boolean })[];
  skipped: { reason: QuickShotSkipReason; detail: string } | null;
}

/** The URL a launcher's meta refresh opens, relative to the launcher's folder. */
async function launcherTarget(launcher: string): Promise<string> {
  const html = await readFile(launcher, 'utf8');
  const match = /http-equiv="refresh" content="0; url=([^"]+)"/.exec(html);
  if (!match?.[1]) throw new Error(`${launcher} has no launcher link.`);
  return match[1]
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

async function writeAtomic(path: string, data: Buffer): Promise<void> {
  await writeQuickAtomic(path, data);
}

/** Captures every launcher of a resolved exploration; never throws for a missing browser. */
export async function captureExploration(
  target: QuickServeTarget,
  options: { phone?: boolean } = {}
): Promise<QuickShotResult> {
  const record = await readQuickRecord(target.dir);
  const sizes: SizeName[] = options.phone ? ['desktop', 'phone'] : ['desktop'];
  const pages = [
    { variant: null as string | null, folder: '' },
    ...record.variants.map((variant) => ({ variant: variant.id, folder: `${variant.dir}/` })),
  ];

  const skip = async (reason: QuickShotSkipReason, detail: string): Promise<QuickShotResult> => {
    await writeQuickRecord(target.dir, {
      ...touchQuickRecord(record),
      screenshots: {
        files: record.screenshots.files,
        skipped: { reason, at: new Date().toISOString() },
      },
    });
    return { slug: record.slug, files: [], skipped: { reason, detail } };
  };

  const launched = await launch();
  if (!launched.ok) return skip(launched.reason, launched.detail);
  const browser: Browser = launched.browser;
  let bound = 0;
  const server = await serveStatic({
    dir: target.root,
    base: '/',
    port: 0,
    host: '127.0.0.1',
    strictPort: true,
    spa: false,
    allowHost: (host) => bound !== 0 && host === `127.0.0.1:${bound}`,
    allowPathname: (pathname) =>
      target.layout === 'standalone' ||
      pathname.startsWith(target.path) ||
      pathname.startsWith(`/${QUICK_PLAYER_DIR}/${target.playerVersion}/`),
  });
  bound = server.port;
  const origin = `http://127.0.0.1:${bound}`;
  const files: QuickShotResult['files'] = [];
  const recorded: QuickScreenshot[] = [];
  try {
    await mkdir(join(target.dir, QUICK_SHOT_DIR), { recursive: true });
    for (const page of pages) {
      const launcherUrl = new URL(`${target.path}${page.folder}`, origin);
      const href = await launcherTarget(join(target.dir, page.folder, 'index.html'));
      const url = new URL(href, launcherUrl).toString();
      for (const size of sizes) {
        const { width, height, mobile } = QUICK_SHOT_SIZES[size];
        const png = optimizePng(
          await withReadyPage(
            browser,
            url,
            { viewport: { width, height }, colorScheme: 'light', mobile },
            screenshot
          )
        );
        const name = `${page.variant ?? 'base'}-${size}.png`;
        await writeAtomic(join(target.dir, QUICK_SHOT_DIR, name), png);
        const entry: QuickScreenshot = {
          variant: page.variant,
          path: `${QUICK_SHOT_DIR}/${name}`,
          width,
          height,
          bytes: png.length,
          sha256: sha256Text(png),
          capturedAt: new Date().toISOString(),
        };
        recorded.push(entry);
        const { capturedAt: _at, ...rest } = entry;
        files.push({ ...rest, size, overBudget: png.length > QUICK_SHOT_BUDGET_BYTES });
      }
    }
  } catch (error) {
    const detail = (error instanceof Error ? error.message : String(error)).split('\n')[0] ?? '';
    return skip('capture-failed', detail.slice(0, 300));
  } finally {
    await server.close();
    await browser.close();
  }

  // This run's captures replace earlier ones for the same files; others stay.
  const paths = new Set(recorded.map((entry) => entry.path));
  const kept = record.screenshots.files.filter((entry) => !paths.has(entry.path));
  await writeQuickRecord(target.dir, {
    ...touchQuickRecord(record),
    screenshots: { files: [...kept, ...recorded].slice(-64), skipped: null },
  });
  return { slug: record.slug, files, skipped: null };
}

function renderShot(
  result: QuickShotResult,
  out: Parameters<NonNullable<CommandResult['render']>>[0]
) {
  const { c } = out;
  if (result.skipped) {
    out.warn(
      `${mark(c, 'skip')} Screenshots skipped (${result.skipped.reason}): ${result.skipped.detail}`
    );
    if (result.skipped.reason !== 'capture-failed')
      out.info(
        c.dim(
          '  Install them with: pnpm add -D @playwright/test && pnpm exec playwright install chromium'
        )
      );
    return;
  }
  for (const file of result.files) {
    out.info(
      `${mark(c, file.overBudget ? 'warn' : 'pass')} ${file.path} (${Math.round(file.bytes / 1024)} KB${file.overBudget ? `, over the ${QUICK_SHOT_BUDGET_BYTES / 1024} KB budget` : ''})`
    );
  }
}

export const quickShotCommand: Handler = async (ctx, args, options): Promise<CommandResult> => {
  const target = await resolveQuickServeTarget({
    workspaceRoot: ctx.root,
    cwd: process.cwd(),
    target: args[0] ?? '',
  });
  const result = await captureExploration(target, { phone: flag(options, 'phone') });
  const data = { ...result, dir: toPosixRelative(ctx.root, target.dir) };
  return {
    data,
    render(out) {
      if (!result.skipped)
        out.always(
          `${mark(out.c, 'pass')} ${result.files.length} screenshot${result.files.length === 1 ? '' : 's'} of ${out.c.bold(result.slug)} in ${data.dir}/${QUICK_SHOT_DIR}/`
        );
      renderShot(result, out);
    },
  };
};

/** `protoyard quick … --screenshot`: the exploration as usual, then `quick shot` on it. */
export const quickWithScreenshotCommand: Handler = async (
  ctx,
  args,
  options
): Promise<CommandResult> => {
  const created = await quickCommand(ctx, args, options);
  if (!flag(options, 'screenshot')) return created;
  const { dir } = created.data as { dir: string };
  const target = await resolveQuickServeTarget({
    workspaceRoot: ctx.root,
    cwd: process.cwd(),
    target: join(ctx.root, dir),
  });
  const shots = await captureExploration(target, { phone: flag(options, 'phone') });
  return {
    ...created,
    data: { ...(created.data as object), screenshots: shots },
    render(out) {
      created.render?.(out);
      renderShot(shots, out);
    },
  };
};
