# Themes

Every prototype has its own look: a theme, a color mode and a motion
preference, resolved per persona and applied before first paint. API
reference: [packages/themes/README.md](../packages/themes/README.md).

## Identity vs mode

Two separate choices:

| | Theme (identity) | Mode |
| --- | --- | --- |
| What it is | A named set of tokens: colors, fonts, radius, density | Which half of the theme is used |
| Values | `violet`, `ocean`, `emerald`, `rose`, `amber`, `monochrome`, or your own | `light`, `dark`, `system` |
| Defined in | `@protoyard/themes` presets or `definePrototype({ themes })` | |

Every theme defines a full palette for **both** modes, so any theme works in
light and dark. `system` follows `prefers-color-scheme` live.

## Built-in presets

From `packages/themes/src/presets.ts`:

| Id | Name | Description | Radius |
| --- | --- | --- | --- |
| `violet` | Violet | The Protoyard default: calm zinc neutrals with a violet accent. | `0.625rem` |
| `ocean` | Ocean | Cool slate surfaces and a confident blue — classic SaaS. | `0.625rem` |
| `emerald` | Emerald | Fresh green on soft gray — finance, health and sustainability. | `0.625rem` |
| `rose` | Rose | Warm stone with a rose accent — consumer and lifestyle products. | `0.875rem` |
| `amber` | Amber | Sunny amber with dark text — energetic dashboards and marketplaces. | `0.625rem` |
| `monochrome` | Monochrome | Pure grayscale, crisp corners — wireframe-grade focus on behavior. | `0.375rem` |

All presets pass the contrast checks below, in both modes.

## Tokens → CSS variables → Tailwind utilities

A theme is a `Theme` (`packages/core/src/theme.ts`): `id`, `name`,
`description`, `fontFamily`, `fontFamilyHeading?`, `fontFamilyMono`, `radius`,
`density`, a `light` and `dark` `ThemePalette`, and an optional `style`
profile (below).

`applyAppearance()` writes each palette token as a `--py-*` custom property on
`<html>` (`tokenToCssVar('primaryForeground')` → `--py-primary-foreground`).
`@protoyard/themes/base.css` maps them into Tailwind 4, so you style with
normal utilities:

| Palette token | CSS variable | Tailwind utilities |
| --- | --- | --- |
| `background` / `foreground` | `--py-background` / `--py-foreground` | `bg-background`, `text-foreground` |
| `surface` / `surfaceForeground` | `--py-surface` / `--py-surface-foreground` | `bg-surface`, `text-surface-foreground` |
| `elevated` | `--py-elevated` | `bg-elevated` |
| `muted` / `mutedForeground` | `--py-muted` / `--py-muted-foreground` | `bg-muted`, `text-muted-foreground` |
| `border`, `input`, `ring` | `--py-border`, `--py-input`, `--py-ring` | `border-border`, `border-input`, `ring-ring` |
| `primary` / `primaryForeground` | `--py-primary` / `--py-primary-foreground` | `bg-primary`, `text-primary-foreground` |
| `secondary` / `secondaryForeground` | `--py-secondary` / … | `bg-secondary`, `text-secondary-foreground` |
| `accent` / `accentForeground` | `--py-accent` / … | `bg-accent`, `text-accent-foreground` |
| `destructive`, `success`, `warning`, `info` (+ `…Foreground`) | `--py-destructive` … | `bg-destructive`, `text-success`, `bg-warning text-warning-foreground`… |
| `sidebar`, `sidebarForeground`, `sidebarBorder` | `--py-sidebar` … | `bg-sidebar`, `text-sidebar-foreground`, `border-sidebar-border` |
| `chart1` … `chart5` | `--py-chart1` … `--py-chart5` | `bg-chart-1` … `bg-chart-5`, `text-chart-1`… |
| `shadow` | `--py-shadow` | `shadow-soft`, `shadow-float` |

Non-color variables:

| Variable | From | Used for |
| --- | --- | --- |
| `--py-radius` | `theme.radius` | `rounded-xs` … `rounded-2xl` are derived from it |
| `--py-font-sans`, `--py-font-heading`, `--py-font-mono` | `theme.fontFamily*` | `font-sans`, `font-heading`, `font-mono` |
| `--py-density` | `theme.density` (0.75–1.25) | Multiplies Tailwind's `--spacing`, so every `p-4`, `gap-2` scales |
| `--py-motion` | Reduced motion | `0` when reduced, `1` otherwise |

`applyAppearance()` also sets `data-py-theme`, `data-py-mode`,
`data-py-motion` (`reduce` or `full`), the `dark` or `light` class and
`color-scheme` on the element. The `dark:` variant is class-based.

