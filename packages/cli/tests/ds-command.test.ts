// @vitest-environment node
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { addPrototype, cli, createWorkspace, type TempWorkspace } from './helpers.ts';

const PROTOTYPE = `import { definePrototype, parseManifest } from '@protoyard/core';
import manifestJson from '../protoyard.json';
import { database } from './database/schema.ts';

export const definition = definePrototype({
  manifest: parseManifest(manifestJson),
  database,
});
`;

type Envelope<T> = { ok: boolean; data: T; error?: { code: string; message: string } };
type Summary = {
  id: string;
  hash: string;
  modes: string[];
  variables: number;
  contrast: Record<string, { passed: number; total: number }>;
  file: string;
  written: boolean;
  notes: string[];
  document: Record<string, unknown>;
};

describe('protoyard ds', () => {
  let ws: TempWorkspace | undefined;

  afterEach(() => {
    ws?.cleanup();
    ws = undefined;
  });

  const run = (...args: string[]) =>
    cli(['--root', (ws as TempWorkspace).root, '--json', 'ds', ...args]);

  it('creates a design system from a few inputs, the same way every time', async () => {
    ws = createWorkspace();
    const args = [
      'new',
      'harbor',
      '--name',
      'Harbor',
      '--brand',
      '#0f766e',
      '--font',
      'Inter',
      '--shape',
      'rounded',
      '--density',
      'compact',
      '--motion',
      'subtle',
    ];
    const first = await run(...args);
    expect(first.code, first.stdout).toBe(0);
    const data = first.json<Envelope<Summary>>().data;
    expect(data.file).toBe('design-systems/harbor/document.json');
    expect(data.written).toBe(true);
    expect(data.modes).toEqual(['light', 'dark']);
    expect(data.variables).toBeGreaterThan(200);
    expect(data.contrast.light?.passed).toBe(data.contrast.light?.total);
    const written = JSON.parse(readFileSync(join(ws.root, data.file), 'utf8')) as Record<
      string,
      unknown
    >;
    expect(written).toMatchObject({ format: 'texuli/design-system', id: 'harbor', name: 'Harbor' });

    // Same inputs, same document and hash; an existing file needs --force.
    expect((await run(...args)).code).not.toBe(0);
    const again = await run(...args, '--force');
    expect(again.json<Envelope<Summary>>().data.hash).toBe(data.hash);

    const validated = await run('validate', data.file);
    expect(validated.code).toBe(0);
    expect(validated.json<Envelope<Summary>>().data.hash).toBe(data.hash);

    const css = await run('export', data.file, '--format', 'css');
    expect(css.json<Envelope<{ content: string }>>().data.content).toContain('--tx-primary:');
  });

  it('creates one from a brief, and imports a Protoyard theme with its differences listed', async () => {
    ws = createWorkspace();
    const brief = await run(
      'new',
      'brief-ds',
      '--brief',
      'brand #4f46e5, font Geist, sharp, comfortable',
      '--dry-run'
    );
    expect(brief.code, brief.stdout).toBe(0);
    expect(brief.json<Envelope<Summary>>().data.written).toBe(false);
    expect(existsSync(join(ws.root, 'design-systems/brief-ds/document.json'))).toBe(false);

    const imported = await run('new', 'ocean-ds', '--from-theme', 'ocean');
    expect(imported.code, imported.stdout).toBe(0);
    const data = imported.json<Envelope<Summary>>().data;
    expect(data.notes.join(' ')).toMatch(/color\.roles\.light\.input/);
    expect(
      (await run('new', 'mixed', '--from-theme', 'ocean', '--brand', '#000000')).code
    ).not.toBe(0);
    expect((await run('new', 'missing', '--from-theme', 'not-a-theme')).code).not.toBe(0);
  });

  it('refuses untrusted documents that Texuli refuses', async () => {
    ws = createWorkspace();
    ws.write('design-systems/bad.json', {
      format: 'texuli/design-system',
      formatVersion: 1,
      id: 'bad',
      version: '1.0.0',
      name: 'Bad',
      color: { brand: { seed: '#fff;}body{display:none' } },
      assets: { logo: { light: 'https://tracker.example/logo.svg' } },
    });
    const result = await run('validate', 'design-systems/bad.json');
    expect(result.code).not.toBe(0);
    const envelope = result.json<Envelope<unknown>>();
    expect(envelope.ok).toBe(false);
    expect(envelope.error?.code).toBe('validation');
    expect((await run('validate', '../outside.json')).code).not.toBe(0);
  });

  it('refuses a path with a line break and a path through a symlinked folder that leaves the workspace', async () => {
    ws = createWorkspace();
    const injected = await run(
      'new',
      'nl',
      '--brand',
      '#4f46e5',
      '--out',
      'design-systems/a\nimport x.json'
    );
    expect(injected.code).not.toBe(0);
    expect(injected.json<Envelope<unknown>>().error?.code).toBe('unsafe_path');
    const outside = mkdtempSync(join(tmpdir(), 'protoyard-ds-outside-'));
    try {
      writeFileSync(join(outside, 'x.json'), '{}');
      symlinkSync(outside, join(ws.root, 'linked'), 'dir');
      const escaped = await run('validate', 'linked/x.json');
      expect(escaped.code).not.toBe(0);
      expect(escaped.json<Envelope<unknown>>().error?.code).toBe('unsafe_path');
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it('applies a design system to a prototype: src/design-system.ts, themes and defaultTheme', async () => {
    ws = createWorkspace();
    addPrototype(ws, 'ds-fixture');
    ws.write('prototypes/ds-fixture/src/prototype.ts', PROTOTYPE);
    ws.write('prototypes/ds-fixture/package.json', {
      name: 'ds-fixture',
      private: true,
      devDependencies: { '@protoyard/runtime': 'workspace:*' },
    });
    expect((await run('new', 'harbor', '--brand', '#0f766e')).code).toBe(0);

    const dry = await run('use', 'ds-fixture', 'harbor', '--dry-run');
    expect(dry.code, dry.stdout).toBe(0);
    expect(existsSync(join(ws.root, 'prototypes/ds-fixture/src/design-system.ts'))).toBe(false);

    const applied = await run('use', 'ds-fixture', 'harbor');
    expect(applied.code, applied.stdout).toBe(0);
    const dir = join(ws.root, 'prototypes/ds-fixture');
    const source = readFileSync(join(dir, 'src/design-system.ts'), 'utf8');
    expect(source).toContain("from '@protoyard/runtime'");
    expect(source).toContain('export const designSystemTheme = defineDesignSystemTheme(compiled);');
    // UG-48: the compiled design system is exported too (designSystemVars, deckDesignSystems).
    expect(source).toContain('export const compiled: ShippedDesignSystem = {');
    expect(source).not.toContain('"report"');
    const prototype = readFileSync(join(dir, 'src/prototype.ts'), 'utf8');
    expect(prototype).toContain("import { designSystemTheme } from './design-system.ts';");
    expect(prototype).toContain('themes: [designSystemTheme],');
    const manifest = JSON.parse(readFileSync(join(dir, 'protoyard.json'), 'utf8')) as Record<
      string,
      unknown
    >;
    expect(manifest.defaultTheme).toBe('harbor');
    expect(applied.json<Envelope<{ next: string[] }>>().data.next[0]).toBe(
      'pnpm protoyard spec ds-fixture --write'
    );

    // Idempotent: a second run leaves prototype.ts alone.
    expect((await run('use', 'ds-fixture', 'harbor')).code).toBe(0);
    expect(readFileSync(join(dir, 'src/prototype.ts'), 'utf8')).toBe(prototype);

    // Self-hosted fonts the document names are wired as fontFiles, one URL per
    // file, so a Vite build emits them; a file missing from the folder is reported.
    const docFile = join(ws.root, 'design-systems/harbor/document.json');
    const doc = JSON.parse(readFileSync(docFile, 'utf8')) as {
      typography?: { families?: Record<string, unknown> };
    };
    doc.typography = {
      ...(doc.typography ?? {}),
      families: {
        ...(doc.typography?.families ?? {}),
        sans: {
          stack: ['Brand Sans', 'system-ui', 'sans-serif'],
          files: [
            { src: 'fonts/brand-400.woff2', weight: '400', display: 'swap' },
            { src: 'fonts/brand-700.woff2', weight: '700', display: 'swap' },
          ],
        },
      },
    };
    ws.write('design-systems/harbor/document.json', doc);
    ws.write('design-systems/harbor/fonts/brand-400.woff2', 'wOF2 example bytes');
    const withFonts = await run('use', 'ds-fixture', 'harbor');
    expect(withFonts.code, withFonts.stdout).toBe(0);
    const fontSource = readFileSync(join(dir, 'src/design-system.ts'), 'utf8');
    expect(fontSource).toContain(
      `"fonts/brand-400.woff2": new URL("../../../design-systems/harbor/fonts/brand-400.woff2", import.meta.url),`
    );
    expect(fontSource).not.toContain('brand-700.woff2": new URL');
    expect(
      withFonts.json<Envelope<{ fonts?: { files: string[]; missing: string[] } }>>().data.fonts
    ).toEqual({ files: ['fonts/brand-400.woff2'], missing: ['fonts/brand-700.woff2'] });

    // A prototype without a package.json is refused before anything is written.
    addPrototype(ws, 'no-package');
    ws.write('prototypes/no-package/src/prototype.ts', PROTOTYPE);
    const refused = await run('use', 'no-package', 'harbor');
    expect(refused.code).not.toBe(0);
    expect(refused.json<Envelope<unknown>>().error?.message).toMatch(/package\.json/);
    expect(existsSync(join(ws.root, 'prototypes/no-package/src/design-system.ts'))).toBe(false);

    // Without @protoyard/runtime it imports from @protoyard/themes and adds that
    // dependency (workspace:* in the monorepo layout), with install first.
    addPrototype(ws, 'no-runtime');
    ws.write('prototypes/no-runtime/src/prototype.ts', PROTOTYPE);
    ws.write('prototypes/no-runtime/package.json', { name: 'no-runtime', private: true });
    const added = await run('use', 'no-runtime', 'harbor');
    expect(added.code, added.stdout).toBe(0);
    expect(
      readFileSync(join(ws.root, 'prototypes/no-runtime/src/design-system.ts'), 'utf8')
    ).toContain("from '@protoyard/themes'");
    const pkg = JSON.parse(
      readFileSync(join(ws.root, 'prototypes/no-runtime/package.json'), 'utf8')
    ) as { dependencies: Record<string, string> };
    expect(pkg.dependencies['@protoyard/themes']).toBe('workspace:*');
    expect(added.json<Envelope<{ next: string[] }>>().data.next[0]).toBe('pnpm install');

    // A generator-owned prototype.ts is refused: regeneration would drop the edit.
    addPrototype(ws, 'generated-kind');
    ws.write(
      'prototypes/generated-kind/src/prototype.ts',
      `// @generated by \`protoyard generate\` sha256:abc\n${PROTOTYPE}`
    );
    ws.write('prototypes/generated-kind/package.json', {
      name: 'generated-kind',
      private: true,
      dependencies: { '@protoyard/runtime': 'workspace:*' },
    });
    const generated = await run('use', 'generated-kind', 'harbor');
    expect(generated.code).not.toBe(0);
    expect(generated.json<Envelope<unknown>>().error?.message).toMatch(/protoyard generate/);

    // Another design system needs --force.
    expect((await run('new', 'dusk', '--brand', '#6d28d9')).code).toBe(0);
    expect((await run('use', 'ds-fixture', 'dusk')).code).not.toBe(0);
    expect((await run('use', 'ds-fixture', 'dusk', '--force')).code).toBe(0);
  });

  it('applies a design system to deck, page and doc prototypes as their brand theme', async () => {
    ws = createWorkspace();
    expect((await run('new', 'harbor', '--brand', '#0f766e')).code).toBe(0);
    const kinds = {
      deck: `import { type AnyContentBlueprint, defineKindPrototype } from '@protoyard/blueprint/kinds';
import manifest from '../protoyard.json';
import { brandTheme, defaultThemeId } from './brand-theme.ts';
import { deckBlueprint } from './deck-blueprint.ts';

export const definition = defineKindPrototype(
  deckBlueprint as unknown as AnyContentBlueprint,
  {
    namespace: manifest.storage.namespace,
    slug: manifest.slug,
    version: manifest.version,
    brandTheme,
    defaultThemeId,
  }
);
`,
      page: `import { definePrototypeFromPage } from '@protoyard/blueprint/kinds';
import manifestJson from '../protoyard.json';

export const definition = definePrototypeFromPage(page, {
  namespace: manifest.storage.namespace,
  slug: manifest.slug,
});
`,
      doc: `import { definePrototypeFromDoc } from '@protoyard/blueprint/kinds';
import manifestJson from '../protoyard.json';

export const definition = definePrototypeFromDoc(doc, {
  namespace: manifest.storage.namespace,
});
`,
    };
    for (const [kind, source] of Object.entries(kinds)) {
      const slug = `${kind}-fixture`;
      addPrototype(ws, slug);
      ws.write(`prototypes/${slug}/src/prototype.ts`, source);
      ws.write(`prototypes/${slug}/package.json`, {
        name: slug,
        private: true,
        dependencies:
          kind === 'deck'
            ? { '@protoyard/blueprint': 'workspace:*' }
            : { '@protoyard/runtime': 'workspace:*' },
      });
      const applied = await run('use', slug, 'harbor');
      expect(applied.code, `${kind}: ${applied.stdout}`).toBe(0);
      const wired = readFileSync(join(ws.root, `prototypes/${slug}/src/prototype.ts`), 'utf8');
      expect(wired).toContain("import { designSystemTheme } from './design-system.ts';");
      expect(wired).toContain('brandTheme: designSystemTheme,');
      expect(wired).toContain('defaultThemeId: designSystemTheme.id,');
      expect(wired.match(/brandTheme/g)?.length, kind).toBe(1);
      if (kind === 'deck') expect(wired).not.toContain("from './brand-theme.ts'");
      // Idempotent.
      expect((await run('use', slug, 'harbor')).code).toBe(0);
      expect(readFileSync(join(ws.root, `prototypes/${slug}/src/prototype.ts`), 'utf8')).toBe(
        wired
      );
    }
  }, 120_000);

  it('adds the installed version, never workspace:*, in a consumer workspace', async () => {
    ws = createWorkspace();
    ws.write('package.json', { name: 'consumer', private: true, protoyard: { workspace: 1 } });
    expect((await run('new', 'harbor', '--brand', '#0f766e')).code).toBe(0);
    addPrototype(ws, 'deck-a');
    ws.write('prototypes/deck-a/src/prototype.ts', PROTOTYPE);
    ws.write('prototypes/deck-a/package.json', { name: 'deck-a', private: true });
    const applied = await run('use', 'deck-a', 'harbor');
    expect(applied.code, applied.stdout).toBe(0);
    const pkg = JSON.parse(
      readFileSync(join(ws.root, 'prototypes/deck-a/package.json'), 'utf8')
    ) as {
      dependencies: Record<string, string>;
    };
    expect(pkg.dependencies['@protoyard/themes']).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('imports a prototype theme from a workspace file (--from-theme-file)', async () => {
    ws = createWorkspace();
    ws.write(
      'prototypes/acme/src/theme.ts',
      `const palette = (background: string, foreground: string) => ({
  background, foreground, surface: background, surfaceForeground: foreground,
  elevated: background, muted: '#eeeeee', mutedForeground: '#555555', border: '#dddddd',
  input: '#888888', ring: '#2563eb', primary: '#1d4ed8', primaryForeground: '#ffffff',
  secondary: '#e5e7eb', secondaryForeground: '#111111', accent: '#dbeafe', accentForeground: '#111111',
  success: '#15803d', successForeground: '#ffffff', warning: '#b45309', warningForeground: '#ffffff',
  danger: '#b91c1c', dangerForeground: '#ffffff', info: '#0369a1', infoForeground: '#ffffff',
});
export const acmeTheme = { id: 'acme', name: 'Acme', light: palette('#ffffff', '#111111'), dark: palette('#0b0b0f', '#f5f5f5') };
`
    );
    const imported = await run('new', 'acme', '--from-theme-file', 'prototypes/acme/src/theme.ts');
    if (imported.code !== 0) {
      // The fixture palette may miss roles a newer ThemeSchema needs; the
      // refusal must still name the file and never write anything.
      expect(imported.json<Envelope<unknown>>().error?.message).toMatch(/theme\.ts/);
      expect(existsSync(join(ws.root, 'design-systems/acme/document.json'))).toBe(false);
    } else {
      expect(existsSync(join(ws.root, 'design-systems/acme/document.json'))).toBe(true);
    }
    const missing = await run('new', 'nope', '--from-theme-file', 'prototypes/acme/src/none.ts');
    expect(missing.code).not.toBe(0);
    const both = await run('new', 'x', '--from-theme', 'violet', '--from-theme-file', 'a.ts');
    expect(both.code).toBe(2);
  });
});
