// @vitest-environment node
import { cpSync, existsSync, readdirSync, readFileSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cli, createWorkspace, type TempWorkspace } from './helpers.ts';

/*
 * Generated page and doc prototypes build with the player's full stylesheet.
 * They once shipped about 7 KB of CSS (only @protoyard/ui, no Tailwind layer
 * or theme tokens) and rendered as raw HTML, and their App imported the deck
 * template's embed host by a path that does not exist inside prototypes/.
 *
 * Each case generates the real example blueprint into a temporary workspace,
 * links the template's installed dependencies, and runs a production Vite
 * build. The form behavior at level 2 is proven in templates/page/tests.
 */

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const CASES = {
  page: { slug: 'tidewater-page', blueprint: 'blueprints/pages/tidewater-roasters-landing.json' },
  doc: { slug: 'northwind-doc', blueprint: 'blueprints/docs/northwind-quarterly-report.json' },
} as const;
type Kind = keyof typeof CASES;

let ws: TempWorkspace;
const css: Partial<Record<Kind, string>> = {};

beforeAll(async () => {
  ws = createWorkspace();
  cpSync(join(REPO_ROOT, 'tsconfig.base.json'), join(ws.root, 'tsconfig.base.json'));
  for (const kind of Object.keys(CASES) as Kind[]) {
    cpSync(join(REPO_ROOT, 'templates', kind), join(ws.root, 'templates', kind), {
      recursive: true,
      filter: (source) => !/[/\\](node_modules|dist)([/\\]|$)/.test(source),
    });
  }
  for (const [kind, { slug, blueprint }] of Object.entries(CASES) as [
    Kind,
    (typeof CASES)[Kind],
  ][]) {
    const run = await cli([
      '--root',
      ws.root,
      '--json',
      'generate',
      slug,
      '--blueprint',
      join(REPO_ROOT, blueprint),
      '--no-install',
    ]);
    expect(run.code, run.stderr).toBe(0);
    const dir = join(ws.root, 'prototypes', slug);
    // The template's own installed dependencies, as pnpm would link them.
    symlinkSync(
      join(REPO_ROOT, 'templates', kind, 'node_modules'),
      join(dir, 'node_modules'),
      'dir'
    );
    await build({
      root: dir,
      configFile: join(dir, 'vite.config.ts'),
      logLevel: 'silent',
      build: { outDir: join(dir, 'dist'), emptyOutDir: true },
    });
    const assets = join(dir, 'dist', 'assets');
    const entryCss = readdirSync(assets).find((file) => /^index-[\w-]+\.css$/.test(file));
    expect(entryCss, `${kind} entry stylesheet`).toBeDefined();
    css[kind] = readFileSync(join(assets, entryCss as string), 'utf8');
  }
}, 600_000);

afterAll(() => ws?.cleanup());

describe('generated page and doc prototypes', () => {
  it.each(Object.keys(CASES) as Kind[])('%s ships the Tailwind layers and theme tokens', (kind) => {
    const sheet = css[kind] ?? '';
    // Tailwind 4 layers and the theme tokens from @protoyard/renderer-svelte/app.css.
    expect(sheet).toMatch(/@layer theme/);
    expect(sheet).toMatch(/@layer utilities/);
    expect(sheet).toContain('--color-primary');
    expect(sheet).toContain('--tx-primary');
    // Utilities used only by the kit renderers, so their Tailwind sources were scanned.
    expect(sheet).toMatch(/\.max-w-\\\[11rem\\\]/); // pages-ui landing header
    expect(sheet).toMatch(/\.shadow-soft/); // @protoyard/ui and blocks-ui cards
    // The broken build was about 7 KB.
    expect(sheet.length).toBeGreaterThan(80_000);
  });

  it.each(Object.keys(CASES) as Kind[])('%s App imports its own embed host', (kind) => {
    const app = readFileSync(
      join(ws.root, 'prototypes', CASES[kind].slug, 'src/App.svelte'),
      'utf8'
    );
    expect(app).toContain("from './embed-host.ts'");
    expect(app).not.toMatch(/from '\.\.\/\.\.\//);
    expect(existsSync(join(ws.root, 'prototypes', CASES[kind].slug, 'src/embed-host.ts'))).toBe(
      true
    );
  });
});
