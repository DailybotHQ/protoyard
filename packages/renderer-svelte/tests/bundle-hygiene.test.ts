// @vitest-environment node
import { readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { build, type Rollup } from 'vite';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * Root renders `<Toaster />`, so `@protoyard/ui` is always in a prototype's
 * entry chunk. A dynamic `import('@protoyard/ui')` anywhere (for example inside
 * a lazy shell frame) turns that barrel into a shared chunk the entry loads,
 * and every member read from it lands in EVERY prototype's initial JS. This
 * pulled WindowChrome and BrowserChrome into initial bundles (about 37 KB
 * gzip on crm-demo). Lazy modules import ui statically instead: they are
 * already lazy.
 */
const ROOT = resolve(import.meta.dirname, '../../..');
const SCANNED = ['packages', 'prototypes', 'templates', 'apps'];
const SKIP = new Set(['node_modules', 'dist', 'tests', '.astro']);
const SOURCE = /\.(ts|svelte|astro|js)$/;

/** Gzip-9 caps recorded in docs/PERFORMANCE.md. */
export const LAYOUT_BUNDLE_BUDGETS = {
  /**
   * LayoutHost plus registry/preload overhead in the initial app path. Was
   * 2,000 B; the host now wraps texuli's (texuli's host, catalog and host CSS
   * next to Protoyard's catalog): measured 3,498 B, cap 3,600 B
   * (T-adopt-layouts; docs/PERFORMANCE.md).
   */
  hostInitialDelta: 3_600,
};

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sourceFiles(path, out);
    else if (SOURCE.test(name)) out.push(path);
  }
  return out;
}

type BuiltOutput = { chunks: Rollup.OutputChunk[] };
let fixtureDir: string | undefined;

const gzip = (code: string) => gzipSync(code, { level: 9 }).length;
const posix = (id: string) => id.replaceAll('\\', '/');

function closure(output: readonly Rollup.OutputChunk[], start: Rollup.OutputChunk) {
  const byFile = new Map(output.map((chunk) => [chunk.fileName, chunk]));
  const seen = new Set<string>();
  const queue = [start.fileName];
  while (queue.length > 0) {
    const file = queue.pop() as string;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const next of byFile.get(file)?.imports ?? []) queue.push(next);
  }
  return [...seen].map((file) => byFile.get(file) as Rollup.OutputChunk);
}

function entryChunks(output: readonly Rollup.OutputChunk[], name: string) {
  const entry = output.find((chunk) => chunk.isEntry && chunk.name === name);
  if (!entry) throw new Error(`no ${name} entry`);
  return closure(output, entry);
}

async function buildLayoutFixture(): Promise<{ dir: string; output: BuiltOutput }> {
  const dir = await mkdtemp(join(tmpdir(), 'protoyard-layout-bundle-'));
  fixtureDir = dir;
  const write = (name: string, contents: string) => writeFile(join(dir, name), contents);
  await mkdir(join(dir, 'node_modules/@protoyard'), { recursive: true });
  await symlink(join(ROOT, 'packages/ui'), join(dir, 'node_modules/@protoyard/ui'), 'dir');
  await symlink(join(ROOT, 'packages/core'), join(dir, 'node_modules/@protoyard/core'), 'dir');
  await symlink(join(ROOT, 'packages/themes'), join(dir, 'node_modules/@protoyard/themes'), 'dir');
  await symlink(join(ROOT, 'node_modules/svelte'), join(dir, 'node_modules/svelte'), 'dir');

  await write('index.html', '<div id="app"></div><script type="module" src="/app.ts"></script>');
  await write(
    'baseline.html',
    '<div id="app"></div><script type="module" src="/baseline.ts"></script>'
  );
  await write(
    'app.ts',
    "import { mount } from 'svelte'; import App from './App.svelte'; mount(App, { target: document.getElementById('app') as HTMLElement });"
  );
  await write(
    'baseline.ts',
    "import { mount } from 'svelte'; import Baseline from './Baseline.svelte'; mount(Baseline, { target: document.getElementById('app') as HTMLElement });"
  );
  await write(
    'App.svelte',
    `<script lang="ts">\nimport { Button, LayoutHost } from '@protoyard/ui';\nimport { BUILTIN_THEMES, mergeThemes } from '@protoyard/themes';\nconst themeCount = mergeThemes(BUILTIN_THEMES).length;\nasync function loadLibrary() { await import('@protoyard/themes/library'); }\n</script>\n<LayoutHost layout="custom">\n  {#snippet children()}<Button>Prototype screen</Button>{/snippet}\n</LayoutHost>\n<button data-theme-count={themeCount} onclick={loadLibrary}>Load theme library</button>\n`
  );
  await write(
    'Baseline.svelte',
    `<script lang="ts">\nimport { Button } from '@protoyard/ui';\nimport { layoutForWidth } from '@protoyard/core';\nimport { BUILTIN_THEMES, mergeThemes } from '@protoyard/themes';\nconst layout = layoutForWidth('custom', window.innerWidth);\nconst themeCount = mergeThemes(BUILTIN_THEMES).length;\nasync function loadLibrary() { await import('@protoyard/themes/library'); }\n</script>\n<main data-layout={layout}><Button>Prototype screen</Button></main>\n<button data-theme-count={themeCount} onclick={loadLibrary}>Load theme library</button>\n`
  );

  const previousEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  let result: Rollup.RollupOutput[];
  try {
    const built = await build({
      mode: 'production',
      root: dir,
      configFile: false,
      logLevel: 'silent',
      plugins: [svelte()],
      build: {
        outDir: join(dir, 'dist'),
        emptyOutDir: true,
        sourcemap: true,
        rollupOptions: {
          input: {
            app: join(dir, 'index.html'),
            baseline: join(dir, 'baseline.html'),
          },
        },
      },
    });
    result = (Array.isArray(built) ? built : [built]) as Rollup.RollupOutput[];
  } finally {
    process.env.NODE_ENV = previousEnv;
  }
  const all = result.flatMap((item) => item.output);
  return {
    dir,
    output: {
      chunks: all.filter((item): item is Rollup.OutputChunk => item.type === 'chunk'),
    },
  };
}

