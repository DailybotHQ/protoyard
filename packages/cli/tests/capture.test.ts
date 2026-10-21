// @vitest-environment node
import { crc32, deflateSync } from 'node:zlib';
import { afterAll, describe, expect, it } from 'vitest';
import {
  changedPixels,
  decodePng,
  launchChromium,
  loadPlaywright,
  optimizePng,
  PLAYWRIGHT_MODULES,
  screenshot,
  withReadyPage,
} from '../src/lib/capture/index.ts';

function missing(name: string): Error {
  return Object.assign(new Error(`Cannot find package '${name}'`), {
    code: 'ERR_MODULE_NOT_FOUND',
  });
}

/** A tiny 8-bit RGB PNG, filter 0 on every row. */
function encodePng(width: number, height: number, pixel: (x: number, y: number) => number[]) {
  const rows: number[] = [];
  for (let y = 0; y < height; y += 1) {
    rows.push(0);
    for (let x = 0; x < width; x += 1) rows.push(...pixel(x, y));
  }
  const chunk = (type: string, data: Buffer) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(type, 4, 'latin1');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0);
    return Buffer.concat([head, data, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('tEXt', Buffer.from('Comment\0dropped by optimizePng', 'latin1')),
    chunk('IDAT', deflateSync(Buffer.from(rows), { level: 0 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

describe('optional Playwright', () => {
  it('reports playwright-unavailable when no module is installed', async () => {
    const tried: string[] = [];
    const result = await loadPlaywright({
      importModule: async (name) => {
        tried.push(name);
        throw missing(name);
      },
    });
    expect(tried).toEqual([...PLAYWRIGHT_MODULES]);
    expect(result).toEqual({
      ok: false,
      reason: 'playwright-unavailable',
      detail: 'Playwright is not installed (tried @playwright/test, playwright).',
    });
  });

  it('falls back to the second module and ignores modules without chromium', async () => {
    const chromium = { launch: async () => ({}) };
    const fromSecond = await loadPlaywright({
      importModule: async (name) => {
        if (name === '@playwright/test') throw missing(name);
        return { chromium };
      },
    });
    expect(fromSecond).toEqual({ ok: true, chromium });
    const empty = await loadPlaywright({ importModule: async () => ({}) });
    expect(empty).toMatchObject({ ok: false, reason: 'playwright-unavailable' });
  });

  it('reports a broken install as unavailable instead of throwing', async () => {
    const result = await loadPlaywright({
      importModule: async () => {
        throw new Error('SyntaxError in playwright core\nstack…');
      },
    });
    expect(result).toEqual({
      ok: false,
      reason: 'playwright-unavailable',
      detail: '@playwright/test: SyntaxError in playwright core',
    });
  });

  it('reports a missing browser build as browser-unavailable', async () => {
    const result = await launchChromium({
      importModule: async () => ({
        chromium: {
          launch: async () => {
            throw new Error("browserType.launch: Executable doesn't exist at /x/chrome\n╔═══");
          },
        },
      }),
    });
    expect(result).toEqual({
      ok: false,
      reason: 'browser-unavailable',
      detail: "browserType.launch: Executable doesn't exist at /x/chrome",
    });
  });

  it('loads the real module in this workspace', async () => {
    const result = await loadPlaywright();
    expect(result.ok).toBe(true);
  });
});

describe('PNG helpers', () => {
  const gradient = encodePng(16, 9, (x, y) => [x * 15, y * 28, (x + y) * 10]);

  it('re-compresses losslessly and drops ancillary chunks', () => {
    const optimized = optimizePng(gradient);
    expect(optimized.length).toBeLessThan(gradient.length);
    expect(optimized.includes(Buffer.from('tEXt'))).toBe(false);
    expect(changedPixels(decodePng(optimized), decodePng(gradient))).toBe(0);
    expect(optimizePng(optimized)).toEqual(optimized);
  });

  it('counts changed pixels and refuses size mismatches and non-PNGs', () => {
    const shifted = encodePng(16, 9, (x, y) => [
      x * 15,
      y * 28,
      x === 3 && y === 4 ? 1 : (x + y) * 10,
    ]);
    expect(changedPixels(decodePng(gradient), decodePng(shifted))).toBe(1);
    expect(
      changedPixels(decodePng(gradient), decodePng(encodePng(8, 9, () => [0, 0, 0])))
    ).toBeNull();
    expect(() => decodePng(Buffer.from('not a png'))).toThrow(/not a PNG/);
  });
});

const browserLaunch = await launchChromium();
// Closing Chromium under heavy machine load can take longer than the 10 s hook default.
afterAll(() => (browserLaunch.ok ? browserLaunch.browser.close() : undefined), 60_000);
if (!browserLaunch.ok)
  console.warn(`capture.test: real-browser checks skipped (${browserLaunch.detail})`);

describe.runIf(browserLaunch.ok)('deterministic capture in Chromium', () => {
  const page = (ready: string) =>
    `data:text/html,${encodeURIComponent(
      `<!doctype html><html data-py-ready="${ready}"><body style="margin:0;font:16px sans-serif"><main style="padding:24px;background:#eef">Ready: ${ready}</main></body></html>`
    )}`;
  const options = { viewport: { width: 320, height: 200 }, colorScheme: 'light' as const };

  it('captures byte-identical PNGs in fresh contexts', { timeout: 120_000 }, async () => {
    if (!browserLaunch.ok) return;
    const { browser } = browserLaunch;
    const first = optimizePng(await withReadyPage(browser, page('true'), options, screenshot));
    const second = optimizePng(await withReadyPage(browser, page('true'), options, screenshot));
    expect(decodePng(first)).toMatchObject({ width: 320, height: 200 });
    expect(second.equals(first)).toBe(true);
    await expect(withReadyPage(browser, page('error'), options, screenshot)).rejects.toThrow(
      /failed to boot/
    );
  });
});
