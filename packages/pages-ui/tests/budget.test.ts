// @vitest-environment node
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { build, type Rollup } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '../../..');
const HOSTS = ['page', 'doc'] as const;
type Host = (typeof HOSTS)[number];
const JS_GZIP_BUDGET = 120 * 1024;
// Default 20 KB and it stays. Per-host overrides at the measured size + 5 %
// (re-measured 2026-10-28 on Texuli 0.5.0: page 31,710 B, doc 32,290 B.
// The doc cap is measured + 5 %; the page keeps its existing, tighter cap
// rather than raising to measured + 5 %. Previous: page 30,844 B, doc
// 30,607 B gzip.
// plan007/integration measured page 29,723 B and doc 29,971 B before it; the
// sections now render Texuli Stat, Badge, Avatar, Callout and RichText, whose
// CSS adds page +1.1 KB and doc +0.6 KB. Earlier: 2026-10-28, npm Texuli 0.3.0:
// page 27,785 B, doc 28,033 B gzip; 24,242 B and
// 24,490 B on 2026-10-24 with the linked Texuli). Texuli component CSS
// (~23 KB gz) replaces the former UI CSS; eager/lazy split measured; CSS diet
// tracked as a follow-up. The sum covers every emitted stylesheet: the first
// screen loads only the entry one (page 4,166 B, doc 4,414 B); the rest are
// lazy block and chart families, with no repeated rule beyond `.tx-sr-only`.
// Final Review (2026-10-29): page 32,635 B after the review fixes (Button
// variants, the plain section header), so its cap was measured + 5 %.
//
// Texuli 0.9.0 measured page 34,560 B and doc 35,026 B for every stylesheet
// (token contract v2 component CSS plus @texuli/tokens/base.css, gap G110).
//
// PLAN_008 T-documents (2026-10-31, Texuli 0.9.0): the doc gained the lazy
// `@texuli/pages` editor and the Word/PDF/Markdown export, whose CSS (editor,
// embeds, player) is emitted as lazy stylesheets. The caps now split: the
// stylesheets the first screen loads (imported by the static chunks) and the
// sum of every emitted stylesheet. Measured: page 7,007 B initial / 34,560 B
// all; doc 6,999 B initial / 70,239 B all (35,026 B before the editor).
// Caps are measured + 5 % (the page all-CSS cap stays at the 0.9.0 + 2.5 %).
// Texuli 0.14.3 (2026-11-07): the page initial CSS measures 7,562 B (Texuli's
// CSS grew ~1.9 KB gz across the package: ListItem, Avatar tone, SplitView,
// Composer row); page cap 7,562 + 5 %. The doc (7,272 B) is unchanged.
// Texuli 0.15.0 (PLAN_013, 2026-11-09): the doc initial CSS measures 7,522 B
// (typography components, interactive Card, Button tone); doc cap 7,522 + 5 %.
// The page measures 7,804 B, inside its cap.
const INITIAL_CSS_GZIP_BUDGETS: Record<Host, number> = { page: 7_940, doc: 7_898 };
// T-forms adds @texuli/forms (SchemaForm), whose stylesheet loads only with a
// form block, so only the all-CSS sums grow: page 39,046 B, doc 74,692 B; the
// first screen is unchanged. + 2.5 %. SchemaForm imports every control type
// up front (Texuli gap G119); a lazier SchemaForm lowers these again.
// Texuli 0.10.0 (PLAN_008, 2026-10-31): the doc editor is @texuli/pages/editor-core
// with no player loader (G123) and SchemaForm loads its controls per type (G119):
// doc all CSS 78,560 -> 48,919 B. The page all-CSS sum measured 42,087 B on the
// 0.10.0 bump before any adapter change (42,069 B after), over its 40,023 B cap:
// left for the lead, not raised here.
// PLAN_008 T-doc-reader (2026-10-31, Texuli 0.11.1): the page sum measures 42,067 B. The growth is
// the per-control split (G119): the forms CSS is now 8 lazy stylesheets (FormBlock, Input,
// Checkbox, Slider, date variants, tags and color, file, progress) that gzip to 13,342 B one by one
// but 8,531 B as one stream, so 4,811 B of the sum is per-file gzip overhead; without it the sum is
// about 37,256 B. A reader downloads only the controls a form uses. Page cap: measured + 2.5 %.
// Texuli 0.14.3: the page sum measures 43,139 B; cap measured + 2.5 %.
const CSS_GZIP_BUDGETS: Record<Host, number> = { page: 44_218, doc: 76_560 };

interface HostBuild {
  chunks: Rollup.OutputChunk[];
  assets: Rollup.OutputAsset[];
}

let fixture = '';
const builds = new Map<Host, HostBuild>();
const gzip = (source: string | Uint8Array) => gzipSync(source, { level: 9 }).length;

/** Entry plus chunks reached only through static imports, as the first screen downloads. */
export function staticChunks(chunks: readonly Rollup.OutputChunk[], entryFile: string) {
  const byFile = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));
  const seen = new Set<string>();
  const queue = [entryFile];
  while (queue.length) {
    const file = queue.pop() as string;
    if (seen.has(file)) continue;
    const chunk = byFile.get(file);
    if (!chunk) throw new Error(`missing statically imported chunk ${file}`);
    seen.add(file);
    queue.push(...chunk.imports);
  }
  return [...seen].map((file) => byFile.get(file) as Rollup.OutputChunk);
}

