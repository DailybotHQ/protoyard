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
