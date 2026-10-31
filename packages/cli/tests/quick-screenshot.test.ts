// @vitest-environment node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ensurePlayerBuild } from '../../player/tests/support/serve-dist.ts';
import { setQuickPlayerLocator } from '../src/commands/quick/index.ts';
import {
  QUICK_SHOT_BUDGET_BYTES,
  QUICK_SHOT_SIZES,
  setQuickShotLauncher,
} from '../src/commands/quick/shot.ts';
import {
  changedPixels,
  type DecodedImage,
  decodePng,
  launchChromium,
} from '../src/lib/capture/index.ts';
import { parseQuickRecord } from '../src/lib/quick/model.ts';
import {
  createPlayerAssetsManifest,
  readPlayerAssetsManifest,
} from '../src/lib/quick/player-assets.ts';
import { cli, createWorkspace, type TempWorkspace } from './helpers.ts';

const REPO = fileURLToPath(new URL('../../../', import.meta.url));

const ANALYTICS = join(import.meta.dirname, '../../../blueprints/quick/analytics.json');

let ws: TempWorkspace;
let restore: (() => void)[] = [];

/** A tiny prebuilt player; `app.js` decides what the page does (here: fail to boot). */
async function fixturePlayer(root: string, app: string) {
  const dir = join(root, 'fixture-player', 'dist', 'app');
  mkdirSync(join(dir, 'assets'), { recursive: true });
  writeFileSync(
    join(dir, 'index.html'),
    '<!doctype html><title>fixture player</title><script type="module" src="./assets/app.js"></script>\n'
  );
  writeFileSync(join(dir, 'assets', 'app.js'), app);
  const manifest = await createPlayerAssetsManifest(dir, '1.0.0');
  return {
    dir,
    packageDir: join(root, 'fixture-player'),
    version: '1.0.0',
    manifest,
    source: 'repository' as const,
  };
}

async function useFixturePlayer(app = 'export const fixture = true;\n') {
  const player = await fixturePlayer(ws.root, app);
  restore.push(
    setQuickPlayerLocator(() => ({ ...player, manifest: readPlayerAssetsManifest(player.dir) }))
  );
}

beforeEach(() => {
  ws = createWorkspace();
  restore = [];
});
afterEach(() => {
  for (const undo of restore.splice(0)) undo();
  ws.cleanup();
});

/** The largest difference in any channel of any pixel between two same-size images. */
function maxChannelDelta(a: DecodedImage, b: DecodedImage): number {
  expect([a.width, a.height]).toEqual([b.width, b.height]);
  let max = 0;
  for (let i = 0; i < a.pixels.length; i++) {
    max = Math.max(max, Math.abs((a.pixels[i] as number) - (b.pixels[i] as number)));
  }
  return max;
}

const run = (...args: string[]) => cli(['--root', ws.root, '--json', 'quick', ...args]);
const record = (dir: string) =>
  parseQuickRecord(JSON.parse(readFileSync(join(ws.root, dir, 'quick.json'), 'utf8')));

interface ShotData {
  files: {
    variant: string | null;
    path: string;
    width: number;
    height: number;
    bytes: number;
    sha256: string;
    size: string;
    overBudget: boolean;
  }[];
  skipped: { reason: string; detail: string } | null;
}

describe('quick screenshots without a browser', () => {
  it.each([
    ['playwright-unavailable', 'Playwright is not installed (tried @playwright/test, playwright).'],
    ['browser-unavailable', "Executable doesn't exist; run playwright install chromium"],
  ] as const)('records a %s skip and exits 0', async (reason, detail) => {
    await useFixturePlayer();
    restore.push(setQuickShotLauncher(async () => ({ ok: false, reason, detail })));

    // `quick … --screenshot`: the exploration is still created.
    const created = await run('--blueprint', ANALYTICS, '--slug', 'idea', '--screenshot');
    expect(created.code, created.stderr || created.stdout).toBe(0);
    const data = created.json<{ data: { dir: string; ready: boolean; screenshots: ShotData } }>()
      .data;
    expect(data.ready).toBe(true);
    expect(data.screenshots).toEqual({ slug: 'idea', files: [], skipped: { reason, detail } });
    expect(record(data.dir).screenshots).toMatchObject({ files: [], skipped: { reason } });

    // `quick shot`: same skip, same exit code.
    const shot = await run('shot', 'idea');
    expect(shot.code).toBe(0);
    expect(shot.json<{ data: ShotData }>().data.skipped?.reason).toBe(reason);
  });

  it('creates an exploration without screenshots unless asked', async () => {
    await useFixturePlayer();
    let launched = 0;
    restore.push(
      setQuickShotLauncher(async () => {
        launched += 1;
        return { ok: false, reason: 'playwright-unavailable', detail: 'not needed' };
      })
    );
    const created = await run('--blueprint', ANALYTICS, '--slug', 'idea');
    expect(created.code).toBe(0);
    expect(created.json<{ data: Record<string, unknown> }>().data).not.toHaveProperty(
      'screenshots'
    );
    expect(launched).toBe(0);
  });
});