A prototype's `src/app.css` gets all of this with one import
(`templates/blank/src/app.css`):

```css
@import "@protoyard/renderer-svelte/app.css";

/* Let Tailwind see this prototype's own markup. */
@source "./";
```

That file imports Tailwind, `@protoyard/themes/base.css` and
`@protoyard/ui/styles.css` in the right order.

**Use tokens, not raw colors.** `bg-primary text-primary-foreground` follows
every theme and both modes; `bg-violet-600` does not.

### Style profile (contract only)

`theme.style` describes the dimensions beyond color. Every field is optional
and defaults to today's rendering, so a theme without `style` (every built-in
preset) parses to `DEFAULT_THEME_STYLE`. Values are validated strictly
(lengths in `px`/`rem`/`em`, easing keywords or `cubic-bezier(…)`), because
they are meant to become CSS.

| Field | Values | Default (today) |
| --- | --- | --- |
| `typography.scaleRatio` | `1`–`1.75`, or `null` | `null` (Tailwind's built-in steps) |
| `typography.weights` | `body`, `medium`, `heading`, `bold`: 100–900 | `400`, `500`, `600`, `700` |
| `typography.tracking` | `body`, `heading`: `0`, `normal` or an `em` value | `0`, `0` |
| `shape.radiusScale` | `0`–`4`, multiplies the steps around `radius` | `1` |
| `shape.borderWidth` | a length | `1px` |
| `elevation` | `flat`, `soft`, `crisp`, `glow` | `soft` |
| `surface` | `solid`, `glass` | `solid` |
| `motion.durations` | `fast`, `base`, `slow`: 0–2000 ms | `150`, `200`, `300` |
| `motion.easing` | CSS keyword or `cubic-bezier(a, b, c, d)` | `cubic-bezier(0.4, 0, 0.2, 1)` |
| `focusRing` | `style`: `ring`, `outline`, `glow`, `inset`; `width`, `offset`: lengths | `ring`, `2px`, `2px` |

Font stacks stay on `fontFamily`, `fontFamilyHeading` and `fontFamilyMono`.
`resolveThemeStyle(partial)` fills a partial profile with the defaults.
Today this is the contract only: `applyAppearance()` and `base.css` do not
read `style` yet, so setting it does not change the rendering.

## Mode, reduced motion and density

| Setting | Values | Resolution |
| --- | --- | --- |
| Mode | `light`, `dark`, `system` | `system` uses `prefers-color-scheme` and updates live when the OS changes |
| Reduced motion | `true` / `false` | Falls back to the OS `prefers-reduced-motion`. `base.css` disables transitions and animations when either the OS or `data-py-motion="reduce"` asks for it. |
| Density | `theme.density`, a number 0.75–1.25 (default 1) | Part of the theme. The renderer does not offer a separate density toggle; `applyAppearance(el, { density: 'compact' \| 'comfortable' \| number })` accepts one if you call it yourself. |
| Viewport | `desktop`, `tablet`, `iphone`, `android`, `custom` | Not a theme setting, but resolved the same way. Narrows the app column (`data-py-viewport`); media queries still follow the real window. |
| Shell, device, orientation | `auto`, `none`, `phone`, `tablet`, `desktop-window`, `browser`, `widget-host`, `extension-popup`, `side-panel`; a catalog device; `portrait` / `landscape` | Not theme settings, but resolved the same way (override › scenario › manifest `preview`). The frame drawn around the app follows the theme and mode. See [SHELLS.md](SHELLS.md). |

## Precedence

The effective theme, mode and reduced-motion value each come from the first
layer that sets them:

| Order | Source | Set by |
| --- | --- | --- |
| 1 | `override` | DevTools → Look with "Temporary override" selected, a link's `?theme=` / `?mode=`, `theme.setOverride()` |
| 2 | `preference` | The active persona's saved choice: DevTools → Look with "Persona preference" selected, `theme.setPreference()`, or `persona.preferences` from the generator |
| 3 | `scenario` | The loaded scenario's `appearance` |
| 4 | `default` | `protoyard.json`: `defaultTheme` (default `violet`) and `defaultMode` (default `system`); for reduced motion, the OS setting |

DevTools shows the source next to each value. Switching persona can change
the look, because preferences are stored per persona. An unknown theme id (a
deleted custom theme, a bad link) falls back visibly to the manifest default
with source `default`.

Theme and persona changes never write to the data database (ADR-005 in
[DECISIONS.md](DECISIONS.md)).

## No flash on load

The runtime boots asynchronously, so without help the page would paint with
the default colors and then switch. Two things prevent that:

1. `base.css` ships Violet defaults for `:root` and `.dark`, so the first
   paint is already themed.
2. `defineProtoyardConfig()` injects `noFlashScript(namespace)` as the first
   `<head>` script. It replays the last applied appearance from
   `localStorage` (`protoyard.<namespace>.appearance`) before first paint.
   Without a cache it still honors `prefers-color-scheme`.

The renderer refreshes that cache every time the appearance changes. The
script only replays `--py-*` names with string values, and every storage
access is wrapped in `try`, so private mode or a tampered cache cannot break
the page or inject markup.

## Per-prototype isolation

| What | Scope |
| --- | --- |
| CSS variables | Written on the `<html>` of the page running that prototype. Each prototype is its own app and page. |
| Preferences | Stored per persona in that prototype's control database |
| No-flash cache | `localStorage` key per namespace: `protoyard.<namespace>.appearance` |
| Custom themes | Only exist in the prototype that declares them |

`applyAppearance()` also works on any element, not only `<html>`. That scopes
a theme to a subtree, for example to show several themes side by side in a
preview. `clearAppearance(el)` removes everything it wrote.

## Defining a custom theme

Pass themes to `definePrototype({ themes })`. They are added to the built-in
presets (a theme with a preset's id replaces that preset in this prototype)
and appear in DevTools → Look.

The easiest way is to start from a preset's palettes and change a few
tokens. Add `"@protoyard/themes": "workspace:*"` to the prototype's
`package.json` dependencies and run `pnpm install`. Then, for example in
`src/theme.ts`:

```ts
import { defineTheme } from '@protoyard/core';
import { oceanTheme } from '@protoyard/themes';

export const harborTheme = defineTheme({
  id: 'harbor',
  name: 'Harbor',
  description: 'Ocean surfaces with a deep teal accent.',
  radius: '0.5rem',
  light: { ...oceanTheme.light, primary: '#0f766e', primaryForeground: '#ffffff', ring: '#0d9488' },
  dark: { ...oceanTheme.dark, primary: '#2dd4bf', primaryForeground: '#042f2e', ring: '#2dd4bf' },
});
```

```ts
// src/prototype.ts
export const definition = definePrototype({
  manifest: parseManifest(manifestJson),
  // …
  themes: [harborTheme],
});
```

To make it the default, set `"defaultTheme": "harbor"` in `protoyard.json`.
A scenario can also pick it: `appearance: { themeId: 'harbor', mode: 'dark' }`.

`defineTheme()` validates with zod and fills defaults: `description` `''`,
`fontFamily` Inter, `fontFamilyMono` JetBrains Mono, `radius` `0.625rem`,
`density` `1`. Every palette needs all 33 tokens; spreading a preset palette
is how you avoid writing them all.

Without the extra dependency, write both palettes in full with
`defineTheme()` from `@protoyard/core`.

## Contrast checks

The presets are tested against WCAG 2.x contrast. Apply the same rules to
your own theme:

| Pairs | Minimum |
| --- | --- |
| Text on its background: `foreground/background`, `surfaceForeground/surface`, `foreground/elevated`, `mutedForeground` on `background`, `surface` and `muted`, every `xForeground/x` pair, `sidebarForeground/sidebar` | 4.5 : 1 |
| Semantic colors used as text: `primary` on `background` and `surface`; `destructive`, `success`, `info` on `surface` | 4.5 : 1 |
| Focus ring: `ring` on `background` and `surface` | 3 : 1 |

`warning` is a fill: use `bg-warning text-warning-foreground`, not
`text-warning`.

The helpers are exported, so a prototype test can check its theme:

```ts
import { contrastRatio, TEXT_CONTRAST_PAIRS, UI_CONTRAST_PAIRS } from '@protoyard/themes';
import { harborTheme } from '../src/theme.ts';

it('harbor meets contrast in both modes', () => {
  for (const mode of ['light', 'dark'] as const) {
    const palette = harborTheme[mode];
    for (const [fg, bg] of TEXT_CONTRAST_PAIRS) {
      if (!palette[fg].startsWith('#') || !palette[bg].startsWith('#')) continue; // helpers read hex only
      expect(contrastRatio(palette[fg], palette[bg])).toBeGreaterThanOrEqual(4.5);
    }
    for (const [fg, bg] of UI_CONTRAST_PAIRS) {
      expect(contrastRatio(palette[fg], palette[bg])).toBeGreaterThanOrEqual(3);
    }
  }
});
```

`contrastRatio()` accepts `#rgb` and `#rrggbb` only. Translucent values such
as the dark-mode borders (`rgb(255 255 255 / 0.1)`) cannot be checked this
way, which is why the loop skips them.
