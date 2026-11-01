import { ThemeSchema } from '@protoyard/core';
import { afterEach, describe, expect, it } from 'vitest';
import {
  applyAppearance,
  clearAppearance,
  compileDesignSystemDocument,
  createDesignSystem,
  defineDesignSystemTheme,
  designSystemBrief,
  designSystemFromTheme,
  forgetDesignSystemTheme,
  hasDesignSystemPainter,
  oceanTheme,
  type ShippedDesignSystem,
  violetTheme,
} from '../src/index.ts';
import { loadAllLibraryThemes, THEME_LIBRARY_META } from '../src/library/index.ts';
import { BUILTIN_THEMES } from '../src/presets.ts';

const HARBOR = {
  id: 'harbor',
  name: 'Harbor',
  brand: '#0f766e',
  font: 'Inter',
  headingFont: 'Fraunces',
  shape: 'rounded',
  density: 'compact',
  motion: 'subtle',
} as const;

async function compiled(document: unknown): Promise<ShippedDesignSystem> {
  const result = await compileDesignSystemDocument(document);
  if (!result.ok) throw new Error(result.errors.join('\n'));
  return result.shipped;
}

async function harbor(): Promise<ShippedDesignSystem> {
  const created = await createDesignSystem(HARBOR);
  if (!created.ok) throw new Error(created.errors.join('\n'));
  return compiled(created.document);
}

afterEach(() => {
  clearAppearance(document.documentElement);
  forgetDesignSystemTheme('harbor');
  forgetDesignSystemTheme('dusk');
});

describe('creating a design system', () => {
  it('builds a valid document from a few inputs, the same way every time', async () => {
    const first = await createDesignSystem(HARBOR);
    const second = await createDesignSystem({ ...HARBOR });
    expect(first.ok).toBe(true);
    expect(second).toEqual(first);
    if (!first.ok) return;
    expect(first.document).toMatchObject({
      format: 'texuli/design-system',
      id: 'harbor',
      name: 'Harbor',
      color: { brand: { seed: '#0f766e' } },
      space: { density: 0.875 },
      motion: { personality: 'subtle' },
    });
    expect(first.document.typography?.families?.heading?.stack?.[0]).toBe('Fraunces');
    expect((await harbor()).hash).toBe((await harbor()).hash);
  });

  it('reads a brief, and an explicit input wins over the brief', async () => {
    const result = await createDesignSystem({
      id: 'brief',
      brief: 'brand #7c3aed, font Geist, sharp',
      brand: '#0f766e',
    });
    expect(result.ok && result.document.color?.brand?.seed).toBe('#0f766e');
    expect(result.ok && result.document.typography?.families?.sans?.stack?.[0]).toBe('Geist');
  });

  it('refuses an input that would smuggle another clause, a bad id, or nothing at all', async () => {
    expect(() => designSystemBrief({ id: 'x', font: 'Inter, brand #000000' })).toThrow(/commas/);
    expect(await createDesignSystem({ id: 'x', font: 'Inter; radius 99px' })).toMatchObject({
      ok: false,
    });
    expect(await createDesignSystem({ id: 'Bad Id', brand: '#0f766e' })).toMatchObject({
      ok: false,
    });
    expect(await createDesignSystem({ id: 'empty' })).toMatchObject({ ok: false });
  });

  it('keeps what it cannot read as warnings', async () => {
    const result = await createDesignSystem({ id: 'warn', brief: 'brand #0f766e, sparkly vibes' });
    expect(result.ok).toBe(true);
    expect(result.ok && result.warnings.join(' ')).toMatch(/unmapped/);
  });
});

describe('compiling untrusted documents', () => {
  const base = {
    format: 'texuli/design-system',
    formatVersion: 1,
    id: 'probe',
    version: '1.0.0',
    name: 'Probe',
    color: { brand: { seed: '#0f766e' } },
  };

  it('compiles a valid document to light and dark --tx-* variables and a theme', async () => {
    const result = await compileDesignSystemDocument(base);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.shipped.modes).toEqual(['light', 'dark']);
    expect(result.shipped.vars.light?.['--tx-primary']).toMatch(/^#[0-9a-f]{6}$/);
    expect(ThemeSchema.safeParse(result.theme).success).toBe(true);
    expect(result.theme.id).toBe('probe');
  });

  it.each([
    ['an unknown key', { ...base, script: 'alert(1)' }],
    ['CSS that leaves the value', { ...base, color: { brand: { seed: '#fff;}body{color:red' } } }],
    ['a remote logo', { ...base, assets: { logo: { light: 'https://tracker.example/logo.svg' } } }],
    ['a data: logo', { ...base, assets: { logo: { light: 'data:image/svg+xml,<svg/>' } } }],
    [
      'a font stack with a rule',
      {
        ...base,
        typography: { families: { sans: { stack: ['Inter}body{display:none'] } } },
      },
    ],
    ['an extends cycle base that does not exist', { ...base, extends: 'texuli:not-a-theme' }],
    ['the wrong format', { ...base, format: 'protoyard-theme/v1' }],
  ])('refuses %s', async (_label, document) => {
    const result = await compileDesignSystemDocument(document);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors.length).toBeGreaterThan(0);
  });

  it('extends a Protoyard library theme by id', async () => {
    const { color: _color, ...rest } = base;
    const result = await compileDesignSystemDocument({ ...rest, extends: 'texuli:ocean' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.shipped.vars.light?.['--tx-primary']).toBe(oceanTheme.light.primary);
  });
});

