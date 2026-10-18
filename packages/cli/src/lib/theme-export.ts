import type { Theme } from '@protoyard/core';
import { tokenToCssVar } from '@protoyard/core';

export type ThemeExportFormat = 'css' | 'tailwind' | 'tokens';

function cssValue(value: string | number): string {
  return String(value);
}

function paletteEntries(theme: Theme, mode: 'light' | 'dark') {
  return Object.entries(theme[mode]);
}

export function exportTheme(theme: Theme, format: ThemeExportFormat): string {
  if (format === 'css') {
    const light = paletteEntries(theme, 'light')
      .map(([key, value]) => `  ${tokenToCssVar(key)}: ${cssValue(value)};`)
      .join('\n');
    const dark = paletteEntries(theme, 'dark')
      .map(([key, value]) => `  ${tokenToCssVar(key)}: ${cssValue(value)};`)
      .join('\n');
    return `:root {\n${light}\n  --py-radius: ${theme.radius};\n  --py-density: ${theme.density};\n  --py-font-family: ${theme.fontFamily};\n}\n\n.dark {\n${dark}\n}\n`;
  }

  if (format === 'tailwind') {
    const entries = paletteEntries(theme, 'light');
    const lines = entries.map(
      ([key]) =>
        `  --color-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}: var(${tokenToCssVar(key)});`
    );
    lines.push('  --radius-theme: var(--py-radius);');
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
