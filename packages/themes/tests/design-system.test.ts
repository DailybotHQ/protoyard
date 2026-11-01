import { ThemeSchema } from '@protoyard/core';
import { afterEach, describe, expect, it } from 'vitest';
import {
  clearAppearance,
  compileDesignSystemDocument,
  createDesignSystem,
  designSystemBrief,
  designSystemFromTheme,
  forgetDesignSystemTheme,
  type ShippedDesignSystem,
} from '../src/index.ts';
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

  it('refuses unknown keys, CSS escapes, remote or data: logos, bad bases and the wrong format', async () => {
    const cases: [string, unknown][] = [
      ['an unknown key', { ...base, script: 'alert(1)' }],
      [
        'CSS that leaves the value',
        { ...base, color: { brand: { seed: '#fff;}body{color:red' } } },
      ],
      [
        'a remote logo',
        { ...base, assets: { logo: { light: 'https://tracker.example/logo.svg' } } },
      ],
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
    ];
    for (const [label, document] of cases) {
      const result = await compileDesignSystemDocument(document);
      expect(result.ok, label).toBe(false);
      expect(!result.ok && result.errors.length, label).toBeGreaterThan(0);
    }
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

  it('imports every built-in with its losses listed, and round-trips its palette', async () => {
    for (const theme of BUILTIN_THEMES) {
      const { document, losses } = await designSystemFromTheme(theme);
      expect(losses.map((loss) => loss.path)).toContain('$.color.roles.light.input');
      const result = await compileDesignSystemDocument(document);
      expect(result.ok, !result.ok ? result.errors.join('\n') : '').toBe(true);
      if (!result.ok) continue;
      for (const mode of ['light', 'dark'] as const) {
        for (const role of ROLES) {
          expect(result.theme[mode][role].toLowerCase(), `${theme.id} ${mode} ${role}`).toBe(
            theme[mode][role].toLowerCase()
          );
        }
      }
    }
  });
});
