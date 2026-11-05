import { afterEach, describe, expect, it, vi } from 'vitest';

// Spy on Texuli's runtime to see the options a design-system theme paints with.
const applied = vi.hoisted(() => [] as { base?: string; mode: string }[]);
vi.mock('@texuli/tokens/design-system/apply', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@texuli/tokens/design-system/apply')>();
  return {
    ...actual,
    applyDesignSystem: (
      target: HTMLElement,
      compiled: Parameters<typeof actual.applyDesignSystem>[1],
      options: Parameters<typeof actual.applyDesignSystem>[2]
    ) => {
      applied.push({ mode: options.mode, ...(options.base ? { base: options.base } : {}) });
      return actual.applyDesignSystem(target, compiled, options);
    },
  };
});

const {
  applyAppearance,
  clearAppearance,
  compileDesignSystemDocument,
  createDesignSystem,
  defineDesignSystemTheme,
  forgetDesignSystemTheme,
  rebaseFontFaces,
} = await import('../src/index.ts');

async function shipped(description?: string) {
  const created = await createDesignSystem({ id: 'harbor', name: 'Harbor', brand: '#0f766e' });
  if (!created.ok) throw new Error(created.errors.join('\n'));
  const document = description ? { ...created.document, description } : created.document;
  const result = await compileDesignSystemDocument(document);
  if (!result.ok) throw new Error(result.errors.join('\n'));
  return result.shipped;
}

afterEach(() => {
  clearAppearance(document.documentElement);
  forgetDesignSystemTheme('harbor');
  applied.length = 0;
});

describe('defineDesignSystemTheme options', () => {
  it("carries the document's description into the shipped object and the theme", async () => {
    const compiled = await shipped('Harbor Freight brand, compact and calm.');
    expect(compiled.description).toBe('Harbor Freight brand, compact and calm.');
    expect(defineDesignSystemTheme(compiled).description).toBe(
      'Harbor Freight brand, compact and calm.'
    );
    expect(defineDesignSystemTheme(compiled, { description: 'Override' }).description).toBe(
      'Override'
    );
    const plain = await shipped();
    expect(plain.description).toBeUndefined();
    expect(defineDesignSystemTheme(plain).description).toMatch(/^Design system harbor@/);
  });

  it('resolves font files against fontBase when one is given', async () => {
    const compiled = await shipped();
    const theme = defineDesignSystemTheme(compiled, {
      fontBase: new URL('https://cdn.example.com/brand/fonts/'),
    });
    applyAppearance(document.documentElement, { theme, resolvedMode: 'light' });
    expect(applied.at(-1)).toEqual({ mode: 'light', base: 'https://cdn.example.com/brand/fonts/' });

    forgetDesignSystemTheme('harbor');
    applied.length = 0;
    const defaultBase = defineDesignSystemTheme(compiled);
    applyAppearance(document.documentElement, { theme: defaultBase, resolvedMode: 'dark' });
    expect(applied.at(-1)).toEqual({ mode: 'dark' });
  });
});

describe('rebaseFontFaces (fontFiles for bundled fonts)', () => {
  const face = (src: string, inline = false) => ({
    family: 'Brand',
    src,
    format: 'woff2' as const,
    weight: '400',
    style: 'normal' as const,
    display: 'swap' as const,
    inline,
  });
  const shippedWith = (faces: ReturnType<typeof face>[]) =>
    ({ fontFaces: faces }) as unknown as Parameters<typeof rebaseFontFaces>[0];

  it('rewrites mapped files relative to their common directory, never with ..', () => {
    const result = rebaseFontFaces(
      shippedWith([face('fonts/brand-400.woff2'), face('fonts/brand-700.woff2')]),
      {
        'fonts/brand-400.woff2': 'https://app.example.com/assets/brand-400-a1b2.woff2',
        'fonts/brand-700.woff2': new URL('https://app.example.com/assets/brand-700-c3d4.woff2'),
      },
      'https://app.example.com/p/demo/index.html'
    );
    expect(result.base).toBe('https://app.example.com/assets/');
    expect(result.compiled.fontFaces.map((f) => f.src)).toEqual([
      'brand-400-a1b2.woff2',
      'brand-700-c3d4.woff2',
    ]);
  });

  it('keeps unmapped files at their old location and leaves inline and foreign faces alone', () => {
    const result = rebaseFontFaces(
      shippedWith([
        face('fonts/brand-400.woff2'),
        face('fonts/other.woff2'),
        face('data:font/woff2;base64,AAAA', true),
        face('fonts/remote.woff2'),
      ]),
      {
        'fonts/brand-400.woff2': '/assets/brand-400-a1b2.woff2',
        'fonts/remote.woff2': 'https://cdn.example.org/remote.woff2',
      },
      'https://app.example.com/p/demo/'
    );
    expect(result.base).toBe('https://app.example.com/');
    expect(result.compiled.fontFaces.map((f) => f.src)).toEqual([
      'assets/brand-400-a1b2.woff2',
      'p/demo/fonts/other.woff2',
      'data:font/woff2;base64,AAAA',
      'fonts/remote.woff2',
    ]);
    for (const f of result.compiled.fontFaces) expect(f.src).not.toContain('..');
  });
});

describe('designSystemFromTheme sidebarPrimary (G-027)', () => {
  it('drops a sidebarPrimary that only copies primary, and still compiles', async () => {
    const { BUILTIN_THEMES } = await import('../src/presets.ts');
    const { designSystemFromTheme } = await import('../src/index.ts');
    const theme = BUILTIN_THEMES[0];
    if (!theme) throw new Error('no built-in theme');
    const { document } = await designSystemFromTheme(theme);
    const roles = (
      document as unknown as { color: { roles: Record<string, Record<string, unknown>> } }
    ).color.roles;
    for (const mode of Object.keys(roles)) expect(roles[mode]?.sidebarPrimary).toBeUndefined();
    const compiled = await compileDesignSystemDocument(document);
    expect(compiled.ok).toBe(true);
  });
});