async function writeHostFixture(host: Host) {
  const entryImport = host === 'page' ? '@protoyard/pages-ui/page' : '@protoyard/pages-ui/doc';
  const component = host === 'page' ? 'PageApp' : 'DocApp';
  const prop = host === 'page' ? 'page' : 'doc';
  await writeFile(
    join(fixture, `${host}.html`),
    `<!doctype html><html><body><div id="app"></div><script type="module" src="./${host}.ts"></script></body></html>`
  );
  await writeFile(
    join(fixture, `${host}.ts`),
    `import { mount } from 'svelte';\nimport { ${component} } from '${entryImport}';\nimport '@protoyard/pages-ui/styles.css';\nmount(${component}, { target: document.getElementById('app') as HTMLElement, props: { ${prop}: {} } as never });\n`
  );
}

beforeAll(async () => {
  fixture = await mkdtemp(join(tmpdir(), 'protoyard-pages-budget-'));
  const scope = join(fixture, 'node_modules', '@protoyard');
  await mkdir(scope, { recursive: true });
  for (const name of [
    'pages-ui',
    'pages',
    'blocks',
    'blocks-ui',
    'ui',
    'renderer-svelte',
    'blueprint',
    'core',
  ]) {
    await symlink(join(ROOT, 'packages', name), join(scope, name), 'dir');
  }
  await symlink(join(ROOT, 'node_modules/svelte'), join(fixture, 'node_modules/svelte'), 'dir');

  const previousEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    for (const host of HOSTS) {
      await writeHostFixture(host);
      const result = await build({
        mode: 'production',
        root: fixture,
        configFile: false,
        logLevel: 'silent',
        plugins: [svelte()],
        build: {
          outDir: join(fixture, 'dist', host),
          emptyOutDir: true,
          rollupOptions: { input: join(fixture, `${host}.html`) },
        },
      });
      const output = ((Array.isArray(result) ? result : [result]) as Rollup.RollupOutput[]).flatMap(
        (item) => item.output
      );
      builds.set(host, {
        chunks: output.filter((item): item is Rollup.OutputChunk => item.type === 'chunk'),
        assets: output.filter((item): item is Rollup.OutputAsset => item.type === 'asset'),
      });
    }
  } finally {
    process.env.NODE_ENV = previousEnv;
  }
}, 600_000);

afterAll(async () => {
  if (fixture) await rm(fixture, { recursive: true, force: true });
});

describe('page and doc entry budgets (real production Vite builds)', () => {
  it('keeps the page and doc initial JS and CSS inside their budgets', () => {
    for (const host of HOSTS) {
      const output = builds.get(host);
      expect(output, `${host} production build`).toBeDefined();
      const chunks = output?.chunks ?? [];
      const entry = chunks.find((chunk) => chunk.isEntry);
      expect(entry, `${host} entry chunk`).toBeDefined();
      const initial = staticChunks(chunks, entry?.fileName ?? '');
      const jsBytes = initial.reduce((total, chunk) => total + gzip(chunk.code), 0);
      const cssBytes = (output?.assets ?? [])
        .filter((asset) => asset.fileName.endsWith('.css'))
        .reduce((total, asset) => total + gzip(asset.source), 0);
      const initialCss = new Set(
        initial.flatMap((chunk) => [...(chunk.viteMetadata?.importedCss ?? [])])
      );
      const initialCssBytes = (output?.assets ?? [])
        .filter((asset) => initialCss.has(asset.fileName))
        .reduce((total, asset) => total + gzip(asset.source), 0);
      const modules = initial
        .flatMap((chunk) => chunk.moduleIds)
        .map((id) => id.replaceAll('\\', '/'));

      console.info(
        `${host} entry: ${jsBytes} B JS gzip, ${initialCssBytes} B initial CSS gzip, ${cssBytes} B CSS gzip in every stylesheet`
      );
      expect(initial.length, `${host} static JS chunks`).toBeGreaterThan(0);
      expect(jsBytes, `${host} initial JS gzip`).toBeLessThanOrEqual(JS_GZIP_BUDGET);
      expect(initialCssBytes, `${host} initial CSS gzip`).toBeGreaterThan(0);
      expect(initialCssBytes, `${host} initial CSS gzip`).toBeLessThanOrEqual(
        INITIAL_CSS_GZIP_BUDGETS[host]
      );
      expect(cssBytes, `${host} CSS gzip, every stylesheet`).toBeLessThanOrEqual(
        CSS_GZIP_BUDGETS[host]
      );

      const forbidden = [
        ['crud/app', /\/crud\/src\/(?:app|screens)\//],
        ['Faker', /@faker-js\/faker/],
        ['player worker', /\/player\/src\/.*worker|generate-world.*worker/],
        // The doc editor and the document writers load on first use only.
        ['@texuli/pages', /@texuli\/pages\//],
        ['@texuli/document', /@texuli\/document\//],
        ['doc editor', /\/pages-ui\/src\/doc\/(?:DocEditor\.svelte|doc-export\.ts)/],
      ] as const;
      for (const [label, pattern] of forbidden) {
        expect(
          modules.filter((id) => pattern.test(id)),
          `${host} excludes ${label}`
        ).toEqual([]);
      }
    }
  });
});