describe('importing Protoyard themes', () => {
  // Texuli derives `input` and dark `borderStrong` at 3:1 and lists them as losses (G135, fixed in 0.11.4); dark `border` changes notation only.
  const ROLES = [
    'primary',
    'background',
    'foreground',
    'surface',
    'ring',
    'muted',
    'destructive',
  ] as const;

  it.each(BUILTIN_THEMES.map((theme) => [theme.id, theme] as const))(
    'built-in %s round-trips its palette',
    async (_id, theme) => {
      const { document, losses } = await designSystemFromTheme(theme);
      expect(losses.map((loss) => loss.path)).toContain('$.color.roles.light.input');
      const result = await compileDesignSystemDocument(document);
      expect(result.ok, !result.ok ? result.errors.join('\n') : '').toBe(true);
      if (!result.ok) return;
      for (const mode of ['light', 'dark'] as const) {
        for (const role of ROLES) {
          expect(result.theme[mode][role].toLowerCase(), `${mode} ${role}`).toBe(
            theme[mode][role].toLowerCase()
          );
        }
      }
    }
  );

  it('imports every theme of the 64-theme catalog, keeping its brand and text colors', async () => {
    const themes = await loadAllLibraryThemes();
    expect(themes.length).toBe(THEME_LIBRARY_META.length);
    const refused: string[] = [];
    for (const theme of themes) {
      const { document } = await designSystemFromTheme(theme);
      const result = await compileDesignSystemDocument(document);
      if (!result.ok) {
        refused.push(`${theme.id}: ${result.errors[0]}`);
        continue;
      }
      for (const mode of ['light', 'dark'] as const) {
        for (const role of ['primary', 'background', 'foreground'] as const) {
          expect(result.theme[mode][role].toLowerCase(), `${theme.id} ${mode} ${role}`).toBe(
            theme[mode][role].toLowerCase()
          );
        }
      }
    }
    expect(refused).toEqual([]);
  }, 120_000);
});

describe('applying a design system', () => {
  it('paints the compiled variables with Texuli runtime and releases them on a switch', async () => {
    const shipped = await harbor();
    const theme = defineDesignSystemTheme(shipped);
    expect(hasDesignSystemPainter('harbor')).toBe(true);
    const root = document.documentElement;

    const applied = applyAppearance(root, { theme, resolvedMode: 'light' });
    expect(root.getAttribute('data-tx-ds')).toBe('harbor');
    expect(root.getAttribute('data-tx-mode')).toBe('light');
    expect(root.style.getPropertyValue('--tx-motion-base')).toBe(
      shipped.vars.light?.['--tx-motion-base']
    );
    expect(root.style.getPropertyValue('--tx-primary')).toBe(shipped.vars.light?.['--tx-primary']);
    // The no-flash record carries the compiled values.
    expect(applied.vars['--tx-radius']).toBe(shipped.vars.light?.['--tx-radius']);

    applyAppearance(root, { theme, resolvedMode: 'dark' });
    expect(root.getAttribute('data-tx-mode')).toBe('dark');
    expect(root.style.getPropertyValue('--tx-background')).toBe(
      shipped.vars.dark?.['--tx-background']
    );

    // A variable only the design system writes is gone after a switch.
    const reference = document.createElement('div');
    applyAppearance(reference, { theme: violetTheme, resolvedMode: 'light' });
    const own = Object.keys(shipped.vars.light ?? {}).find(
      (name) => reference.style.getPropertyValue(name) === ''
    );
    clearAppearance(reference);
    expect(own).toBeDefined();
    applyAppearance(root, { theme: violetTheme, resolvedMode: 'light' });
    expect(root.hasAttribute('data-tx-ds')).toBe(false);
    expect(root.style.getPropertyValue(own as string)).toBe('');
    expect(root.style.getPropertyValue('--tx-primary')).toBe(violetTheme.light.primary);
  });

  it('repaints a target that already shows the theme when the design system registers', async () => {
    const shipped = await harbor();
    const root = document.documentElement;
    const placeholder = { ...violetTheme, id: 'harbor', name: 'Harbor' };
    applyAppearance(root, { theme: placeholder, resolvedMode: 'light' });
    expect(root.hasAttribute('data-tx-ds')).toBe(false);
    defineDesignSystemTheme(shipped);
    expect(root.getAttribute('data-tx-ds')).toBe('harbor');
  });

  it('paints a single-mode design system in both modes without throwing', async () => {
    const result = await compileDesignSystemDocument({
      format: 'texuli/design-system',
      formatVersion: 1,
      id: 'dusk',
      version: '1.0.0',
      name: 'Dusk',
      color: { brand: { seed: '#6d28d9' }, modes: ['dark'] },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const theme = defineDesignSystemTheme(result.shipped);
    const root = document.documentElement;
    expect(() => applyAppearance(root, { theme, resolvedMode: 'light' })).not.toThrow();
    expect(root.getAttribute('data-tx-mode')).toBe('dark');
    expect(theme.light.background).toBe(theme.dark.background);
  });
});
