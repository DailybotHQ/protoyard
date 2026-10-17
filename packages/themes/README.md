# @protoyard/themes

Theme engine for Protoyard prototypes: six AA-checked presets, light/dark/system
resolution, scoped CSS-variable application and a no-flash boot script.

```ts
import { applyAppearance, BUILTIN_THEMES, getTheme, resolveMode } from '@protoyard/themes';

applyAppearance(document.documentElement, {
  theme: getTheme('ocean'),
  resolvedMode: resolveMode('system'),
  reducedMotion: false,
  density: 'default', // 'compact' | 'comfortable' | 0.75–1.25
});
```

| Export | Purpose |
| --- | --- |
| `BUILTIN_THEMES`, `violetTheme` … `monochromeTheme` | Presets (core `Theme`), every token for light and dark |
| `getTheme(id, extra?)` / `findTheme` / `mergeThemes` | Lookup with Violet fallback; prototype themes override by id |
| `resolveMode(mode, matchMedia?)` | `system` → `light`/`dark` |
| `applyAppearance(el, input)` / `clearAppearance(el)` | Writes `--py-*` vars, `data-py-theme`, `data-py-mode`, `data-py-motion`, the `dark` class and `color-scheme`. Works on `<html>` or any element (scoped previews) |
| `themeVariables(input)` | The same variables as a plain object |
| `cacheAppearance(namespace, applied)` / `readCachedAppearance` | localStorage cache at `protoyard.<namespace>.appearance` (try/catch) |
| `noFlashScript(namespace)` | Inline `<head>` script body that replays the cache before first paint |
| `contrastRatio`, `TEXT_CONTRAST_PAIRS` | WCAG helpers used by the preset tests |

## CSS

```css
@import 'tailwindcss';
@import '@protoyard/themes/base.css';
```

`base.css` maps every token into Tailwind 4 (`bg-primary text-primary-foreground
border-border bg-surface bg-elevated text-muted-foreground ring-ring bg-sidebar
bg-chart-1` …), derives `rounded-sm…2xl` from `--py-radius`, scales spacing by
`--py-density`, defines `dark:` as `.dark` class based, and adds a base layer
(body colors, focus ring, selection, scrollbars, reduced motion via the OS or
`data-py-motion="reduce"`) plus `pt-safe`/`pb-safe`/`px-safe`/`min-h-touch`
utilities.

Contrast rules (tested): all text pairs ≥ 4.5:1, `primary`/`destructive`/
`success`/`info` as text on surfaces ≥ 4.5:1, focus ring ≥ 3:1. Use `warning`
as a fill with `warning-foreground` text, not as text color.
