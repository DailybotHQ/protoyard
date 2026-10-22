// @vitest-environment node
/**
 * Player hardening:
 *  1. the sources that turn untrusted blueprints into UI (player, crud,
 *     blueprint) never use {@html}, eval, new Function, HTML string sinks or a
 *     dynamic import of a computed specifier;
 *  2. the built index.html opens <head> with the charset, then a strict CSP meta tag, with
 *     every inline script hashed and no unsafe-eval, and `_headers` repeats it
 *     with frame-ancestors;
 *  3. in Chromium, the built player opens a share link under that CSP with no
 *     policy violation.
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join, normalize, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodeBlueprintShare, parseBlueprint } from '@protoyard/blueprint';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { allowedByRules, DEFAULT_ALLOWLIST, frameAncestorSources } from '../src/embed/origins.ts';
import demo from '../src/fixtures/demo.blueprint.json';
import { inlineScripts, insertCspMeta, PLAYER_FRAME_ANCESTORS } from '../vite.config.ts';
import { ensurePlayerBuild } from './support/serve-dist.ts';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const DIST = join(ROOT, 'packages/player/dist/app');
const GUARDED = ['packages/player/src', 'packages/crud/src', 'packages/blueprint/src'];

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'node_modules' ? [] : sources(path);
    return /\.(ts|js|svelte)$/.test(name) ? [path] : [];
  });
}

const FORBIDDEN: [string, RegExp][] = [
  ['{@html}', /\{@html\b/],
  ['eval()', /(?<![.\w])eval\s*\(/],
  ['new Function()', /new\s+Function\s*\(/],
  ['Function()', /(?<![.\w'"`])Function\s*\(/],
  ['innerHTML/outerHTML assignment', /\.(?:inner|outer)HTML\s*=/],
  ['insertAdjacentHTML', /insertAdjacentHTML\s*\(/],
  ['document.write', /document\.write(?:ln)?\s*\(/],
  ['dynamic import of a computed specifier', /(?<![.\w])import\(\s*(?!['"`]|\))/],
  // biome-ignore lint/suspicious/noTemplateCurlyInString: the label names the pattern.
  ['dynamic import of a template with ${}', /(?<![.\w])import\(\s*`[^`]*\$\{/],
];

describe('source guard', () => {
  it('player, crud and blueprint never evaluate or inject data as code or HTML', () => {
    const files = GUARDED.flatMap((dir) => sources(join(ROOT, dir)));
    expect(files.length).toBeGreaterThan(100);
    const hits: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8')
        // Comments may mention the rules they follow.
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1')
        .replace(/<!--[\s\S]*?-->/g, '');
      for (const [label, pattern] of FORBIDDEN) {
        if (pattern.test(text)) hits.push(`${relative(ROOT, file)}: ${label}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it('the patterns catch what they should', () => {
    const samples = [
      '{@html row.notes}',
      'eval(text)',
      'new Function("return 1")',
      'const f = Function(body)',
      'el.innerHTML = value',
      'el.insertAdjacentHTML("beforeend", value)',
      'document.write(value)',
      'await import(blueprint.entry)',
      // biome-ignore lint/suspicious/noTemplateCurlyInString: a sample of the forbidden pattern.
      'await import(`./kits/${name}.ts`)',
    ];
    for (const sample of samples) {
      expect(
        FORBIDDEN.some(([, pattern]) => pattern.test(sample)),
        sample
      ).toBe(true);
    }
    for (const fine of [
      "await import('./boot.ts')",
      'typeof x === "function"',
      'retrieval(x)',
      'map.evaluate(x)',
    ]) {
      expect(
        FORBIDDEN.some(([, pattern]) => pattern.test(fine)),
        fine
      ).toBe(false);
    }
  });
});

let html = '';
let headers = '';
beforeAll(() => {
  ensurePlayerBuild(ROOT);
  html = readFileSync(join(DIST, 'index.html'), 'utf8');
  headers = readFileSync(join(DIST, '_headers'), 'utf8');
}, 600_000);

function cspOf(source: string): Map<string, string[]> {
  return new Map(
    source
      .split(';')
      .map((part) => part.trim().split(/\s+/))
      .filter((parts) => parts[0])
      .map(([name, ...values]) => [name as string, values])
  );
}

const metaCsp = () => {
  const match = /<meta http-equiv="Content-Security-Policy" content="([^"]+)">/.exec(html);
  if (!match) throw new Error('no CSP meta tag in the built index.html');
  return match[1] as string;
};

describe('built player CSP', () => {
  it('keeps <meta charset> in the first 1024 bytes and the CSP meta before every script', () => {
    const bytes = Buffer.from(html, 'utf8');
    const charset = bytes.indexOf('<meta charset=');
    expect(charset).toBeGreaterThan(-1);
    expect(bytes.indexOf('>', charset)).toBeLessThan(1024);
    const head = html.slice(html.indexOf('<head>') + '<head>'.length).trimStart();
    expect(head).toMatch(
      /^<meta charset="[^"]+" ?\/?>\s*<meta http-equiv="Content-Security-Policy"/
    );
    const csp = html.indexOf('<meta http-equiv="Content-Security-Policy"');
    const firstScript = html.search(/<script[\s>]/i);
    expect(firstScript).toBeGreaterThan(csp);
  });

  it('moves the charset first and the CSP meta right after it, before any script', () => {
    const meta = '<meta http-equiv="Content-Security-Policy" content="x">';
    expect(
      insertCspMeta(
        '<head>\n    <script>big()</script>\n    <meta charset="UTF-8" />\n    <title>t</title>',
        meta
      )
    ).toBe(
      `<head>\n    <meta charset="UTF-8" />\n    ${meta}\n    <script>big()</script>\n    <title>t</title>`
    );
    expect(insertCspMeta('<head lang="en"><script></script>', meta)).toBe(
      `<head lang="en">\n    ${meta}<script></script>`
    );
  });

  it('allows only same-origin scripts plus the hash of every inline script, never eval', () => {
    const csp = cspOf(metaCsp());
    const scripts = inlineScripts(html);
    expect(scripts.length).toBeGreaterThan(0);
    const hashes = scripts.map(
      (body) => `'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`
    );
    expect(csp.get('script-src')).toEqual(["'self'", ...hashes]);
    expect(metaCsp()).not.toMatch(/unsafe-eval|wasm-unsafe-eval|\*|https?:/);
    expect(csp.get('default-src')).toEqual(["'self'"]);
    expect(csp.get('connect-src')).toEqual(["'self'"]);
    expect(csp.get('worker-src')).toEqual(["'self'"]);
    expect(csp.get('object-src')).toEqual(["'none'"]);
    expect(csp.get('base-uri')).toEqual(["'none'"]);
    expect(csp.get('form-action')).toEqual(["'none'"]);
    expect(html).not.toMatch(/\son[a-z]+\s*=/i);
  });

  it('repeats the policy as a header with frame-ancestors, never *', () => {
    const line = /Content-Security-Policy: (.+)/.exec(headers)?.[1] ?? '';
    expect(line.startsWith(metaCsp())).toBe(true);
    const ancestors = cspOf(line).get('frame-ancestors');
    expect(ancestors).toEqual(PLAYER_FRAME_ANCESTORS);
    expect(ancestors).not.toContain('*');
    expect(headers).toMatch(/X-Content-Type-Options: nosniff/);
  });

  it('lets exactly the embed allowlist frame the player', () => {
    // protoyard.app, plus localhost and 127.0.0.1 on any port, on both sides.
    expect(PLAYER_FRAME_ANCESTORS).toEqual([
      "'self'",
      'https://protoyard.app',
      'http://localhost:*',
      'https://localhost:*',
      'http://127.0.0.1:*',
      'https://127.0.0.1:*',
    ]);
    expect(PLAYER_FRAME_ANCESTORS.slice(1)).toEqual(frameAncestorSources(DEFAULT_ALLOWLIST));
    // Every allowlisted origin is a frame ancestor, and nothing else is.
    const framable = (origin: string) =>
      PLAYER_FRAME_ANCESTORS.slice(1).some((source) =>
        source.endsWith(':*')
          ? `${new URL(origin).protocol}//${new URL(origin).hostname}:*` === source
          : source === origin
      );
    for (const origin of [
      'https://protoyard.app',
      'http://localhost:5173',
      'https://localhost:8443',
      'http://127.0.0.1:4500',
      'https://127.0.0.1:9000',
      'http://protoyard.app',
      'https://sub.protoyard.app',
      'https://evil.example',
      'http://0.0.0.0:5173',
    ]) {
      expect(framable(origin), origin).toBe(allowedByRules(origin, DEFAULT_ALLOWLIST));
    }
  });
});

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.webp': 'image/webp',
  '.png': 'image/png',
};

describe('built player in Chromium under the CSP', () => {
  let server: Server | undefined;
  afterAll(() => server?.close());

  it('opens a share link and reaches ready with no policy violation', {
    timeout: 120_000,
  }, async () => {
    let playwright: typeof import('@playwright/test');
    try {
      playwright = await import('@playwright/test');
    } catch {
      console.warn('security.test: Playwright is not installed; browser check skipped');
      return;
    }
    const header = /Content-Security-Policy: (.+)/.exec(headers)?.[1] ?? '';
    server = createServer((request, response) => {
      const path = normalize(decodeURIComponent((request.url ?? '/').split('?')[0] as string));
      const file = join(DIST, path === '/' ? 'index.html' : path);
      if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) {
        response.writeHead(404).end();
        return;
      }
      response.writeHead(200, {
        'content-type': MIME[extname(file)] ?? 'application/octet-stream',
        'content-security-policy': header,
      });
      response.end(readFileSync(file));
    });
    await new Promise<void>((done) => server?.listen(0, '127.0.0.1', done));
    const { port } = server.address() as AddressInfo;

    let browser: Awaited<ReturnType<typeof playwright.chromium.launch>>;
    try {
      browser = await playwright.chromium.launch();
    } catch (error) {
      console.warn(
        `security.test: Chromium unavailable (${String(error).split('\n')[0]}); browser check skipped`
      );
      return;
    }
    try {
      const page = await browser.newPage();
      const violations: string[] = [];
      await page.addInitScript(() => {
        document.addEventListener('securitypolicyviolation', (event) => {
          (window as unknown as { __violations: string[] }).__violations ??= [];
          (window as unknown as { __violations: string[] }).__violations.push(
            `${event.effectiveDirective} ${event.blockedURI}`
          );
        });
      });
      const workers: string[] = [];
      page.on('worker', (worker) => {
        workers.push(worker.url());
        worker.on('console', (message) => {
          if (/Content Security Policy|unsafe-eval/i.test(message.text()))
            violations.push(`worker: ${message.text()}`);
        });
      });
      page.on('console', (message) => {
        if (message.type() === 'error' && /Content Security Policy/i.test(message.text())) {
          violations.push(message.text());
        }
      });
      const hash = `#bp=${await encodeBlueprintShare(parseBlueprint(demo))}`;
      await page.goto(`http://127.0.0.1:${port}/index.html?devtools=0${hash}`);
      await page.waitForSelector('html[data-protoyard-ready="1"]', { timeout: 60_000 });
      const reported = await page.evaluate(
        () => (window as unknown as { __violations?: string[] }).__violations ?? []
      );
      expect([...reported, ...violations]).toEqual([]);
      console.info(
        `security.test: ${workers.length} worker(s) ran under the CSP: ${workers.map((url) => url.split('/').pop()).join(', ')}`
      );
      expect(await page.locator('h1').first().textContent()).toBeTruthy();
    } finally {
      await browser.close();
    }
  });
});
