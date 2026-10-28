import type { Theme } from '@protoyard/core';
import { ThemeSchema, tokenToCssVar } from '@protoyard/core';

export type ThemeExportFormat = 'css' | 'tailwind' | 'tokens';

/**
 * Characters that could end a declaration or rule, open markup, or hide a
 * function behind a CSS escape. `ThemeSchema` already refuses them; this is
 * the last check before a value is written into a stylesheet.
 */
const UNSAFE_CSS_VALUE = /[;{}<>\\!]|url\(|\/\*|\*\/|[\r\n]/i;

function cssValue(value: string | number): string {
  const text = String(value);
  if (UNSAFE_CSS_VALUE.test(text)) {
    throw new Error(`Refusing to export an unsafe CSS value: ${JSON.stringify(text.slice(0, 80))}`);
  }
  return text;
}

/** Re-validates a theme before it becomes CSS: callers may pass an unchecked object. */
function assertExportable(theme: Theme): void {
  const result = ThemeSchema.safeParse(theme);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new Error(
      `Refusing to export theme "${String(theme.id)}": ${issue?.path.join('.') ?? 'value'} ${issue?.message ?? 'is invalid'}`
    );
  }
}

function paletteEntries(theme: Theme, mode: 'light' | 'dark') {
  return Object.entries(theme[mode]);
}

export function exportTheme(theme: Theme, format: ThemeExportFormat): string {
  if (format === 'css') {
    assertExportable(theme);
    const light = paletteEntries(theme, 'light')
      .map(
        ([key, value]) =>
          `  ${tokenToCssVar(key).replace(/^--[^-]+-/, '--tx-')}: ${cssValue(value)};`
      )
      .join('\n');
    const dark = paletteEntries(theme, 'dark')
      .map(
        ([key, value]) =>
          `  ${tokenToCssVar(key).replace(/^--[^-]+-/, '--tx-')}: ${cssValue(value)};`
      )
      .join('\n');
    return `:root {\n${light}\n  --tx-radius: ${cssValue(theme.radius)};\n  --tx-density: ${cssValue(theme.density)};\n  --tx-font-family: ${cssValue(theme.fontFamily)};\n}\n\n.dark {\n${dark}\n}\n`;
  }

  if (format === 'tailwind') {
    const entries = paletteEntries(theme, 'light');
    const lines = entries.map(
      ([key]) =>
        `  --color-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}: var(${tokenToCssVar(key).replace(/^--[^-]+-/, '--tx-')});`
    );
    lines.push('  --radius-theme: var(--tx-radius);');
    return `@theme {\n${lines.join('\n')}\n}\n`;
  }

  const tokens = (mode: 'light' | 'dark') =>
    Object.fromEntries(
      paletteEntries(theme, mode).map(([key, value]) => [key, { $type: 'color', $value: value }])
    );
  return `${JSON.stringify(
    {
      $schema: 'https://design-tokens.github.io/community-group/format/',
      name: theme.name,
      color: { light: tokens('light'), dark: tokens('dark') },
      shape: { radius: { $type: 'dimension', $value: theme.radius } },
      typography: {
        fontFamily: { $type: 'fontFamily', $value: theme.fontFamily },
        ...(theme.fontFamilyHeading
          ? { headingFontFamily: { $type: 'fontFamily', $value: theme.fontFamilyHeading } }
          : {}),
      },
      density: { $type: 'number', $value: theme.density },
    },
    null,
    2
  )}\n`;
}