describe('quick screenshots in Chromium', async () => {
  // The real browser, when this machine has one; otherwise these are reported and skipped.
  const probe = await launchChromium();
  if (probe.ok) await probe.browser.close();
  else console.warn(`quick-screenshot: ${probe.reason} (${probe.detail}); browser checks skipped`);

  it.skipIf(!probe.ok)(
    'captures each variant at 1280x800 and the phone size, deterministically, within budget',
    async () => {
      // The real player build that @protoyard/cli depends on: built once, under the
      // shared lock, when this file runs before the tests that used to build it.
      ensurePlayerBuild(REPO);
      const created = await run(
        '--blueprint',
        ANALYTICS,
        '--slug',
        'idea',
        '--variants',
        '1',
        '--screenshot',
        '--phone'
      );
      expect(created.code, created.stderr || created.stdout).toBe(0);
      const { dir, screenshots } = created.json<{ data: { dir: string; screenshots: ShotData } }>()
        .data;
      expect(screenshots.skipped).toBeNull();
      expect(screenshots.files.map((file) => [file.path, file.width, file.height])).toEqual([
        ['screenshots/base-desktop.png', 1280, 800],
        ['screenshots/base-phone.png', 390, 844],
        ['screenshots/v1-desktop.png', 1280, 800],
        ['screenshots/v1-phone.png', 390, 844],
      ]);
      for (const file of screenshots.files) {
        const png = readFileSync(join(ws.root, dir, file.path));
        const image = decodePng(png);
        const size = QUICK_SHOT_SIZES[file.size as keyof typeof QUICK_SHOT_SIZES];
        expect([image.width, image.height], file.path).toEqual([size.width, size.height]);
        expect(file.bytes, file.path).toBe(png.length);
        expect(file.bytes, `${file.path} within the thumbnail budget`).toBeLessThanOrEqual(
          QUICK_SHOT_BUDGET_BYTES
        );
        expect(file.overBudget).toBe(false);
      }
      expect(record(dir).screenshots.files.map((file) => [file.variant, file.path])).toEqual([
        [null, 'screenshots/base-desktop.png'],
        [null, 'screenshots/base-phone.png'],
        ['v1', 'screenshots/v1-desktop.png'],
        ['v1', 'screenshots/v1-phone.png'],
      ]);

      // A second capture of the same exploration renders the same pixels.
      const first = decodePng(readFileSync(join(ws.root, dir, 'screenshots/base-desktop.png')));
      const again = await run('shot', 'idea');
      expect(again.code, again.stderr || again.stdout).toBe(0);
      const second = decodePng(readFileSync(join(ws.root, dir, 'screenshots/base-desktop.png')));
      // Chromium's anti-aliasing of rounded corners can move a channel by one between runs;
      // content never changes, so no channel may move by more than 2 and almost nothing moves.
      expect(maxChannelDelta(first, second)).toBeLessThanOrEqual(2);
      expect(changedPixels(first, second)).toBeLessThan((1280 * 800) / 2000);
      // quick shot without --phone keeps the earlier phone captures recorded.
      expect(record(dir).screenshots.files).toHaveLength(4);
    },
    180_000
  );

  it.skipIf(!probe.ok)(
    'records capture-failed when the prototype does not boot, and exits 0',
    async () => {
      await useFixturePlayer("document.documentElement.dataset.pyReady = 'error';\n");
      const created = await run('--blueprint', ANALYTICS, '--slug', 'idea', '--screenshot');
      expect(created.code, created.stderr || created.stdout).toBe(0);
      const { dir, screenshots } = created.json<{ data: { dir: string; screenshots: ShotData } }>()
        .data;
      expect(screenshots.skipped?.reason).toBe('capture-failed');
      expect(screenshots.skipped?.detail).toMatch(/failed to boot/);
      expect(record(dir).screenshots.skipped?.reason).toBe('capture-failed');
    },
    120_000
  );
});