afterAll(async () => {
  if (fixtureDir) await rm(fixtureDir, { recursive: true, force: true });
});

describe('bundle hygiene', () => {
  it('never imports @protoyard/ui dynamically (it would bloat every initial chunk)', () => {
    const offenders = SCANNED.flatMap((top) => sourceFiles(join(ROOT, top)))
      .filter((file) => /import\(\s*['"]@protoyard\/ui['"]\s*\)/.test(readFileSync(file, 'utf8')))
      .map((file) => relative(ROOT, file));
    expect(offenders).toEqual([]);
  });

  it('keeps Svelte layout components out of the eager layout registry', () => {
    const registry = readFileSync(join(ROOT, 'packages/ui/src/layouts/registry.ts'), 'utf8');
    expect(registry).not.toMatch(/(?:^|\n)\s*import\s+.*\.svelte['"]/);
    expect(registry).not.toMatch(/from\s+['"]@protoyard\/ui['"]/);
  });

  it('never imports the @protoyard/themes barrel dynamically (it is already in every entry chunk)', () => {
    const offenders = SCANNED.flatMap((top) => sourceFiles(join(ROOT, top)))
      .filter((file) =>
        /import\(\s*['"]@protoyard\/themes['"]\s*\)/.test(readFileSync(file, 'utf8'))
      )
      .map((file) => relative(ROOT, file));
    expect(offenders).toEqual([]);
  });

  it('keeps the theme library out of the boot path: renderer, runtime and core load it only lazily', () => {
    const boot = ['packages/renderer-svelte/src', 'packages/runtime/src', 'packages/core/src'];
    const files = boot.flatMap((dir) => sourceFiles(join(ROOT, dir)));
    const staticImport =
      /(?:^|\n)\s*import\s+(?!type\b)[^;]*from\s*['"]@protoyard\/themes\/library['"]|import\s*['"]@protoyard\/themes\/library['"]/;
    const offenders = files
      .filter((file) => staticImport.test(readFileSync(file, 'utf8')))
      .map((file) => relative(ROOT, file));
    expect(offenders).toEqual([]);
    // The one way in: mount.ts imports the subpath on first use.
    const mount = readFileSync(join(ROOT, 'packages/renderer-svelte/src/mount.ts'), 'utf8');
    expect(mount).toMatch(/await import\(['"]@protoyard\/themes\/library['"]\)/);
  });

  it('reaches review UI only through the renderer’s guarded mount import', () => {
    const files = SCANNED.flatMap((top) => sourceFiles(join(ROOT, top)));
    const staticImports = files
      .filter((file) =>
        /(?:from\s*|import\s*)['"]@protoyard\/review-ui\//.test(readFileSync(file, 'utf8'))
      )
      .map((file) => relative(ROOT, file));
    expect(staticImports).toEqual([]);
    const dynamicImports = files.flatMap((file) => {
      const source = readFileSync(file, 'utf8');
      return [...source.matchAll(/import\(\s*['"]@protoyard\/review-ui\/[^'"]+['"]\s*\)/g)].map(
        () => relative(ROOT, file)
      );
    });
    expect(dynamicImports).toEqual(['packages/renderer-svelte/src/mount.ts']);
  });

  it('scans real sources (a scan that finds nothing proves nothing)', () => {
    const files = sourceFiles(join(ROOT, 'packages/renderer-svelte/src'));
    expect(files.some((f) => f.endsWith('ExtensionPopupFrame.svelte'))).toBe(true);
  });

  it('keeps layouts and library themes lazy in a custom-layout production fixture', async () => {
    const { dir, output } = await buildLayoutFixture();
    try {
      const initial = entryChunks(output.chunks, 'app');
      const baseline = entryChunks(output.chunks, 'baseline');
      const initialModules = initial.flatMap((chunk) => chunk.moduleIds).map(posix);
      const initialCode = initial.map((chunk) => chunk.code).join('\n');
      // texuli renders every layout but docs, which is still Protoyard's.
      const texuliLayouts = posix(
        realpathSync(join(ROOT, 'node_modules', 'texuli', 'src', 'layouts'))
      );
      const expectedLayoutPaths = new Set([
        ...[
          'app/DualSidebarLayout.svelte',
          'app/MasterDetailLayout.svelte',
          'app/RailLayout.svelte',
          'app/SidebarLayout.svelte',
          'app/TopNavLayout.svelte',
          'auth-settings/AuthSplitHostLayout.svelte',
          'auth-settings/WizardHostLayout.svelte',
          'dashboard/DashboardGridLayout.svelte',
          'marketing/MarketingLayout.svelte',
          'mobile/MobileDrawerLayout.svelte',
          'mobile/MobileTabsLayout.svelte',
        ].map((file) => `${texuliLayouts}/${file}`),
        `${ROOT}/packages/ui/src/layouts/DocsLayout.svelte`,
      ]);
      const layoutModules = output.chunks.flatMap((chunk) =>
        chunk.moduleIds.filter((id) => expectedLayoutPaths.has(posix(id)))
      );
      const lazyLayouts = layoutModules.map(posix).sort();

      expect(lazyLayouts).toEqual([...expectedLayoutPaths].sort());
      expect(initialModules.filter((id) => expectedLayoutPaths.has(id))).toEqual([]);
      const layoutOwners = layoutModules.map((id) => {
        const owner = output.chunks.find((chunk) => chunk.moduleIds.includes(id));
        if (!owner) throw new Error(`no output chunk for ${id}`);
        return owner;
      });
      expect(new Set(layoutOwners.map((chunk) => chunk.fileName)).size).toBe(
        expectedLayoutPaths.size
      );
      expect(
        initialModules.filter((id) =>
          /\/packages\/themes\/src\/(?:palette|oklch|library)\//.test(id)
        )
      ).toEqual([]);
      // Nor Texuli's theme library, builder, generator or AA gate (@texuli/tokens).
      expect(
        initialModules.filter((id) =>
          /\/tokens\/src\/(?:library-port|library-expand|generator|aa-gate)\//.test(id)
        )
      ).toEqual([]);
      expect(initialCode).not.toMatch(
        /data-py-(?:sidebar|rail|top-nav|dual-sidebar|master-detail|dashboard-grid|docs|marketing|mobile-tabs|mobile-drawer|wizard|auth-split)-layout/
      );
      expect(initialCode).not.toMatch(/(?:THEME_LIBRARY_META|THEME_COLLECTIONS|loadLibraryTheme)/);

      const initialSize = (chunks: readonly Rollup.OutputChunk[]) =>
        chunks.reduce((total, chunk) => total + gzip(chunk.code), 0);
      const hostDelta = initialSize(initial) - initialSize(baseline);
      const layoutSizes = Object.fromEntries(
        layoutModules.map((id) => {
          const owner = output.chunks.find((chunk) => chunk.moduleIds.includes(id));
          if (!owner) throw new Error(`no output chunk for ${id}`);
          return [posix(id).split('/').at(-1), gzip(owner.code)];
        })
      );
      const libraryChunks = output.chunks.filter((chunk) =>
        chunk.moduleIds.some((id) => posix(id).includes('/packages/themes/src/library/'))
      );
      const libraryEntry = libraryChunks.find((chunk) =>
        chunk.moduleIds.some((id) => posix(id).endsWith('/packages/themes/src/library/registry.ts'))
      );
      if (!libraryEntry) throw new Error('no theme library metadata chunk');
      // Library themes are built by @texuli/tokens, lazily, outside the metadata chunk.
      const libraryBuild = output.chunks.find((chunk) =>
        chunk.moduleIds.some((id) => posix(id).endsWith('/tokens/src/library-port/build.ts'))
      );
      if (!libraryBuild) throw new Error('no lazy theme library builder chunk');
      const studioSource = readFileSync(
        join(ROOT, 'packages/devtools/src/sections/AppearanceSection.svelte'),
        'utf8'
      );
      expect(studioSource).toMatch(/import\(['"]\.\/ThemeStudioSection\.svelte['"]\)/);
      console.info(
        `layout bundle guard (gzip -9): host delta ${hostDelta} B; layouts ${JSON.stringify(layoutSizes)}; library metadata ${gzip(libraryEntry.code)} B; library builder ${gzip(libraryBuild.code)} B`
      );
      expect(hostDelta).toBeLessThanOrEqual(LAYOUT_BUNDLE_BUDGETS.hostInitialDelta);
      expect(libraryEntry).toBeDefined();
      expect(libraryBuild).toBeDefined();
    } finally {
      await rm(dir, { recursive: true, force: true });
      fixtureDir = undefined;
    }
  }, 240_000);
});
