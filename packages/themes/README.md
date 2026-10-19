# @protoyard/themes

Theme engine for Protoyard prototypes: six AA-checked built-in presets, a 30+
product-category **theme library**, light/dark/system resolution, scoped
CSS-variable application and a no-flash boot script.

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
| `BUILTIN_THEMES`, `violetTheme` … `monochromeTheme` | Core six presets (every token for light and dark) |
| `THEME_LIBRARY_META`, `listThemeLibrary`, `loadLibraryTheme(id)` | 30+ category presets: eager metadata, lazy token load via the palette engine |
| `createThemeFromSeed({ id, name, seed, secondary?, neutral?, style? })` | Build an AA light/dark theme from brand hex colors; `neutral` picks a family from `NEUTRAL_FAMILIES` (`zinc`, `slate`, `stone`, `gray`, `warm`, `cool`, `tinted`) |
| `DENSITY_PRESETS`, `RADIUS_PRESETS`, `ELEVATION_PRESETS`, `FONT_PRESETS`, `MOTION_PRESETS`, `stylePresetInput(selection)`, `applyStylePresets(theme, selection)` | Named density, radius, elevation, font and motion presets as data, resolved to validated theme fields |
| `FONT_CATALOG`, `getFontPairing`, `loadVariableFont` | System-first font pairings (no network) |
| `getTheme(id, extra?)` / `findTheme` / `mergeThemes` | Lookup with Violet fallback; prototype themes override by id |
| `resolveMode(mode, matchMedia?)` | `system` → `light`/`dark` |
| `applyAppearance(el, input)` / `clearAppearance(el)` | Writes `--py-*` vars (including `--py-focus-ring-width` / `--py-focus-ring-offset`), `data-py-theme`, `data-py-mode`, `data-py-motion`, `data-py-surface`, the `@protoyard/ui` component profiles from `themeComponentProfile`, the `dark` class and `color-scheme` |
| `themeComponentProfile(theme)` | The `data-py-*-style` profiles a theme's style implies, only where it departs from today's look: a non-default focus ring → `focus-ring`, `surface: glass` → `card: glass`, `elevation: flat` → `card: bordered`, radius 0 → `button: square`, radius ≥ 999px → `button: pill`. Input and navigation profiles have no theme field and stay consumer-set. The no-flash script replays these (allowlisted values only) |
| `themeVariables(input)` | The same variables as a plain object |
| `cacheAppearance(namespace, applied)` / `readCachedAppearance` | localStorage cache at `protoyard.<namespace>.appearance` (try/catch) |
| `noFlashScript(namespace)` | Inline `<head>` script body that replays the cache (including `data-py-surface`) before first paint |
| `contrastRatio`, `relativeLuminance`, `parseHex`, `TEXT_CONTRAST_PAIRS`, `UI_CONTRAST_PAIRS` | WCAG helpers used by the preset tests and the UI Kit theme lab |
| `DEFAULT_THEME_ID`, `prefersDark(matchMedia?)`, `densityScale(density, theme?)` | Small helpers behind `getTheme` / `resolveMode` / `applyAppearance` |
| `appearanceCacheKey(namespace)`, `APPEARANCE_CACHE_VERSION` | Cache key/version shared by `cacheAppearance` and the inline script |

Subpath exports: `@protoyard/themes/presets`, `@protoyard/themes/no-flash`,
`@protoyard/themes/base.css`, `@protoyard/themes/fonts.css` (optional font-stack
variables).

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
