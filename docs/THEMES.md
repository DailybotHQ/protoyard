# Themes

Every prototype has its own look: a theme, a color mode and a motion
preference, resolved per persona and applied before first paint. A theme can
come from six hand-tuned presets, a library of product-category themes, a
palette generated from one brand color, the DevTools **Theme Studio**, the
`protoyard theme` CLI, or a blueprint `brand` block. API reference:
[packages/themes/README.md](../packages/themes/README.md).

## Identity vs mode

Two separate choices:

| | Theme (identity) | Mode |
| --- | --- | --- |
| What it is | A named `Theme`: colors for both modes, typography, shape, density, style profile | Which half of the palette is used |
| Values | A built-in preset (`violet`, `ocean`, `emerald`, `rose`, `amber`, `monochrome`), a prototype theme or a saved custom theme | `light`, `dark`, `system` |
| Defined in | `@protoyard/themes`, `definePrototype({ themes })`, the Theme Studio | `protoyard.json`, a scenario, DevTools, `?mode=` |

Every theme defines a full palette for **both** modes, so any theme works in
light and dark. `system` follows `prefers-color-scheme` live.

## The style model

A theme is a `Theme` (`packages/core/src/theme.ts`, validated by
`ThemeSchema`). This is everything a theme can set:

| Field | Type and range | Default |
| --- | --- | --- |
| `id` | lowercase kebab-case (`^[a-z][a-z0-9-]*$`) | required |
| `name` | 1–40 characters | required |
| `description` | string | `''` |
| `light`, `dark` | a `ThemePalette` each: 33 color tokens (table below) | required |
| `fontFamily` | CSS font stack | `'Inter Variable', Inter, ui-sans-serif, system-ui, sans-serif` |
| `fontFamilyHeading` | CSS font stack | falls back to `fontFamily` |
| `fontFamilyMono` | CSS font stack | `'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace` |
| `radius` | CSS length, the base corner radius | `0.625rem` |
| `density` | number 0.75–1.25, multiplies all spacing | `1` |
| `style` | optional style profile (below) | `DEFAULT_THEME_STYLE` |

`defineTheme(input)` parses with zod and fills these defaults.

### Color tokens → CSS variables → Tailwind utilities

`applyAppearance()` writes each palette token of the resolved mode as a
canonical `--tx-*` custom property (`primaryForeground` →
`--tx-primary-foreground`). Theme-token `--py-*` aliases have been removed.
`@protoyard/themes/base.css` maps the canonical names into the Tailwind 4
theme, so you style with ordinary utilities:

| Palette token | CSS variable | Tailwind utilities |
| --- | --- | --- |
| `background` / `foreground` | `--tx-background` / `--tx-foreground` | `bg-background`, `text-foreground` |
| `surface` / `surfaceForeground` | `--tx-surface` / `--tx-surface-foreground` | `bg-surface`, `text-surface-foreground` |
| `elevated` | `--tx-elevated` | `bg-elevated` |
| `muted` / `mutedForeground` | `--tx-muted` / `--tx-muted-foreground` | `bg-muted`, `text-muted-foreground` |
| `border`, `input`, `ring` | `--tx-border`, `--tx-input`, `--tx-ring` | `border-border`, `border-input`, `ring-ring` |
| `primary` / `primaryForeground` | `--tx-primary` / `--tx-primary-foreground` | `bg-primary`, `text-primary-foreground` |
| `secondary` / `secondaryForeground` | `--tx-secondary` / … | `bg-secondary`, `text-secondary-foreground` |
| `accent` / `accentForeground` | `--tx-accent` / … | `bg-accent`, `text-accent-foreground` |
| `destructive`, `success`, `warning`, `info` (+ `…Foreground`) | `--tx-destructive` … | `bg-destructive`, `text-success`, `bg-warning text-warning-foreground`… |
| `sidebar`, `sidebarForeground`, `sidebarBorder` | `--tx-sidebar` … | `bg-sidebar`, `text-sidebar-foreground`, `border-sidebar-border` |
| `chart1` … `chart5` | `--tx-chart-1` … `--tx-chart-5` | `bg-chart-1` … `bg-chart-5`, `text-chart-1`… |
| [Chart palette](#chart-palettes) (optional `theme.charts`) | `--tx-chart-6` … `--tx-chart-8`, `--tx-chart-sequential-1` … `--tx-chart-sequential-9`, `--tx-chart-diverging-1` … `--tx-chart-diverging-9`, `--tx-chart-grid`, `--tx-chart-axis` | `bg-chart-6` … `bg-chart-8` (fall back to series 1–3), `stroke-chart-grid`, `text-chart-axis` |
| `shadow` | `--tx-shadow` | used inside `shadow-soft`, `shadow-float` |
| (computed) | `--tx-primary-hover`, `--tx-destructive-hover` | `bg-primary-hover`, `bg-destructive-hover` |

The two hover fills are computed per theme and mode by `hoverFill()`: a
visible step darker or lighter that keeps the button text at 4.5:1 or more.

### Renderer geometry variables

Theme tokens use only `--tx-*`. Renderer-owned geometry keeps its existing
`--py-*` names: `--py-fixed-right-edge`, `--py-side-panel-width`,
`--py-safe-*`, `--py-device-radius` and `--py-app-height`. These values
describe the visible viewport and simulated device frames; they are not theme
tokens. Deck-stage styling uses separate `--tx-deck-*` properties.

### Texuli's extended appearance metadata

On a page that calls `enableTexuliAppearance()` from
`@protoyard/themes/texuli`, the package uses `@texuli/tokens` to write its
extended semantic roles and `data-tx-theme`, `data-tx-mode`,
`data-tx-motion` and `data-tx-surface` attributes. The core `--tx-*` token
set is written by `applyAppearance()` on every page.

- **Canonical tokens.** Both the default writer and the opt-in Texuli writer
  write `--tx-*`; neither emits theme-token `--py-*` aliases.
- **The extra roles.** Texuli has 16 roles Protoyard's palette lacks: soft
  tones, `link`, `linkVisited`, `selection`, `canvas`, `borderStrong`,
  `elevatedForeground`, `subtle`, `overlay`, `scrim`, `sidebarPrimary`.
  `toTexuliTheme()` (`@protoyard/themes/texuli`) derives each from existing
  roles: it takes the first candidate that meets the contrast pairs Texuli's
  AA gate holds it to.
- **Verified.** Every library theme passes Texuli's AA gate at its claimed
  level. The six built-ins fail only one check: their light-mode `input`
  borders measure about 1.4:1, under WCAG 1.4.11's 3:1. Fixing that would
  restyle every prototype, so it is a separate decision.
- **Opt-in metadata, on in every prototype.** Enabling the Texuli bridge
  re-applies the current appearance and later calls write the extended roles
  and `data-tx-*` attributes. Canonical tokens reach the no-flash cache in
  either case.
  - The renderer's `bindAppearance` calls `enableTexuliAppearance()`, because
    `@protoyard/ui` renders Texuli components; DevTools' `mountDevtools`
    calls it too. A page that never imports `@protoyard/themes/texuli` still
    writes core `--tx-*` tokens.
  - The subpath imports `@texuli/tokens/css` and `@texuli/tokens/contract`,
    never the package root, whose barrel re-exports the whole theme library
    ([TEXULI.md](TEXULI.md#themes-come-from-texulitokens)).

### Typography, shape, density and motion variables

| Variable | From | Used for |
| --- | --- | --- |
| `--tx-font-sans`, `--tx-font-heading`, `--tx-font-mono` | `fontFamily`, `fontFamilyHeading`, `fontFamilyMono` | `font-sans`, `font-heading`, `font-mono`; `h1`–`h4` use the heading font |
| `--tx-font-size-xs` … `--tx-font-size-9xl` | `style.typography.scaleRatio` | `text-xs` … `text-9xl`. `null` keeps Tailwind's sizes; a ratio gives `ratio^n rem` with `base` = `1rem`, and `xs` and `sm` never go below 12 px and 13 px (`max(0.64rem, 12px)` at 1.25), so a steep ratio on a small body keeps utility text readable |
| `--tx-font-weight-body`, `-medium`, `-heading`, `-bold` | `style.typography.weights` | `font-normal`, `font-medium`, `font-semibold`, `font-bold`; body and heading weights |
| `--tx-letter-spacing-body`, `-heading` | `style.typography.tracking` | body and `h1`–`h4` letter spacing; `tracking-body`, `tracking-heading` |
| `--tx-radius` | `radius` | `rounded-lg`; `rounded-xs` … `rounded-2xl` are derived from it |
| `--tx-radius-step-6`, `-4`, `-2` | `style.shape.radiusScale` | The offsets between radius steps (`6px`, `4px`, `2px` × scale) |
| `--tx-border-width` | `style.shape.borderWidth` | Tailwind's default border width |
| `--tx-shadow-soft`, `--tx-shadow-float` | `style.elevation` | `shadow-soft`, `shadow-float` |
| `--tx-density` | `density` (or a density override) | Multiplies Tailwind's `--spacing`, so every `p-4`, `gap-2` scales |
| `--tx-motion-fast`, `-base`, `-slow`, `--tx-motion-easing` | `style.motion` | `duration-fast`, `duration-base`, `duration-slow`, default transition duration and easing; `0ms` / `linear` under reduced motion |
| `--tx-focus-ring-width`, `--tx-focus-ring-offset` | `style.focusRing` | `@protoyard/ui` focus-ring profiles |
| `--tx-motion` | reduced motion | `0` when reduced, `1` otherwise |

`applyAppearance()` also sets `data-py-theme`, `data-py-mode`,
`data-py-motion` (`reduce` or `full`), `data-py-surface` (`solid` or
`glass`), the `dark` or `light` class and `color-scheme` on the element. The
`dark:` variant is class-based.

### Style profile

`theme.style` holds the dimensions beyond color. Every field is optional and
defaults to Protoyard's standard look, so a theme without `style` (every
built-in preset) parses to `DEFAULT_THEME_STYLE`. Values are validated
strictly (lengths in `px`/`rem`/`em`, easing keywords or `cubic-bezier(…)`)
because they become CSS. `resolveThemeStyle(partial)` fills a partial
profile with the defaults.

| Field | Values | Default |
| --- | --- | --- |
| `typography.scaleRatio` | `1`–`1.75`, or `null` | `null` (Tailwind's built-in steps) |
| `typography.weights` | `body`, `medium`, `heading`, `bold`: 100–900 | `400`, `500`, `600`, `700` |
| `typography.tracking` | `body`, `heading`: `0`, `normal` or an `em` value | `0`, `0` |
| `shape.radiusScale` | `0`–`4`, multiplies the steps around `radius` | `1` |
| `shape.borderWidth` | a length | `1px` |
| `elevation` | `flat` (no shadow), `soft`, `crisp`, `glow` (primary-tinted), `layered` (stacked contact, key and ambient shadows) | `soft` |
| `surface` | `solid`, `glass` | `solid` |
| `motion.durations` | `fast`, `base`, `slow`: 0–2000 ms | `150`, `200`, `300` |
| `motion.easing` | CSS keyword or `cubic-bezier(a, b, c, d)` | `cubic-bezier(0.4, 0, 0.2, 1)` |
| `focusRing` | `style`: `ring`, `outline`, `glow`, `inset`; `width`, `offset`: lengths | `ring`, `2px`, `2px` |

The profile is applied, not just stored. Besides the variables above,
`themeComponentProfile(theme)` sets `@protoyard/ui` component attributes, but
only where the theme departs from the default look:

| Theme setting | Attribute on the root |
| --- | --- |
| a non-default `focusRing` | `data-py-focus-ring-style` |
| `surface: 'glass'` | `data-py-card-style="glass"` |
| `elevation: 'flat'` (and not glass) | `data-py-card-style="bordered"` |
| `radius` of `0` | `data-py-button-style="square"` |
| `radius` of `999px` or more | `data-py-button-style="pill"` |

The button and card profiles style `@protoyard/ui`'s own `.ui-button` and
`.ui-card` classes. `Button` and `Card` are now re-exported from Texuli
([TEXULI.md](TEXULI.md#generic-styled-components-come-from-texuli)) and read
neither attribute. They follow the theme through its `--tx-*` tokens
instead: corners from the radius tokens and shadows from the elevation. A
glass surface does not make Texuli's `Card` translucent.

`glass` is progressive enhancement: `bg-surface` and `bg-elevated` become
translucent with a backdrop blur only in browsers that support
`backdrop-filter`; others keep solid fills.

### Style presets

`packages/themes/src/style-presets.ts` names the common choices so the Theme
Studio, DevTools, the CLI and blueprints share one vocabulary. Each preset is
plain data (`id`, `label`, `description` and its values):

| Dimension | Export | Presets |
| --- | --- | --- |
| Density | `DENSITY_PRESETS` | `compact` 0.875, `default` 1, `comfortable` 1.125, `spacious` 1.25 |
| Corner radius | `RADIUS_PRESETS` | `square` (`0`, radius scale 0, so every step is square), `sharp` (`0.25rem`, 0.5), `default` (`0.625rem`, 1), `round` (`1rem`, 1.25), `pill` (`9999px`, 1) |
| Elevation | `ELEVATION_PRESETS` | `flat`, `soft`, `crisp`, `glow`, `layered` (one per `ELEVATION_STYLES` value) |
| Font pairing | `FONT_PRESETS` | The `FONT_CATALOG` ids |
| Motion | `MOTION_PRESETS` | `none` (0 ms, linear), `subtle` (100/150/200 ms, ease-out), `standard` (150/200/300 ms, the default curve), `expressive` (200/300/500 ms, slight overshoot) |

`stylePresetInput(selection)` turns a selection such as
`{ radius: 'round', motion: 'subtle' }` into theme fields (`radius`,
`density`, the font stacks) plus a `ThemeStyleInput`.
`applyStylePresets(theme, selection)` applies it on top of a theme, keeps
every style field the selection does not touch, and validates the result with
`ThemeSchema`. An unknown id throws a `TypeError` that lists the known ids.
The default presets (`default`, `default`, `soft`, `standard`) reproduce
`DEFAULT_THEME_STYLE` exactly.

**Live in DevTools.** DevTools → Look has a control per dimension: density
presets plus a fine slider, corner radius, elevation and motion as segmented
choices, and the font pairing as a list. Each choice is a temporary
override (`theme.setOverride({ radius: 'round' })` and so on) applied on top
of the active theme, with a source badge. **Theme** clears that one override,
and **Clear appearance overrides** clears them all; it is enabled as soon as
any style override is set.

```ts
import { applyStylePresets, violetTheme } from '@protoyard/themes';

const roomyViolet = applyStylePresets(violetTheme, {
  density: 'comfortable',
  radius: 'round',
  elevation: 'layered',
  motion: 'subtle',
});
```

### Live style overrides

The radius, elevation, font and motion presets also work as live overrides,
like density: a reviewer can try a prototype "more rounded", "flatter" or
"editorial" without creating a theme.

```ts
await runtime.theme.setOverride({ radius: 'round', elevation: 'flat', font: 'editorial' });
runtime.theme.appearance().radius; // { value: 'round', source: 'override' }
await runtime.theme.clearOverride(); // back to the scenario, then the theme
```

- **Ids only.** `OverridesSchema` and a scenario's `appearance` accept the
  preset ids (`RADIUS_PRESET_IDS`, `ELEVATION_STYLES`, `FONT_PAIRING_IDS`,
  `MOTION_PRESET_IDS` in `@protoyard/core`), never free CSS. Anything else is
  rejected.
- **Resolution.** Each dimension resolves override › scenario `appearance` ›
  the effective theme's own value, which the runtime reports as
  `{ value: null, source: 'default' }`.
- **Application.** `bindAppearance` (`@protoyard/renderer-svelte`) merges
  them on top of the theme (the same result as `applyStylePresets`) before
  `applyAppearance`, so the page updates live and component profiles follow
  (`pill` gives pill buttons, `flat` bordered cards). The preset data loads
  as a small lazy chunk the first time a preset is active; until it arrives
  the page keeps what it shows. The density override and reduced motion
  still win. The no-flash cache replays the merged `--tx-*` variables, so a
  reload paints the overridden look first.
- **Storage.** Overrides live in the prototype's control DB only, never the
  data DB (ADR-005), and `theme.clearOverride()` or DevTools' "Clear
  overrides" removes them.
- **Links.** `?radius=round&elevation=flat&font=editorial&motion=none`
  applies the same presets as clearable overrides (source `override`,
  persisted like a DevTools choice). Values outside the preset ids are
  ignored. DevTools' share link (`reproducibleLink`) carries any active style
  override together with the theme, mode, shell and layout overrides, so a
  reviewer can send the exact look.

### Fonts

`FONT_CATALOG` (`packages/themes/src/fonts.ts`) has eight system-first
pairings: `system`, `humanist`, `geometric`, `grotesk`, `editorial` (serif
headings), `rounded`, `condensed` and `mono`. Each stack is
`var(--tx-font-stack-<id>-…, <local fallback>)`, so choosing one never
downloads a font. `@protoyard/themes/fonts.css` is optional and only declares
those `--tx-font-stack-*` variables so a prototype can override them.
`loadVariableFont({ family, src })` loads a self-hosted, same-origin `.woff2`
face only when called; remote URLs and other formats are refused.

### Wiring it into a prototype

A prototype's `src/app.css` gets all of this with one import
(`templates/blank/src/app.css`):

```css
@import "@protoyard/renderer-svelte/app.css";

/* Let Tailwind see this prototype's own markup. */
@source "./";
```

That file imports Tailwind, `@protoyard/themes/base.css`,
`@protoyard/ui/styles.css` and `@protoyard/devtools/styles.css` in the right order.

**How Tailwind finds package classes.** Tailwind resolves an `@source` path
relative to the stylesheet that declares it. So each kit's stylesheet
(`@protoyard/ui/styles.css`, `@protoyard/devtools/styles.css`,
`@protoyard/charts-ui/styles.css`, `@protoyard/ai-ui/styles.css`, …) registers
its own folder with `@source "./"`. A stylesheet that needs another package's
classes imports that package's stylesheet by name
(`@import "@protoyard/charts-ui/styles.css";`), never with a path into its folder.
The same CSS then works from this repository, from packed packages and from a
consumer's `node_modules`. (The test that rejected a cross-package `@source`
or `@import` path, `package-boundaries.test.ts`, was removed in PLAN_009.)

**Use tokens, not raw colors.** `bg-primary text-primary-foreground` follows
every theme and both modes; `bg-violet-600` does not.

## The palette engine

`createThemeFromSeed` (`packages/themes/src/palette.ts`) turns one brand color
into a complete, accessible light and dark theme. The engine is
`@texuli/tokens`' generator (`generateThemeFromSeed`), with chart tokens from
`@texuli/tokens/palette`; Protoyard keeps the API and its own defaults (fonts,
radius, density, style). One engine builds the library, Theme Studio, deck and
blueprint seeds and quick variants. It is pure and deterministic: the same
input always gives the same hex values.

| Function | What it does |
| --- | --- |
| `generatePaletteScale(seed)` | An 11-step scale (`PALETTE_STEPS`: 50, 100, 200 … 900, 950) from a `#rgb` or `#rrggbb` seed. Keeps the seed's OKLCH hue, caps chroma at `0.24`, and places each step at a fixed OKLCH lightness (`0.98` for 50 down to `0.12` for 950). Throws a `TypeError` for anything that is not hex. |
| `createThemeFromSeed({ id, name, seed, secondary?, neutral?, style? })` | A full `Theme` validated by `defineTheme`. The optional `secondary` seed drives the secondary fill and `chart2`; without it the seed is reused. `neutral` picks a [neutral family](#neutral-families); without it `zinc` is used. `style` is passed through. The description becomes `Generated from <seed>…`. An unknown family throws a `TypeError`. |

### OKLCH and gamut mapping

The engine works in OKLCH (`packages/themes/src/oklch.ts`), a perceptual
color space where equal lightness steps look equal across hues. That is
what lets one lightness table produce consistent scales for any seed.
`rgbToOklch` converts sRGB to OKLCH; `oklchToHex` converts back and, when a
color falls outside the sRGB gamut, keeps lightness and hue and reduces
chroma by binary search until it fits. Every output is a plain `#rrggbb`.

### How contrast is guaranteed

Neutrals (background, foreground, surface, muted, borders, sidebar) are
fixed values per mode, or come from a [neutral family](#neutral-families).
The colored tokens are searched, not guessed:

| Token | How it is chosen |
| --- | --- |
| `primary`, `ring` | The seed's hue at chroma 0.2, stepping OKLCH lightness from 0.52 down (light) or 0.48 up (dark) until it reaches 4.5:1 against `background`, `surface` and `muted` (light) or `elevated` (dark). Falls back to black or white at the extreme. |
| `destructive`, `success`, `warning`, `info` | Same search at fixed hues (25, 145, 90, 245). |
| `secondary` | A light (or dark) tint of the secondary hue, searched until the foreground reaches 4.5:1. |
| `accent` | Step 100 (light) or 900 (dark) of the seed scale. |
| `secondary`, `accent` repair | If either still fails 4.5:1 with its foreground, it is replaced with a neutral. |
| `chart1` … `chart5` | Step 600 of the seed and secondary scales plus three fixed hues, then repaired by the [chart palette](#chart-palettes) rules. |

### Neutral families

Neutrals carry most of a theme's mood, so `createThemeFromSeed` can derive
them from a family instead of the fixed values (`NEUTRAL_FAMILIES`, type
`NeutralFamily`):

| Family | OKLCH hue / chroma | Feel |
| --- | --- | --- |
| `zinc` | 286 / 0.006 | Nearly pure gray |
| `slate` | 257 / 0.02 | Blue-gray |
| `stone` | 56 / 0.008 | Faintly warm gray |
| `gray` | 265 / 0.012 | Cool gray |
| `warm` | 70 / 0.016 | Sand and paper |
| `cool` | 225 / 0.016 | Ice and steel |
| `tinted` | the seed's hue / 0.016 | A whisper of the brand color |

Each family uses one fixed OKLCH lightness per token and mode (light
background 0.985, surface 1, muted 0.965; dark background 0.145, surface 0.21,
elevated and muted 0.27). Dark borders and inputs stay translucent white, so
they follow whichever neutral is underneath. The text tokens (`foreground`,
`mutedForeground`, `sidebarForeground`) start from a table lightness and are
searched toward black or white until they reach 4.5:1 on every background
they sit on. When a secondary or accent fill misses 4.5:1 with its text, the
repair falls back to the family's own neutral fill.

Omitting `neutral` uses the `zinc` family. (Before the engine moved to
`@texuli/tokens`, it kept a fixed set of original neutrals instead; seed
themes without a family changed to solved zinc neutrals then.) A library
definition can set `neutral` too (`LibraryThemeDefinition.neutral`); the
library uses families across its product-category and curated collections.

```ts
import { createThemeFromSeed } from '@protoyard/themes';

export const paperTheme = createThemeFromSeed({
  id: 'paper-ledger',
  name: 'Paper Ledger',
  seed: '#0f766e',
  neutral: 'warm',
});
```

The result is then held to the same WCAG pairs as the presets (see
[Contrast checks](#contrast-checks)). The 500-seed palette test was removed in
PLAN_009; Theme Studio and `theme create` still refuse a failing result.

```ts
import { createThemeFromSeed } from '@protoyard/themes';

export const harborTheme = createThemeFromSeed({
  id: 'harbor',
  name: 'Harbor',
  seed: '#0f766e',
  secondary: '#1d4ed8',
  style: { elevation: 'crisp', shape: { radiusScale: 0.8 } },
});
```

## Chart palettes

Chart colors belong to the theme. `@texuli/tokens/palette`'s
`deriveChartTokens` derives, per mode, the colors a chart needs from
`chart1` … `chart5`, and its `validateChartTokens` checks them with the same
rules as the charts kit (`validateChartPalette` in `packages/charts/src/palette`):

| Rule | Minimum |
| --- | --- |
| Every series color and both ramp ends against `surface` and `background` (WCAG 1.4.11) | 3 : 1 |
| Any two series colors, OKLab distance | 0.08 |
| Any two series colors under simulated protanopia and deuteranopia (Machado 2009) | 0.04 |
| Any two series colors under simulated tritanopia (stricter than the charts kit) | 0.04 |
| Sequential ramp; each half of the diverging ramp | lightness changes monotonically toward the data end |

A color that fails moves in lightness only (the hue stays recognizable);
the three derived series colors may also shift hue a little.
`deriveChartTokens(palette, mode)` returns the block below, and
`validateChartTokens(tokens, palette, mode)` lists any rule a block breaks.

| Field | Content | CSS variables |
| --- | --- | --- |
| `categorical` | 8 series colors; the first five are `chart1` … `chart5` | `--tx-chart-1` … `--tx-chart-8` |
| `sequential` | 9 steps, low → high values | `--tx-chart-sequential-1` … `--tx-chart-sequential-9` |
| `diverging` | 9 steps, negative end → neutral midpoint (step 5) → positive end | `--tx-chart-diverging-1` … `--tx-chart-diverging-9` |
| `grid`, `axis` | The palette's `border` and `mutedForeground` | `--tx-chart-grid`, `--tx-chart-axis` |

Where the colors come from:

- **Generated themes** (`createThemeFromSeed`, so every library theme and
  every blueprint `brand` seed) carry a full `charts` block for both modes,
  and their `chart1` … `chart5` are the repaired series.
- **Built-in presets** have no `charts` block, to keep the always-loaded
  presets small; their `chart1` … `chart5` already pass the rules (a few scale
  steps were replaced by hex values for that). The charts kit derives series
  6–8 and the ramps from them at run time.
- **Your own themes** may set `charts` (validated by `ThemeSchema`: hex colors,
  8 / 9 / 9 entries); without it they behave like the presets, and the charts
  kit repairs any `chart1` … `chart5` that fail.

`applyAppearance` always writes `--tx-chart-grid` and `--tx-chart-axis`, and
writes the series 1–8 and the ramps when the theme has a `charts` block. It
removes series 6–8 and the ramps again when the next theme has none.
The chart-palette sweep over every theme (`packages/themes/tests/charts.test.ts`)
was removed in PLAN_009.

## Built-in presets and the theme library

### Built-in presets (always available)

From `packages/themes/src/presets.ts`. They are hand-assembled from
Tailwind-compatible scales (`scales.ts`), with light and dark designed
separately rather than inverted. `BUILTIN_THEMES` is always in every
prototype's theme list, and `violet` (`DEFAULT_THEME_ID`) is the fallback.

| Id | Name | Description | Radius |
| --- | --- | --- | --- |
| `violet` | Violet | The Protoyard default: calm zinc neutrals with a violet accent. | `0.625rem` |
| `ocean` | Ocean | Cool slate surfaces and a confident blue — classic SaaS. | `0.625rem` |
| `emerald` | Emerald | Fresh green on soft gray — finance, health and sustainability. | `0.625rem` |
| `rose` | Rose | Warm stone with a rose accent — consumer and lifestyle products. | `0.875rem` |
| `amber` | Amber | Sunny amber with dark text — energetic dashboards and marketplaces. | `0.625rem` |
| `monochrome` | Monochrome | Pure grayscale, crisp corners — wireframe-grade focus on behavior. | `0.375rem` |

### The theme library (loaded on demand)

The library's tokens come from **`@texuli/tokens`** ([TEXULI.md](TEXULI.md)).
It has two tiers:

- **The catalog** holds 64 themes: the 32 product-category themes (first
  table) and 32 more (second table).
  - Its metadata is synchronous: `THEME_LIBRARY_META` is
    `@texuli/tokens/library`'s, imported statically (Texuli declares
    `sideEffects`, so only the metadata module reaches a bundle). A blueprint,
    deck or picker that checks an id needs no load.
  - Its definitions and tokens load on demand from the same port, one theme at
    a time (`loadLibraryThemeDefinition`, `loadLibraryTheme`). Protoyard keeps
    no copy of them. `tests/library.test.ts` checks the library ids come from
    Texuli (the field-identity check against the 64 former definitions and its
    fixture were removed in PLAN_009).
- **The full library** adds Texuli's expanded set
  (`@texuli/tokens/library-expand`): 140 more themes, for 204 in all on Texuli
  0.9.0. It's on by default, everywhere: the `theme` CLI, the DevTools theme
  browser and Theme Studio, Deck Studio, the player's settings screen, the
  gallery Themes page, and every theme id a manifest, scenario, blueprint,
  deck, page, doc or share link names.
  - Only a dynamic import reaches it. Its metadata (about 42 KB raw) loads the
    first time a picker shows the whole library (`loadFullLibraryMeta`), and
    each theme's definition is its own small chunk that loads when the theme
    is used. No initial chunk carries it.
  - Checking an id needs no load: `ALL_LIBRARY_THEME_IDS` and
    `isLibraryThemeId` cover all 204 synchronously (an ids-only list,
    about 1 KB gzip, kept equal to Texuli's by `tests/library.test.ts`).
  - Single-file exports keep only what they use: a blueprint on a built-in or
    catalog theme embeds none of the expanded set, and one on an expanded
    theme embeds that theme with the metadata it needs, not the other 139
    (`singleFileThemeExclusions` in
    `packages/cli/src/lib/quick/single-file.ts`). In such a file, pickers
    list the built-ins and the catalog (or the whole library when an
    expanded theme is in use, where choosing another expanded theme reports
    that it could not load and keeps the current one).
  - Where the expanded set cannot load at all, the full library is the
    catalog: `loadFullLibraryMeta` resolves to it and tries again on the
    next call, and a deck on an expanded theme opens in the default theme
    with a `theme-unavailable` warning.
  - The expanded set also carries Protoyard's six built-ins. The library
    leaves them out so no picker shows an id twice; they stay
    `BUILTIN_THEMES`.
  - `enableFullThemeLibrary()` (`@protoyard/themes/library-full`) is kept for
    compatibility and restores the default; `disableFullThemeLibrary()`
    limits a page to the catalog.

Each entry is data only: id, name, description, category, tags, collection,
mood, a seed and secondary color, a neutral family, a font pairing id,
radius, density, an optional style profile and, for colorblind-safe themes,
five chart seeds. Tokens are not stored.
- Texuli builds them when a theme loads, in a lazy chunk.
- `fromTexuliTheme` converts them to this contract: the shared palette roles
  keep Texuli's values, and `chart1`…`chart5` take the first five categorical
  chart colors.

All names are fictional.

| Id | Name | Category | Seed / secondary | Font | Radius | Density | Elevation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `fintech-ledger` | Fintech Ledger | fintech | `#0f766e` / `#1d4ed8` | grotesk | `0.5rem` | 0.95 | soft |
| `health-clinic` | Health Clinic | health | `#059669` / `#0284c7` | humanist | `0.75rem` | 1.05 | soft |
| `devtools-night` | Devtools Night | devtools | `#6366f1` / `#22d3ee` | mono | `0.375rem` | 0.9 | crisp |
| `enterprise-neutral` | Enterprise Neutral | enterprise | `#1e3a5f` / `#475569` | system | `0.5rem` | 1 | flat |
| `editorial-luxury` | Editorial Luxury | editorial | `#6b21a8` / `#9a3412` | editorial | `0.25rem` | 1.05 | soft |
| `playful-consumer` | Playful Consumer | consumer | `#e11d48` / `#0ea5e9` | rounded | `1rem` | 1.05 | soft |
| `kids-playground` | Kids Playground | kids | `#ea580c` / `#2563eb` | rounded | `1.25rem` | 1.1 | soft |
| `education-campus` | Education Campus | education | `#1d4ed8` / `#0f766e` | humanist | `0.75rem` | 1 | soft |
| `gaming-neon` | Gaming Neon | gaming | `#a855f7` / `#22d3ee` | geometric | `0.5rem` | 0.95 | glow |
| `legal-serif` | Legal Serif | legal | `#1e3a8a` / `#44403c` | editorial | `0.25rem` | 1 | flat |
| `ecommerce-bold` | E-commerce Bold | ecommerce | `#c2410c` / `#0f172a` | geometric | `0.625rem` | 1 | crisp |
| `marketplace-fair` | Marketplace Fair | marketplace | `#4338ca` / `#b45309` | system | `0.625rem` | 1 | soft |
| `travel-horizon` | Travel Horizon | travel | `#0284c7` / `#d97706` | humanist | `0.75rem` | 1.05 | soft |
| `food-bistro` | Food Bistro | food | `#b91c1c` / `#a16207` | rounded | `0.875rem` | 1.05 | soft |
| `real-estate-loft` | Real Estate Loft | real-estate | `#3f6212` / `#78716c` | editorial | `0.5rem` | 1 | soft |
| `hr-people` | HR People | hr | `#7c3aed` / `#0d9488` | humanist | `0.75rem` | 1.05 | soft |
| `analytics-insight` | Analytics Insight | analytics | `#0891b2` / `#4f46e5` | condensed | `0.375rem` | 0.9 | flat |
| `security-vault` | Security Vault | security | `#0f172a` / `#b91c1c` | grotesk | `0.25rem` | 0.95 | crisp |
| `ai-lab` | AI Lab | ai | `#4f46e5` / `#db2777` | geometric | `0.75rem` | 1 | glow |
| `productivity-minimal` | Productivity Minimal | productivity | `#18181b` / `#3b82f6` | system | `0.375rem` | 0.875 | flat |
| `brutalist-block` | Brutalist Block | brutalist | `#000000` / `#f59e0b` | grotesk | `0px` | 1 | flat |
| `retro-terminal` | Retro Terminal | retro | `#16a34a` / `#a3e635` | mono | `0.125rem` | 0.95 | flat |
| `glass-frost` | Glass Frost | glass | `#2563eb` / `#7c3aed` | geometric | `1rem` | 1 | soft, glass surface |
| `accessible-high-contrast` | Accessible High Contrast | accessible | `#0000ee` / `#008000` | system | `0.5rem` | 1.1 | flat |
| `accessible-dark-contrast` | Accessible Dark Contrast | accessible | `#66b3ff` / `#ffdd57` | system | `0.5rem` | 1.1 | flat |
| `saas-startup` | SaaS Startup | saas | `#7c3aed` / `#06b6d4` | geometric | `0.625rem` | 1 | soft |
| `media-studio` | Media Studio | media | `#db2777` / `#6366f1` | condensed | `0.5rem` | 0.95 | crisp |
| `nonprofit-hope` | Nonprofit Hope | nonprofit | `#c2410c` / `#0369a1` | humanist | `0.75rem` | 1.05 | soft |
| `iot-control` | IoT Control | iot | `#0e7490` / `#854d0e` | condensed | `0.375rem` | 0.9 | crisp |
| `sports-arena` | Sports Arena | sports | `#dc2626` / `#1d4ed8` | geometric | `0.5rem` | 1 | crisp |
| `climate-earth` | Climate Earth | climate | `#15803d` / `#0f766e` | humanist | `0.625rem` | 1 | soft |
| `crypto-ledger` | Crypto Ledger | crypto | `#1e3a8a` / `#ca8a04` | mono | `0.5rem` | 0.95 | glow |

Elevation `soft` in this table is the schema default for entries that do not
set one. Several entries also set typography, radius scale, border width,
motion or focus-ring values; `loadLibraryThemeDefinition(id)` returns the full profile.

Twenty of the first 32 now use a neutral family, so no two themes in one
family have nearly the same primary (the table above does not list the
neutral; it is in each theme's metadata, `meta.neutral`). `accessible-high-contrast` and
`accessible-dark-contrast` are AAA themes in the `high-contrast` collection,
and `brutalist-block` and `productivity-minimal` are in `mono`: their black
and near-black seeds now keep a gray primary (seeds below OKLCH chroma 0.04
stay achromatic) instead of a saturated one.

The second set:

| Id | Name | Collection | Seed / secondary | Neutral | Font | Radius | Elevation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `harbor-teal` | Harbor Teal | industry | `#0e7490` / `#f59e0b` | stone | grotesk | `0.5rem` | crisp |
| `midnight-ops` | Midnight Ops | industry, dark-first | `#0891b2` / `#22c55e` | cool | mono | `0.375rem` | glow |
| `paper-ledger` | Paper Ledger | industry | `#374151` / `#b45309` | warm | editorial | `0.25rem` | flat |
| `citrus-market` | Citrus Market | industry | `#ea580c` / `#65a30d` | stone | rounded | `1rem` | soft |
| `aurora-analytics` | Aurora Analytics | industry | `#7c3aed` / `#06b6d4` | gray | condensed | `0.5rem` | layered |
| `clinic-calm` | Clinic Calm | industry | `#0d9488` / `#6366f1` | zinc | humanist | `0.875rem` | soft |
| `campus-ivy` | Campus Ivy | industry | `#166534` / `#a16207` | warm | editorial | `0.625rem` | crisp |
| `fieldwork` | Fieldwork | industry | `#4d7c0f` / `#92400e` | stone | humanist | `0.5rem` | flat |
| `studio-reel` | Studio Reel | industry | `#be185d` / `#0ea5e9` | zinc | geometric | `0.75rem` | glow |
| `transit-line` | Transit Line | industry | `#0369a1` / `#dc2626` | gray | grotesk | `0.375rem` | layered |
| `hearth-home` | Hearth Home | industry | `#b45309` / `#0f766e` | warm | rounded | `0.875rem` | layered |
| `civic-hall` | Civic Hall | industry | `#1e40af` / `#b91c1c` | cool | system | `0.25rem` | flat |
| `nimbus-cloud` | Nimbus Cloud | brand-like | `#0ea5e9` / `#8b5cf6` | tinted | geometric | `0.75rem` | soft |
| `ember-pay` | Ember Pay | brand-like | `#dc2626` / `#f59e0b` | stone | grotesk | `0.625rem` | crisp |
| `lumen-notes` | Lumen Notes | brand-like | `#ca8a04` / `#475569` | stone | editorial | `0.5rem` | flat |
| `orbit-chat` | Orbit Chat | brand-like | `#4f46e5` / `#ec4899` | tinted | rounded | `1.25rem` | soft |
| `quartz-people` | Quartz People | brand-like | `#db2777` / `#0d9488` | gray | humanist | `0.75rem` | layered |
| `summit-crm` | Summit CRM | brand-like | `#0f766e` / `#1d4ed8` | cool | system | `0.5rem` | crisp |
| `pixel-forge` | Pixel Forge | brand-like, dark-first | `#a855f7` / `#f97316` | warm | mono | `0.25rem` | glow |
| `velvet-shop` | Velvet Shop | brand-like | `#9d174d` / `#a16207` | warm | editorial | `0` | soft |
| `contrast-paper` | Contrast Paper | high-contrast (AAA) | `#1d4ed8` / `#15803d` | gray | system | `0.5rem` | flat |
| `contrast-ink` | Contrast Ink | high-contrast (AAA) | `#6d28d9` / `#b91c1c` | zinc | humanist | `0.375rem` | crisp |
| `contrast-night` | Contrast Night | high-contrast (AAA), dark-first | `#38bdf8` / `#facc15` | slate | system | `0.5rem` | crisp |
| `contrast-amber` | Contrast Amber | high-contrast (AAA), dark-first | `#f59e0b` / `#22d3ee` | warm | grotesk | `0.25rem` | flat |
| `okabe-blue` | Okabe Blue | colorblind-safe | `#0072b2` / `#e69f00` | zinc | system | `0.5rem` | soft |
| `okabe-orange` | Okabe Orange | colorblind-safe | `#d55e00` / `#56b4e9` | slate | geometric | `0.75rem` | layered |
| `safe-signal` | Safe Signal | colorblind-safe, dark-first | `#56b4e9` / `#e69f00` | slate | condensed | `0.375rem` | crisp |
| `clear-sight` | Clear Sight | colorblind-safe | `#009e73` / `#cc79a7` | gray | humanist | `0.875rem` | flat |
| `winter-frost` | Winter Frost | seasonal | `#0284c7` / `#6366f1` | cool | geometric | `1rem` | soft |
| `autumn-harvest` | Autumn Harvest | seasonal | `#c2410c` / `#854d0e` | warm | editorial | `0.625rem` | soft |
| `graphite` | Graphite | mono | `#3f3f46` / `#71717a` | slate | grotesk | `0.25rem` | flat |
| `sepia-print` | Sepia Print | mono | `#57534e` / `#a8a29e` | stone | editorial | `0.125rem` | flat |

| Collection | Themes | What it promises (checked by `tests/library.test.ts`) |
| --- | ---: | --- |
| `industry` | 40 | Product-category moods |
| `brand-like` | 8 | Fictional brand looks |
| `high-contrast` | 6 | Every text pair at 7:1 (WCAG AAA) in both modes; light-first and dark-first |
| `colorblind-safe` | 4 | Okabe-Ito chart seeds, repaired to the chart rules with their hues kept, distinct under protan, deutan and tritan simulation |
| `seasonal` | 2 | Seasonal looks |
| `mono` | 4 | Gray or near-gray primaries |

Every theme has its own neutral family, font, radius and elevation
combination, and no two themes that share a neutral family have primaries
closer than ΔE_OK 0.04 in both modes. `createThemeFromSeed({ contrast: 'AAA' })`
searches every text pair to 7:1, with or without a `neutral` family;
`chartSeeds` (five hex colors) replaces the derived chart series before the
chart repair.

Each definition can also set catalog metadata (`packages/themes/src/library/types.ts`):

| Field | Values | Default |
| --- | --- | --- |
| `collection` | `industry`, `brand-like`, `high-contrast`, `colorblind-safe`, `seasonal`, `mono` (`THEME_COLLECTIONS`) | `industry` |
| `mood` | any of `calm`, `bold`, `playful`, `corporate`, `editorial`, `technical`, `warm`, `fresh`, `luxurious`, `minimal` (`THEME_MOODS`) | none |
| `darkFirst` | `true` when the theme is meant to be shown in dark mode first | `false` |
| `contrastLevel` | `AA` (text 4.5:1) or `AAA` (text 7:1; its library test was removed in PLAN_009) | `AA` |
| `neutral` | a [neutral family](#neutral-families) | the builder's `zinc` |

Optional metadata uses the defaults above when a definition omits it.
The definition rules (a library test checked each one until PLAN_009) are:
- unique kebab-case ids and `#rrggbb` seeds
- known fonts, neutrals, collections, moods and contrast levels
- the density range
- the style profile, through core's `ThemeStyleSchema`

Since PLAN_009 the library-wide sweeps are gone: `tests/library.test.ts`
keeps the ids, the boot-path lists and lazy loading, and `tests/contrast.test.ts`
holds the six built-ins (not the 204 library themes) to WCAG AA. The link and
chart-palette sweeps were removed. One known Texuli gap is
tolerated: the expanded set's metadata omits the `neutral` family its
definitions use (nothing reads `meta.neutral` at runtime).

The registry API (`packages/themes/src/library/registry.ts`, also on the
root barrel):

| Export | What it does |
| --- | --- |
| `THEME_LIBRARY_META` | The catalog's eager metadata only (id, name, description, category, tags, collection, mood, darkFirst, contrastLevel, seed, secondary, neutral), no palette tokens. Optional definition fields arrive with their defaults. |
| `ALL_LIBRARY_THEME_IDS`, `EXPANDED_LIBRARY_THEME_IDS`, `LIBRARY_THEME_IDS` | Synchronous id lists: all 204, the expanded 140, the catalog 64 |
| `isLibraryThemeId(id)`, `isCatalogThemeId(id)`, `isExpandedLibraryThemeId(id)` | Synchronous id checks (any library theme, catalog, expanded) |
| `listThemeLibrary({ category?, tag?, collection?, mood? })` | Filters the catalog's metadata |
| `searchThemeLibrary(query)` | Case-insensitive search over the catalog: name, id, tags, mood, category, collection and description. Every word must match; results rank name and id matches first (3), then tags, mood, category and collection (2), then the description (1), with ties in library order. An empty query returns the whole list. |
| `listCollections()` | Every collection in a fixed order with its catalog theme count |
| `getLibraryThemeMeta(id)` | Catalog lookup (metadata) |
| `loadFullLibraryMeta()`, `findLibraryThemeMeta(id)` | Async. Every library theme's metadata, catalog first (the catalog when the expanded set cannot load or after `disableFullThemeLibrary()`) |
| `listFullThemeLibrary(filter?)`, `searchFullThemeLibrary(query)`, `listFullCollections()` | Async. The same filter, search and counts over all 204 |
| `searchThemeMeta(list, query)`, `countThemeCollections(list)` | The same search and counts over a list a picker already holds |
| `loadLibraryThemeDefinition(id)` | Async. Any library theme's definition, from Texuli's port |
| `loadLibraryTheme(id)` | Async. Loads any library theme's tokens and chart tokens from `@texuli/tokens` (dynamic imports only), converts them with `fromTexuliTheme`, and caches the result. Unknown ids, built-in ids included, reject with the list of known ids. |
| `loadAllFullLibraryThemes()` | Loads every theme of the full library |
| `loadAllLibraryThemes()` | Loads every library theme (tests, galleries) |
| `clearLibraryThemeCache()` | Clears the cache (tests) |

The only static import of `@texuli/tokens` here is the catalog metadata
(`@texuli/tokens/library`; the package declares `sideEffects` only for CSS).
Definitions, tokens and the expanded set are dynamic imports, so no theme's
tokens reach a prototype's initial chunk.

**Using a library theme in any prototype.** Every prototype can use every
library theme with no code of its own. `mountPrototype` gives the runtime a
resolver (`resolveLibraryTheme` in `packages/renderer-svelte/src/mount.ts`)
that loads `@protoyard/themes/library` the first time an unknown id is asked
for: a `?theme=fintech-ledger` link, a scenario's `appearance.themeId`, a
persona preference or a DevTools override. The resolved theme is validated,
registered once and applied like any other theme. The no-flash cache then
replays it before the next boot, and a stored override keeps it across
reloads. An id the library does not know falls back visibly to the manifest
default.

The same ids work declaratively: `"defaultTheme": "fintech-ledger"` in
`protoyard.json`, `appearance: { themeId: 'health-clinic' }` in a scenario,
or `"brand": { "libraryTheme": "fintech-ledger" }` in a blueprint (below).
The manifest schema accepts any kebab-case theme id (`ThemeIdRefSchema` in
`packages/core/src/manifest.ts`), and `pnpm protoyard validate <slug>` runs a
**Theme ids** check: `defaultTheme` and every scenario `appearance.themeId`
must be a built-in preset, one of the prototype's own `themes` or a library
id. An unknown id is a warning that names the closest known ids
(`defaultTheme: unknown theme "fintech-ledgr"; closest: fintech-ledger, …`),
because the runtime falls back instead of failing.

The gallery's Themes page (`apps/gallery/src/pages/themes.astro`),
the UI Kit prototype's Theme Lab and the CLI list them too.

The gallery Themes page renders 210 cards (the 204 library themes and six built-ins) as static HTML with
precomputed light and dark CSS variables, then hydrates a small filter island.
Search, collection and mood filters stay in `?q=`, `?collection=` and `?mood=`;
the page mode toggle changes every card's palette and the `?theme=<id>` link
for the selected prototype. Chart series previews use the same mode-specific
variables as each card, so the palette engine does not ship to the gallery
page.

**DevTools → Look → Theme** is a theme browser
(`packages/devtools/src/sections/ThemeBrowser.svelte`). It groups the
prototype's own themes, the built-in presets and saved custom themes, with
the whole library collapsed behind **Browse N more themes**:

- **The library** is every library theme: the 64 catalog themes show at
  once, and the expanded set joins them (with a "Loading 140 more library
  themes…" status) the first time the library shows.
- **Search** matches name, id, description, tags, mood, category and
  collection across every group (`searchThemeMeta` for the library). A
  status line announces how many themes match. Searching or filtering shows
  library matches without expanding it.
- **Collection chips** (industry, brand-like, high-contrast,
  colorblind-safe, seasonal, mono, with counts) and a **tag** filter narrow
  the library.
- **Library cards** show the seed and secondary colors until the theme is
  loaded, then its primary, accent, surface and foreground. Choosing one
  loads it through the runtime's resolver; the card shows a spinner until it
  applies.
- The choice is a temporary override or the persona's preference, per "Apply
  changes as" above. Each group is a radio group: arrow keys, Home and End
  move within it, and Tab moves between groups.

## Custom themes per prototype

Pass themes to `definePrototype({ themes })`. They are added to the built-in
presets (a theme with a preset's id replaces that preset in this prototype)
and appear in DevTools → Look.

Generate one from a seed, or start from a preset's palettes and change a few
tokens. Either way the prototype needs `"@protoyard/themes": "workspace:*"`
in its `package.json` dependencies (then `pnpm install`). For example, in
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
  style: { elevation: 'crisp' },
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

Every palette needs all 33 tokens; spreading a preset palette or using
`createThemeFromSeed` is how you avoid writing them all. Without the extra
dependency, write both palettes in full with `defineTheme()` from
`@protoyard/core`. `pnpm protoyard theme create` (below) writes a complete
`src/theme.ts` for you.

### The blueprint `brand` block

A blueprint for `pnpm protoyard generate` can carry an optional `brand`
(`packages/blueprint/src/schema.ts`, resolved by `resolveBlueprintBrand` in
`packages/blueprint/src/brand.ts`):

| Field | Values |
| --- | --- |
| `seed` | `#rgb` / `#rrggbb`; required unless `preset` is set |
| `secondary` | optional second hex color |
| `preset` | `violet`, `ocean`, `emerald`, `rose`, `amber`, `monochrome`; the full palette when `seed` is absent, ignored when `seed` is present |
| `styleProfile` | `soft`, `crisp`, `flat`, `rounded`, `editorial`, `mono`: radius, density, optional font and style knobs |
| `font` | a `FONT_CATALOG` id (overrides the profile's font) |
| `radius`, `density` | a CSS length; 0.75–1.25 (override the profile's values) |
| `id`, `name` | theme id (kebab-case, no leading, trailing or doubled hyphens) and display name; both default from the brand or blueprint name (`Acme Teal` → `acme-teal`, `3D Print Shop` → `brand-3d-print-shop`) |
| `libraryTheme` | a theme library id (`fintech-ledger`, …), used as-is; cannot be combined with `id`, `seed`, `secondary`, `preset`, `styleProfile`, `font`, `radius` or `density` |

```json
{
  "formatVersion": 1,
  "name": "Acme Desk",
  "brand": { "seed": "#0f766e", "name": "Acme Teal", "styleProfile": "soft", "font": "grotesk" },
  "entities": ["…"],
  "roles": ["…"]
}
```

`generate` builds the theme (palette engine for a seed, or a copy of the
preset), applies the profile, font, radius and density, and checks every
text and UI pair in both modes. A failing brand stops `generate` with a
validation error listing the pairs. On success it writes
`src/generated/brand-theme.ts`, registers the theme in `src/prototype.ts`
(`themes: [acmeTealTheme]`) and sets `defaultTheme` in `protoyard.json`. A
dry run of the blueprint above lists, among the other files:

```text
$ pnpm protoyard generate acme-desk --blueprint ./acme-desk.blueprint.json --dry-run
- Dry run: would write prototypes/acme-desk (39 files, nothing written)
  …
  generated src/generated/brand-theme.ts
  …
  emitted   src/prototype.ts
  …
```

With `"brand": { "libraryTheme": "fintech-ledger" }`, `generate` writes no
theme module and keeps the template's `src/prototype.ts`: it only sets
`"defaultTheme": "fintech-ledger"`, and the renderer loads the library theme
on demand (its contrast is covered by the library's own tests). The id is
checked against `THEME_LIBRARY_META` by `generate` and
`pnpm protoyard blueprint validate`; an unknown id fails with exit 4 and the
closest ids. The check lives in `brandLibraryThemeId`
(`packages/blueprint/src/brand.ts`), not the zod schema, because
`parseBlueprint` runs inside generated prototypes and the library stays out
of their initial chunk.

Without `brand`, the template's default theme is kept.

Decks, pages and docs accept the same `brand`. `generate` writes the built
theme to `src/generated/brand-theme.ts`, as for apps, and the generated runtime
module passes it to `defineKindPrototype`, so the palette generator stays out
of the prototype's first chunk. A library brand ships by id. A deck made with
`protoyard new --template deck` gets the same: `new` writes the brand of its
`src/blueprint.json` to `src/brand-theme.ts`, and `dev` and `validate` keep it
in step when `brand` changes ([KINDS](KINDS.md#editing-a-decks-brand)). The player resolves either brand
at runtime with `defineKindRuntime`.

### Design kits

`templates/design-kit` is a starting point for a product design system
(foundations, a searchable component catalog, prop tables and local review
notes). Import its palette from design tokens with `theme import`, then copy a
kit's component tree into another prototype with
`pnpm protoyard kit sync <kit> <prototype>`. It records SHA-256 hashes of the
copied files, and `--check` fails when the source, the copies or the manifest
drift. A kit with brand files or icons elsewhere syncs each folder with
`--from <dir>`, a real folder inside the kit's `src/` or `public/`, copied to the
same place in the prototype (`--from public/icons` → `public/icons/<kit>`).

## Theme Studio

DevTools → Look has a **Theme Studio** section
(`packages/devtools/src/sections/ThemeStudioSection.svelte`). It is its own
lazy chunk: its code loads only when you press **Open studio**.

| Area | What you can do |
| --- | --- |
| Start from | **Start from a theme** lists the built-ins and every library theme (the catalog at once, all 204 once the library's metadata loads); **Load** copies its seed, secondary, neutral family, font, radius, density and style into the draft. |
| Build | Name the theme; pick a seed color (color picker or hex field) and, optionally, a secondary color; choose a font pairing from `FONT_CATALOG`, a corner radius and motion from the [style presets](#style-presets) (Square, Sharp, Default, Round, Pill; None, Subtle, Standard, Expressive), elevation (`flat`, `soft`, `crisp`, `glow`, `layered`), surface (Solid, Glass), focus ring (`ring`, `outline`, `glow`, `inset`) and density (0.75–1.25 in 0.125 steps). The draft is built with `createThemeFromSeed`. |
| Harmony | Choose a neutral family and a contrast-safe secondary-color suggestion (complementary, analogous, triadic, split-complementary or monochrome). Suggestions use deterministic OKLCH harmonies and are filtered for valid light and dark palettes. |
| Preview | A sample card, buttons, badge and input themed by the draft only (scoped with `applyAppearance` on the preview box, cleared on close), with its own Light / Dark toggle. |
| Contrast | Live WCAG warnings for every text pair (4.5:1) and focus pair (3:1) in both modes, or a confirmation that all pass. An invalid name or seed shows an inline error and nothing can be saved. |
| Save | **Save** stores the theme; **Save and preview** also applies it as a temporary override. The id is a slug of the name, and saving again with the same name replaces it. |
| Custom themes | Lists saved themes. Each can be exported or deleted; deleting the active theme falls back to a known theme. Saved themes appear in the theme grid above the Studio. |
| Export | Shows the theme as JSON and offers a `<id>.theme.json` download. |
| Import | Paste JSON or choose a file. It is validated before saving; errors are shown inline per field. |
| Share draft | **Copy draft share link** encodes the Studio inputs into a compact `themeDef` URL value (at most 1,024 encoded characters). Opening it loads the draft in the Studio; the recipient explicitly saves it into their own browser. The link contains the seed and style choices, not generated palette tokens or saved domain data. |

**Storage.** Custom themes are kept in this prototype's **control database**
(`protoyard.<namespace>.control`, key `customThemes`), never in the data
database, so they survive reloads and scenario loads but do not travel to
other prototypes or browsers. The runtime (`packages/runtime/src/theme.ts`)
enforces the rules:

| Rule | Value |
| --- | --- |
| Validation | `ThemeSchema` on save, on import and again on every boot; invalid stored entries are skipped and reported, never fatal |
| Id clashes | A custom theme cannot reuse a built-in or prototype theme id |
| Limit | `MAX_CUSTOM_THEMES` = 24 |
| Import size | `MAX_THEME_JSON_BYTES` = 64 KB; parsed with `JSON.parse` only |
| Import formats | Bare `Theme` JSON or `{ "format": "protoyard-theme/v1", "theme": { … } }` |

The same API is on the runtime's theme controller for scripts and tests:
`customThemes()`, `isCustom(id)`, `saveCustom(input)`, `removeCustom(id)`,
`exportTheme(id)` and `importTheme(json)`.

The Studio's download is a **bare** theme object, ready for `protoyard theme
import` or `theme create --from`. The runtime's `exportTheme(id)` API returns
the versioned wrapper; the Studio unwraps that response for its JSON download.
The versioned wrapper is also accepted by Studio import.

## Design systems

A **design system** is Texuli's design-system document
(`format: "texuli/design-system"`, from `@texuli/tokens/design-system/*`):
brand colors, typography, shape, density, motion, focus, elevation and
component tokens in one closed JSON file. It is a superset of a theme.
Protoyard validates it with Texuli as **untrusted** input, compiles it with
`@texuli/tokens/design-system/compile-core` to concrete `--tx-*` variables for
light and dark, and paints them with Texuli's runtime (`applyDesignSystem`).
The same inputs give the same document, the same variables and the same hash.

| Way | What it does |
| --- | --- |
| `pnpm protoyard ds new <id>` | A document from a few inputs (`--brand`, `--secondary`, `--accent`, `--font`, `--heading-font`, `--mono-font`, `--shape`, `--radius`, `--density`, `--motion`, `--contrast`), a one-line `--brief` (Texuli's `importBrand`: `brand #4f46e5, font Inter, rounded, compact`; explicit inputs win), a built-in or library theme (`--from-theme <theme-id>`), or a prototype's own theme module (`--from-theme-file <path> [--export <name>]`: the file runs under tsx, like `src/prototype.ts` in `spec`, so use it only for trusted workspace code; the CLI checks the result with `ThemeSchema`). Adds an `allow` section (`--allow all`, the default, `minimal`, a JSON file, or `none` for an unlocked document) and a draft `approval`, then writes the folder `design-systems/<id>/` after it compiles (see [Design-system folders](#design-system-folders)); `--out <file>` writes a flat document instead. |
| `pnpm protoyard ds validate <id\|file>` | Checks an untrusted document and compiles it: contrast per mode and the hash. Checks its `allow` section and library against the Texuli catalog (Texuli's `checkDesignSystemAllow`; codes such as `unknown-variant` with JSON paths). For a folder it also reports the approval status and whether it can be locked, and fails when `components.json` and `components/*.svelte` disagree. |
| `pnpm protoyard ds approve <id> --by <name> [--release <semver>]` | Stamps the document's `approval` with Texuli's `approveDesignSystem` (status, who, when, version, content hash) and prints its note: a record, not a proof. Refuses flat documents, unknown ids and documents without a valid `allow` section ([DESIGN_SYSTEMS](DESIGN_SYSTEMS.md#3-approve)). |
| `pnpm protoyard ds allow init <id\|file> [--preset all\|minimal\|<file>] [--force]` | Adds an `allow` section to a design system without one; the approval goes back to draft. |
| `pnpm protoyard ds list` | Lists the workspace's design systems: version, approval, whether it can be locked, component count and bound prototypes ([DESIGN_SYSTEMS](DESIGN_SYSTEMS.md#list-them)). |
| `pnpm protoyard ds migrate <id>` | Moves a flat `design-systems/<id>.json` into the folder layout. For a folder, moves a legacy `approval.json` into the document and adds `components.json` components to its library. It never merges a flat file into an existing folder. |
| `pnpm protoyard ds export <file>` | `--format css` (default), `tailwind` (a preset as JSON) or `json` (the compiled design system). `ds export <id> --bundle` packs a design-system folder for another workspace ([DESIGN_SYSTEMS](DESIGN_SYSTEMS.md#share-between-workspaces)). |
| `pnpm protoyard ds import <file>` | Imports a bundle as untrusted input, checked completely before it writes ([DESIGN_SYSTEMS](DESIGN_SYSTEMS.md#share-between-workspaces)). |
| `pnpm protoyard ds use <slug> <id\|file> [--lock] [--upgrade]` | Writes `src/design-system.ts` (the compiled variables and the document's description, no report) and sets `defaultTheme`. In an **app** prototype it adds `designSystemTheme` to `definePrototype({ themes })`; in a **deck, page or doc** prototype it passes `brandTheme: designSystemTheme, defaultThemeId: designSystemTheme.id` to `defineKindPrototype` / `definePrototypeFromPage` / `definePrototypeFromDoc` (a deck's blueprint brand is replaced). It imports from `@protoyard/runtime`, else `@protoyard/themes`; a prototype with neither gets `@protoyard/themes` added to its `package.json` (the installed version in a consumer workspace, `workspace:*` in this repository) and `pnpm install` as the first next step. It then refreshes the generated spec regions, and lists `spec <slug> --write` only when that could not run. Then run `validate <slug> --build`. `--lock` and `--upgrade` bind the prototype ([Locked design systems](#locked-design-systems)). |
| Theme Studio → **Design system** | The same from a form, from the current theme, or from pasted JSON; **Save and apply** paints it at once. |
| `protoyard mcp` | `ds_create`, `ds_list`, `ds_validate`, `ds_export` and `ds_use` run the commands above ([MCP](MCP.md#tools)). |

In code, `@protoyard/themes` exports `createDesignSystem(input)`,
`designSystemFromTheme(theme)`, `compileDesignSystemDocument(document)` (all
three load Texuli's importer or compiler with `import()`),
`defineDesignSystemTheme(compiled, { fontBase?, description? })` (also re-exported by `@protoyard/runtime`,
which every app prototype depends on) and `exportDesignSystem(compiled, format)`.
`fontBase` is the URL the document's relative font paths resolve against, so
a package can ship its own font files
(`defineDesignSystemTheme(compiled, { fontBase: new URL('./fonts/', import.meta.url) })`);
`description` overrides the one pickers show, which defaults to the document's
`description`.
In a Vite production build, name each file instead (a bundler only emits
files it sees one by one, so a directory `fontBase` 404s):
`defineDesignSystemTheme(compiled, { fontFiles: { 'fonts/brand.woff2': new URL('./fonts/brand.woff2', import.meta.url) } })`.
Keys are the document's font `src` paths; `fontFiles` wins over `fontBase`.

**How it paints.** `defineDesignSystemTheme` returns a Protoyard `Theme`
derived from the compiled variables (palette, fonts, radius, density: what
pickers, Protoyard's own variables and the no-flash cache read) and registers
a painter for its id. Every `applyAppearance` of that theme writes the theme
first and then the compiled variables with `applyDesignSystem`, which also sets
`data-tx-ds`, `data-tx-mode` and `data-tx-scope`; before the next write the
painter is disposed, so switching to another theme leaves nothing behind. The
no-flash cache stores the compiled values. A design system compiled for one
mode paints that mode under both.

**Safety.** Every document is validated at `trust: 'untrusted'` before it is
compiled, written or applied: closed keys, CSS-safe values, no remote or
`data:` URLs (logos, fonts), `extends` depth and cycles checked. The runtime
filters every value again before it writes it. `extends: "texuli:<id>"` loads
the base from Protoyard's theme library (built-ins first). Theme Studio keeps
the **document** per prototype and browser (local storage,
`protoyard:design-systems:<namespace>`, at most 12) next to the saved theme,
and compiles it again on every load, never trusting a stored compiled copy; a
document Texuli refuses, or whose theme was deleted, is dropped.

**Importing Protoyard themes.** `designSystemFromTheme` (and `ds new
--from-theme`) uses Texuli's `fromTheme`, with an adapter for Texuli gap G135:
`fromTheme` leaves out roles it expects the seed generator to reproduce (for
ocean it does not reproduce `surface`), and the compiler holds `input` and
`borderStrong` to 3:1 while never moving a pinned role, so a plain `fromTheme`
document of most Protoyard themes is refused. Protoyard pins every role of the
theme, and drops the pins the compiler refuses, which the compiler then
recomputes to pass. The dropped pins are returned as `losses` (`ds new` prints
them as notes). Tested: all 64 catalog themes and the six built-ins import and
compile, keeping `primary`, `background` and `foreground` in both modes (the
built-ins keep `surface`, `ring`, `muted` and `destructive` too); `input` and
dark `borderStrong` change, and dark `border` changes notation only.

**Component type values: a role name, not a number.** A component's type
fields take one of the document's type roles (`display`, `title`, `heading`,
`body`, `label`, `caption`, `code`), not a CSS value. For example,
`"components": { "button": { "line-height": "body" } }` compiles to
`--tx-button-line-height` with the `body` role's line height, which Texuli's
button reads (it falls back to the `label` role's line height). Checked with
Texuli 0.14.0's compiler on a seed-only document: `"body"` gave `1.5` and
`"label"` gave `1.25`. A number (`1.4`) is refused as `invalid-type`, and a
CSS string (`"1.4"`, `"normal"`) as `invalid-value`.

**Measured** (gzip -9, 2026-10-31, Texuli 0.11.2, `mobile-banking-demo` unless named):

| Build | Before | After |
| --- | --- | --- |
| Production prototype, no design system: initial JS / CSS | 213,487 / 26,384 B | 213,299 / 26,384 B |
| `create-anything-deck`: initial JS | 301,588 B | 302,156 B (+568 B: Texuli's semantic-role list becomes its own shared chunk) |
| The same prototype after `ds use` (one design system, both modes): initial JS / CSS | 213,299 / 26,384 B | 218,946 / 26,422 B |
| DevTools build, lazy only | — | 4,324 B on DevTools mount (storage, restore, runtime); Studio panel 3,344 B; compiler 12,049 B and importer 4,288 B on the first create or restore |

**Limits.**
- Component defaults (`components.<name>.defaults`) are compiled but not
  applied; tokens are.
- Level-1 player blueprints do not carry a design system yet. App, deck,
  page and doc prototypes take one with `ds use`; a `prototype.ts` written by
  `protoyard generate` is refused (regeneration would drop the edit), so set the
  blueprint's brand instead.
- A deck's slides follow the design system through the `--tx-*` variables it
  paints. A host can also hand DeckApp the compiled design system that
  `ds use` exports (`designSystems={deckDesignSystems(compiled)}`): the stage
  then paints its variables and DeckApp skips the deck's own theme. The print
  view does not take a design system and keeps the deck theme.
- A design system made in Theme Studio stays in that browser. Download the JSON
  and run `ds use` to put it in the repository.

## Design-system folders

The whole loop (create, review, approve, lock, request components, upgrade),
every file's schema and what is planned are in
[DESIGN_SYSTEMS](DESIGN_SYSTEMS.md).

A design system can be a flat document (`design-systems/<id>.json`, as before)
or a folder. Only a folder can be approved, and only an approved folder with an
`allow` section can be locked.

```text
design-systems/<id>/
  document.json      the Texuli design-system document: allow, library and approval inside (spec 0.13.0)
  components.json    the design system's own components: name, purpose, version, status, file, sha256
  components/*.svelte
  approval.json      legacy only: read when the document has no approval; ds migrate folds it in
```

- `ds new <id>` writes the folder with an `allow` section and a draft
  `approval` in the document, and an empty `components.json`. `ds migrate
  <id>` converts a flat document, and folds a legacy `approval.json` into the
  document.
- `contentHash` is Texuli's `designSystemContentHash`: the SHA-256 of the
  document's canonical JSON (sorted keys, no whitespace) without its
  `approval` section and without each library entry's own `approval`.
- `components.json` records each component's source hash. `ds validate` fails
  when a listed file is missing or changed, or a component file is not listed.
- A prototype imports a library component through one path, whatever its
  folder depth: `import StatusPill from '@ds/<id>/StatusPill'`. The renderer's
  Vite config resolves it to `design-systems/<id>/components/StatusPill.svelte`
  and only accepts a kebab-case id and a PascalCase name.
- `components.json` is the source of each component's code hash; the
  document's `library` lists the same components (`id` = the kebab-case name,
  `composes` = the catalog ids it renders) so Texuli's checks see them. `ds
  component new` and `ds component approve` keep both in step.
- An approval is a record, not a proof: the CLI cannot tell who ran
  `ds approve`. The guarantee is a human commit reviewed through CODEOWNERS
  for `design-systems/`.

## Locked design systems

A prototype binds to a design system in its manifest:

```json
"designSystem": { "id": "acme", "version": "1.2.0", "locked": true }
```

- `ds use <slug> <id> --lock` writes the binding at the document's exact
  version. It refuses a flat document, a document without an `allow` section
  (the message says how to add one: `ds allow init <id>`, or `ds new <id>
  --allow all`), an `allow` section the catalog refuses, a draft, an approval
  for another version or without a content hash, and a document that changed
  after its approval (content hash).
- A bound prototype keeps its version: `ds use` with a new document version
  fails until you pass `--upgrade`, which moves the pin and lists the compiled
  values that changed, were added or were removed.
- A locked prototype cannot take another design system.
- Existing prototypes are not locked unless you run `ds use --lock`. A new
  one can start locked: `new <slug> --ds <id>` or `generate … --ds <id>`
  (below).
- `validate <slug>` checks a locked binding before anything else. The design
  system must be a folder with an `allow` section the catalog accepts
  (`checkDesignSystemAllow`), approved (the document's `approval`, or a legacy
  `approval.json`) at exactly the pinned version with a matching content hash,
  and applied in `src/design-system.ts`. Then it runs the `check ds` rules
  below.
- At runtime a locked prototype only uses its design system's theme. Other
  theme ids from the URL, storage, scenarios or DevTools are ignored, Theme
  Studio custom themes and style presets are off, and DevTools shows the lock
  instead of the theme tools.

### Create a prototype from a design system

Start a prototype locked to a design system, so it stays restricted to it
from its first commit. A workspace can hold many design systems; each
prototype names one.

```bash
pnpm protoyard new my-portal --ds harbor                      # the blank template, locked
pnpm protoyard new my-portal --ds harbor --template <name>     # another lock-clean template
pnpm protoyard new my-sketch --ds harbor --unlocked            # bound, not locked
pnpm protoyard generate my-deck --blueprint <file> --ds harbor # a blueprint-generated prototype
```

`new <slug> --ds <id>` runs every check before it copies anything:

1. The design system must be lockable: an approved folder at its document
   version, unchanged since its approval (the same refusals as
   `ds use --lock`). An unknown id is `not_found`; a flat document, a draft
   or a changed document is `validation` (exit 4).
2. The template must be lock-clean: `new` scans the template folder with the
   `check ds` rules. Any violation refuses with `validation`: "Template
   `<name>` is not lock-clean yet: N violations (`ds-utility`: a,
   `ds-visual-css`: b, …). Use another template, or create it unlocked with
   --unlocked." The envelope `data` has `template`, `violations`, `byRule`
   and `files`. No template list is kept anywhere: whether a template can
   start a locked prototype is only what this scan says today.
3. The template (default `blank`) is copied, then the design system is applied
   through the same code path as `ds use --lock`, before the folder is renamed
   into place: `src/design-system.ts`, the theme in `definePrototype({ themes })`
   (or the brand options of a deck, page or doc definition), `defaultTheme`, and
   `"designSystem": { "id", "version", "locked": true }`. A refusal at this
   step leaves nothing behind. The spec is written after that, so the
   generated `AGENTS.md` carries the stop-and-ask rule.
4. The new prototype is checked with `check ds` and the binding check of
   `validate`. The result is in `data.designSystemCheck` (`ok`, `files`,
   `violations`, `byRule`, `violatingFiles`, `bindingProblem`, `sample`). A
   locked prototype that fails exits 4 and stays on disk for inspection; it
   is never deleted.

- Nothing visual is copied from the design system: its theme is compiled
  into `src/design-system.ts`, and library components are imported as
  `@ds/<id>/<Name>`.
- `--from <prototype>` cannot be combined with `--ds`: copying another
  prototype may copy its visual code. Start from a template.
- `--unlocked` writes `"locked": false`: a draft design system and a template
  with violations are allowed, and `data.designSystemCheck` only reports.
  Lock it later with `ds use <slug> <id> --lock` once the design system is
  approved and `check ds --report` is clean.
- The MCP tool `new_from_design_system` runs the same command with
  `--no-install` ([MCP](MCP.md)).

`generate <slug> --blueprint <file> --ds <id> [--unlocked]` binds a
blueprint-generated app, deck, page or doc the same way:

- The generated definition takes its theme from the non-generated
  `src/design-system.ts`: an app's `src/prototype.ts` (owned, never rewritten
  by regeneration) registers `themes: [designSystemTheme]`; a deck, page or
  doc's generated `src/prototype.ts` passes `brandTheme: designSystemTheme`
  and `defaultThemeId: designSystemTheme.id`. No
  `src/generated/brand-theme.ts` is emitted, and the blueprint's `brand`
  block is ignored (`data.brandIgnored: true` and a warning).
- Regeneration reads the binding from `protoyard.json`, so `--ds` is needed
  only once. Repeating the same id is accepted; another id is a `conflict`.
  `--ds` on a generated prototype that is not bound yet binds it during the
  regeneration.
- `ds use <slug> <id> --upgrade` works on a generated prototype whose
  generated definition already imports `./design-system.ts`: it rewrites only
  `src/design-system.ts` and the manifest pin, so the generated file's hash
  stays intact. `ds use` still refuses a generated definition the generator
  did not bind.
- `data.designSystemCheck` splits violations by owner: `generatorFiles` (what
  the generator emitted) and `templateFiles` (copied from the template). The
  generator's own files pass `check ds`; a locked result fails (exit 4, the
  prototype stays) while a template file is not lock-clean, and the message
  names those files (for example a template `src/app.css` that still sets
  `color` or `background`). `new --ds` refuses such a template up front;
  `generate --ds` writes the prototype and reports the template's files, so
  you can see what the template still has to fix.

### check ds

A prototype can bind itself to a design system in `protoyard.json`:
`"designSystem": { "id": "harbor", "version": "1.2.0", "locked": true }`
(`id` is the design system's id, `version` its exact semver). When `locked`
is `true`, the prototype draws its UI only with the design system's
components; its own code composes them with layout. `pnpm protoyard check ds`
enforces that with a static scan (no prototype code runs) of the prototype's
own `src/` and the `.css` files next to its `protoyard.json`. It skips
`node_modules`, `dist`, `tests`, `src/generated/**`, test files and symlinks.

| Rule | What fails | Way out |
| --- | --- | --- |
| `ds-raw-control` | A native `<button>`, `<input>`, `<select>`, `<textarea>` or `<dialog>` (the elements of the Texuli adoption `raw-control` rule), an element with an interactive ARIA role (`role="button"`, `link`, `tab`, …), or a plain element such as `<a>` or `<div>` given a click handler | The design system's control (`Button`, `Input`, …) |
| `ds-visual-css` | In a `.svelte` `<style>` or a `.css` file: a visual declaration (`color`, `background*`, `border*`, `outline*`, `box-shadow`, `font*`, `text-*`, `letter-spacing`, `line-height`, `opacity`, `filter`, `transform`, `transition*`, `animation*`, `fill`, `stroke`, …), a literal color (hex, `rgb()`, `hsl()`, `oklch()`, `lab()`, `color-mix()`, …) in any declaration, a redefined `--tx-*` token, or a `z-index` other than `auto`, 0–50 or `var(--tx-*)`. Layout declarations (`display`, `flex*`, `grid*`, `gap`, `padding`, `margin`, sizes, `position`, `inset`, `overflow`) pass | A component that draws it, or layout CSS only |
| `ds-global-override` | A selector that targets a `tx-` class or a `[data-tx-*]` attribute: through `:global(...)`, in a global `.css` file or in local CSS | A component prop or variant, or a component request |
| `ds-utility` | A class (static `class="…"`, string literals in `class={…}`, `class:` directives, `cx()`/`clsx()`/`cn()` strings) that is not an allowed layout utility, a `tx-` class or a class the prototype's own CSS defines; and any arbitrary value (`p-[13px]`, `gap-(--x)`), even on an allowed utility | A layout utility on the scale, or a component |
| `ds-inline-style` | `style="…"` or `style:prop` on any element or component | Layout utilities or layout CSS |
| `ds-styled-local-component` | A local `.svelte` file (any one in `src/`) that styles itself: visual declarations in its `<style>`, or visual utility classes | Compose design-system components with layout classes |
| `ds-ui-library` | An import of another UI library: `bits-ui`, `melt-ui`, `@skeletonlabs/*`, `flowbite*`, `daisyui`, `shadcn*`, `@radix-ui/*`, `@headlessui/*`, `svelte-ux`, `carbon-components-svelte`, `@smui/*`, `tailwind-variants`, `class-variance-authority`, `@ark-ui/*`, `@zag-js/*`, `sveltestrap`, `svelte-material-ui`, `attractions` (also as a CSS `@import` or `@plugin`) | The design system's component |
| `ds-local-motion` | `svelte/transition`, `svelte/animate` or `svelte/motion` imports, `transition:`, `in:`, `out:` or `animate:` directives, and `@keyframes` (aligned with the adoption `local-motion` rule) | Motion that the design system's components already have |
| `ds-not-allowed` | Only when the bound design system has an `allow` section. A Texuli (or `@protoyard/ui`) component used as a tag whose catalog id ([the mapper](#the-catalog-mapper)) the `allow` section does not list and is not a part of an allowed id (`select-trigger` of `select`); a component the mapper cannot place (`unmapped`; a non-component export such as `MotionProvider` is never refused); an `@ds/<id>/<Name>` import that is not in the design system's library or belongs to another design system; in a library component's own file, a catalog id its entry does not list in `composes` | A component the design system allows, or ask the designer to allow it |
| `ds-disabled-value` | Only with an `allow` section. A literal value on an axis prop (`variant="ghost"`, `size={'sm'}`; the prop name comes from the catalog manifest's `axes`) that the component's allow entry does not enable. Expressions (`{variant}`, `` {`x${y}`} ``) are skipped: the planned render check covers them | An enabled value |

Every violation carries the rule id, the workspace-relative file, the line, a
short message and the way out: `Use a design-system component, or request one:
protoyard ds component request <design-system-id> <Name>`, with the bound id
filled in (and the component name for raw controls).

With an `allow` section, `check ds` also scans the library components the
prototype imports (`design-systems/<id>/components/<Name>.svelte`) with every
rule, against `allow` and their entry's `composes`.

#### The catalog mapper

`ds-not-allowed` needs the catalog id of each imported component. One
function (`catalogIdFor` in `packages/cli/src/lib/ds-catalog.ts`) maps an
import (module and export name) from `texuli`, `texuli/<sub>`,
`@texuli/<pkg>[/<sub>]`, `@protoyard/ui` or a module a
[catalog extension](DESIGN_SYSTEMS.md#catalog-extensions) imports from. The
catalog's own `imports` (Texuli 0.15.0) come first:

1. An own component of `@protoyard/ui` (or of any extension's module) maps by
   its extension manifest's `imports` to the extension id (`DataTable` →
   `protoyard:data-table`).
2. A re-export of `@protoyard/ui` is followed to the Texuli import it is
   (`FormField` is `Field` from `texuli/field`; `SplitView` is the default
   export of `texuli/layouts/app/split-view`).
3. A Texuli manifest that lists the exact module and export name gives the id
   (`Icon` from `texuli/icons` → `icon`, `CardHeader` from `texuli/card` →
   `card`).
4. An export Texuli's catalog lists as a non-component (`MotionProvider`,
   `SafeArea`, `AppShell`), or an own `@protoyard/ui` component that renders
   no catalog component, is a **non-component**: never refused, never
   counted.
5. Anything else from a Texuli module or `@protoyard/ui` is `unmapped`: no
   fallback to names.

Only for a Texuli whose manifests list no `imports` does the mapper fall back
to names: the id whose PascalCase equals the name (`AlertDialog` →
`alert-dialog`), then the package's id prefix plus the name (`Grid` from
`@texuli/data` → `data-grid`), then the longest id whose PascalCase starts
the name at a word boundary (`CardHeader` → `card`; `Selector` matches
nothing).

Measured over every component tag in `templates/` and `prototypes/` (446
`.svelte` files, 2,827 uses, 2026-11-09, Texuli 0.15.0 catalog):

| Class | Uses | Names | Most used |
| --- | ---: | ---: | --- |
| Catalog import | 2,049 | 37 | `Button` 704, `LucideIcon` 383, `FormField` 185, `Card` 135, `Badge` 121, `Skeleton` 100, `Icon` 94 |
| Extension | 758 | 28 | `Input` 180, `EmptyState` 118, `Select` 117, `Avatar` 73, `StatCard` 50, `Dialog` 42 |
| Non-component | 20 | 7 | `AppShell` 9, `MotionProvider` 3, `SafeArea` 2, `ChipGroup` 2, `StarRating` 2, `FileDropzone` 1, `MobileAppShell` 1 |
| By name (exact, package, prefix) | 0 | 0 | |
| Unmapped | 0 | 0 | |

With the Texuli 0.14 catalog (no `imports`, names only) the same tags were
766 extension, 1,338 exact, 103 prefix and 620 unmapped (`LucideIcon` and
`Icon`, `Skeleton`, `Progress`, `AppShell`…), and a prefix match could be
wrong for a re-export (`MessageList` → `chat-message`; the catalog maps it to
`chat-thread`).

**Allowed utilities (owner decision: layout only, on the token scale).** The
list is an allow-list: anything not on it fails, including unknown utilities.

- Display: `flex`, `inline-flex`, `grid`, `inline-grid`, `block`,
  `inline-block`, `inline`, `hidden`, `contents`.
- Flex: `flex-row`, `flex-col` (and `-reverse`), `flex-wrap`,
  `flex-nowrap`, `flex-1`, `flex-auto`, `flex-initial`, `flex-none`, `grow`,
  `grow-0`, `shrink`, `shrink-0`, `basis-*`.
- Grid: `grid-cols-*`, `grid-rows-*`, `col-span-*`, `row-span-*`,
  `col-start-*`, `col-end-*`, `row-start-*`, `row-end-*`, `grid-flow-*`,
  `auto-cols-*`, `auto-rows-*`.
- Alignment and order: `items-*`, `justify-*`, `justify-items-*`,
  `justify-self-*`, `self-*`, `content-*`, `place-*`, `order-*`.
- Spacing on the scale (whole and half steps, `px`): `gap-*`, `gap-x-*`,
  `gap-y-*`, padding (`p-*`, `px-*`, `py-*`, `pt-*`, …), margin (`m-*`,
  `mx-*`, `-mt-*`, …, `auto`), `space-x-*`, `space-y-*`.
- Sizes: `w-*`, `h-*`, `min-w-*`, `max-w-*`, `min-h-*`, `max-h-*`, `size-*`
  with scale steps, fractions (`w-1/2`), `auto`, `full`, `screen`, `min`,
  `max`, `fit` and the named widths (`max-w-2xl`).
- Position: `static`, `relative`, `absolute`, `fixed`, `sticky`, `inset-*`,
  `top-*`, `right-*`, `bottom-*`, `left-*`.
- `overflow-*`, `z-0` to `z-50` and `z-auto`, `sr-only`, `not-sr-only`, and
  the `group`/`peer` markers.
- Text flow, not typography: alignment (`text-left`, `text-center`,
  `text-right`, `text-justify`, `text-start`, `text-end`), wrapping and
  truncation (`truncate`, `line-clamp-*`, `break-*`, `whitespace-*`,
  `text-wrap`, `text-nowrap`, `text-balance`, `text-pretty`). Size, weight,
  family, color, leading and tracking stay refused. CSS follows the same
  rule: `text-align`, `text-align-last`, `text-overflow` and `text-wrap`
  pass in a stylesheet; `text-decoration`, `text-transform`, `text-shadow`
  and `text-indent` are visual.
- Box and media layout: `aspect-*` (auto, square, video), `object-*`,
  `box-border`, `box-content`, `isolate`, `visible`, `invisible`, the table
  and `flow-root` displays, `pointer-events-none` and `pointer-events-auto`.
- Protoyard's layout tokens, exactly the `@utility` rules of
  `@protoyard/themes/base.css`: the safe-area insets (`pt-safe`, `pb-safe`,
  `pl-safe`, `pr-safe`, `px-safe`), the app frame height (`h-app`,
  `min-h-app`, `max-h-app`) and the touch-target height (`min-h-touch`). A test
  keeps the list equal to the stylesheet.
- Tailwind's container-query marker `@container` (and `@container/<name>`).
- Scroll behavior: `overscroll-*`, scroll snapping (`snap-*`) and scroll margin and padding on the spacing scale (`scroll-mt-4`).
- Responsive and state variants (`sm:`, `md:`, `lg:`, `xl:`, `2xl:`, `hover:`,
  `dark:`, …) on an allowed utility (`md:grid-cols-2` passes). A variant with
  brackets (`data-[x]:`) is an arbitrary value.

Refused: color, background, border, ring, outline, radius (`rounded-*`),
shadow, typography (`font-*`, `text-*` sizes and colors, `leading-*`, `tracking-*`), opacity,
filters, transforms, transitions and `animate-*`, and any arbitrary value.

| Command | Result |
| --- | --- |
| `pnpm protoyard check ds` | Checks every prototype whose manifest is locked. Any violation fails (`validation`, exit 4) with `data: { ok, counts, violations }` and a hint naming the rule, file and way out. No locked prototype: exit 0. |
| `pnpm protoyard check ds <slug…>` | Checks the named prototypes. A named prototype that is not locked is a usage error (exit 2) that suggests `--report`. |
| `pnpm protoyard check ds [<slug…>] --report` | Also checks unlocked prototypes (all of them, or the named ones) and lists every violation, so you can see what locking would flag. Never fails (exit 0); `data.ok` is still `false` when a locked prototype has violations. |

`pnpm protoyard validate <slug>` (with or without `--build`) runs the same
rules as its `design-system` step for a locked prototype and fails on any
violation, before the build. Unlocked prototypes get no step.

**Limits.** The scan is static and textual: classes built at runtime from
variables, components from other packages, components rendered from `.ts`
files or through `<svelte:component>`, axis values given as expressions, and
CSS imported from outside the prototype folder are not seen. Styling inside a
workspace package the prototype imports is not scanned either: a prototype
built mostly from such a package reports few violations. Class strings are read from `class` values,
`class:` directives and the `cx`/`clsx`/`cn`/`classNames`/`twMerge`/`twJoin`
helpers only.

### Requesting a new component

When a locked prototype needs something no design-system component covers,
the answer is a new component in the design system, never local styling. An
agent stops and asks the human first: the component's name, its purpose, and
why the existing components do not fit. Only after they agree:

```bash
pnpm protoyard ds component request harbor StatusPill --purpose "Shows a ticket status with its label" --why "Badge has no label layout" --by "Ada Example"
pnpm protoyard ds component approve-request harbor StatusPill --by "Bo Example"
pnpm protoyard ds component new harbor StatusPill
pnpm protoyard ds validate harbor
```

| Step | Writes | Refuses |
| --- | --- | --- |
| `ds component request <id> <Name> --purpose <text> --why <text> [--by <name>]` | `design-systems/<id>/requests/<Name>.json`: `{ format: "protoyard/ds-component-request", version: 1, name, purpose, why, requestedBy?, requestedAt, status: "open" }`. No code. | A name that is not PascalCase, a component that already exists, an open or approved request with the same name (`conflict`), an unknown design system, a flat document (migrate it first), text with control characters or line breaks, `--purpose` over 280 characters, `--why` over 1000. |
| `ds component approve-request <id> <Name> --by <name>` | The request with `status: "approved"`, `approvedBy` and `approvedAt`. | No request, no `--by`, a request already approved. |
| `ds component new <id> <Name> [--prototype <slug…>]` | `components/<Name>.svelte`, a `components.json` entry (`status: "draft"`, `version: "0.1.0"`, the request's purpose, the file's sha256), the document's `library` entry (`id` the kebab-case name, `composes` the catalog ids the scaffold renders: `badge`, `card`) and the kit story stub `stories/<Name>.json` (`{ format: "protoyard/ds-story", version: 1, component, variants: [{ name: "Default", props }] }`). | No approved request (the error names `request`, then `approve-request`), a working directory inside a prototype folder, a `--prototype` that is locked, an existing component file or entry, a flat or unknown design system. |
| `ds component approve <id> <Name> --by <name>` | The `components.json` entry approved (`approvedBy`, `approvedAt`, the file's current sha256) and the library entry approved with its own `approval` (Texuli's `libraryEntryContentHash`), `composes` refreshed from the source. The document's content hash moves: approve the design system again. | An unknown component, a missing file, no `--by`. |

The scaffold is a Svelte 5 runes component with a typed `$props()` interface
that composes Texuli's `Card`, `CardContent` and `Badge` with layout utility
classes only: no `<style>` block, no inline style, no visual classes, so it
passes the `check ds` rules. Prototypes import it as
`@ds/<id>/<Name>`. After you edit it, `ds validate` reports the changed
sha256 until `ds component approve` records the reviewed file.

- `approve-request` and `approve` are meant for a human. They are records, not
  proofs: the CLI cannot tell who ran them. The guarantee is the reviewed
  commit (for example CODEOWNERS on `design-systems/`). The MCP server has
  `ds_component_request` and `ds_component_new` but no approval tool.
- A locked prototype's generated `AGENTS.md` (the `commands` region of
  `protoyard spec`) carries the same rule: build only from the design system,
  stop and ask when nothing fits, never style controls locally. Unlocked
  prototypes' generated text does not change.
- Request times come from the real clock: a request is a CLI record, not
  scenario data.
- An optional coding-agent hook that runs `pnpm protoyard check ds <slug>`
  after edits is in the skill's
  [design-systems reference](../skills/protoyard/references/design-systems.md#optional-run-check-ds-after-each-edit).
  Protoyard does not install it.

## The CLI

`pnpm protoyard theme <command>` (`packages/cli/src/commands/theme.ts`).
Every command also takes `--json`.

| Command | Options | Writes files |
| --- | --- | --- |
| `theme list` | `--collection <collection>`, `--mood <mood>`, `--search <query>` (every library theme's names, ids, tags, moods and descriptions; built-in presets are not searched) | no |
| `theme show <theme-id>` | — (light and dark swatches and contrast checks) | no |
| `theme use <slug> <theme-id>` | `--dry-run` | `prototypes/<slug>/protoyard.json` (`defaultTheme`) |
| `theme export [id]` | `--from <file>` (instead of an id), `--format css\|tailwind\|tokens` (default `css`) | no |
| `theme create <slug>` | `--seed <hex>` with `--id <id>` (required), `--name`, `--secondary <hex>`; or `--from <file>`; `--force`, `--dry-run` | `prototypes/<slug>/src/theme.ts` |
| `theme import <tokens.json> --name <id>` | imports flat or DTCG tokens and returns the theme, AA report, CSS variables and Tailwind tokens as JSON | no |
| `theme import <slug> <file>` | `--force`, `--dry-run` | `prototypes/<slug>/src/theme.ts` |

`create` and the prototype form of `import` validate the theme with
`ThemeSchema` and the WCAG pairs in both modes before writing, refuse to
overwrite an existing `src/theme.ts` without `--force`, and print the file
instead of writing it with `--dry-run`. They write the file only; register the
exported theme in `definePrototype({ themes })` yourself.

The token form accepts the W3C design-token structure emitted by `theme export
--format tokens`, a flat object with `light` and `dark`, or a `protoyard` object
containing those palettes. Flat `typography.ui` / `display` and `radii.md`
tokens are also mapped to the theme's font and radius. It requires every
Protoyard palette color in both modes and hex values for tokens used in contrast
pairs, so AA can be measured. It returns the parsed theme and contrast report
without writing files; `--json` also includes CSS custom properties and
Tailwind `@theme` tokens. A failed AA pair exits with a validation error and
lists each failing mode and token pair; adjust the source tokens and retry.

**List** the six presets and all 204 library themes (the 64 catalog themes,
then Texuli's expanded set):

```text
$ pnpm protoyard theme list
violet	Violet	builtin
ocean	Ocean	builtin
emerald	Emerald	builtin
rose	Rose	builtin
amber	Amber	builtin
monochrome	Monochrome	builtin
fintech-ledger	Fintech Ledger	library
health-clinic	Health Clinic	library
…
…
volt-green	Volt Green	library
wheat-barn	Wheat Barn	library
```

**Export** a built-in or library theme (library themes are built on the fly
with `loadLibraryTheme`). `css` prints canonical `--tx-*` theme-token names:

```text
$ pnpm protoyard theme export fintech-ledger --format css
:root {
  --tx-background: #fafafa;
  --tx-foreground: #111827;
  …
  --tx-primary: #007a71;
  --tx-primary-foreground: #ffffff;
  …
  --tx-radius: 0.5rem;
  --tx-density: 0.95;
  --tx-font-family: var(--tx-font-stack-grotesk-sans, "Helvetica Neue", Helvetica, Arial, sans-serif);
}

.dark {
  …
  --tx-primary: #00a296;
  --tx-primary-foreground: #09090b;
  …
}
```

`tailwind` prints an `@theme` block that maps the variables to color
utilities; `tokens` prints W3C design-tokens JSON (colors per mode, radius,
font family, density):

```text
$ pnpm protoyard theme export ocean --format tailwind
@theme {
  --color-background: var(--tx-background);
  --color-foreground: var(--tx-foreground);
  …
  --color-shadow: var(--tx-shadow);
  --radius-theme: var(--tx-radius);
}

$ pnpm protoyard theme export violet --format tokens
{
  "$schema": "https://design-tokens.github.io/community-group/format/",
  "name": "Violet",
  "color": {
    "light": {
      "background": {
        "$type": "color",
        "$value": "#fafafa"
      },
  …
```

The exports cover the palettes, radius, density and font family only, not
the style profile. Two naming details differ from `base.css`: the `css`
format names the font `--tx-font-family` (the runtime uses `--tx-font-sans`),
and the `tailwind` format names chart colors `--color-chart1` (the base
stylesheet uses `--color-chart-1`). An unknown id exits with code 3 and lists
the known ids.

**Create** a theme file from a seed (shown as a dry run, nothing written):

```text
$ pnpm protoyard theme create crm-demo --id harbor --name Harbor --seed '#0f766e' --secondary '#1d4ed8' --dry-run
Would write prototypes/crm-demo/src/theme.ts
import { defineTheme } from '@protoyard/core';

export const harborTheme = defineTheme({
  "id": "harbor",
  "name": "Harbor",
  "description": "Generated from #0f766e and #1d4ed8.",
  …
  "light": {
    …
    "primary": "#007a71",
    "primaryForeground": "#ffffff",
  …
});
```

**Import** a bare theme JSON file into a prototype (or use
`theme create <slug> --from <file>`, which does the same):

```text
$ pnpm protoyard theme import crm-demo ./harbor.theme.json --dry-run
Would write prototypes/crm-demo/src/theme.ts
import { defineTheme } from '@protoyard/core';

export const harborTheme = defineTheme({
…
```

## Mode, reduced motion and density

| Setting | Values | Resolution |
| --- | --- | --- |
| Mode | `light`, `dark`, `system` | `system` uses `prefers-color-scheme` and updates live when the OS changes |
| Reduced motion | `true` / `false` | Falls back to the OS `prefers-reduced-motion`. When reduced, the motion variables become `0ms` / `linear`, and `base.css` disables transitions and animations when either the OS or `data-py-motion="reduce"` asks for it. |
| Density | `theme.density`, 0.75–1.25 (default 1) | Part of the theme. DevTools → Look has density presets (compact, default, comfortable, spacious) and a fine slider (0.75–1.25 in 0.025 steps); both are always a temporary override, and **Theme** returns to the theme's own density. `applyAppearance(el, { density: 'compact' \| 'comfortable' \| number })` accepts one too (`compact` = 0.875, `comfortable` = 1.125). |
| Viewport | `desktop`, `tablet`, `iphone`, `android`, `custom` | Not a theme setting, but resolved the same way. Narrows the app column (`data-py-viewport`); media queries still follow the real window. |
| Shell, device, orientation | `auto`, `none`, `phone`, `tablet`, `desktop-window`, `browser`, `widget-host`, `extension-popup`, `side-panel`; a catalog device; `portrait` / `landscape` | Not theme settings, but resolved the same way (override › scenario › manifest `preview`). The frame drawn around the app follows the theme and mode. See [SHELLS.md](SHELLS.md). |

## Precedence

The effective theme, mode and reduced-motion value each come from the first
layer that sets them:

| Order | Source | Set by |
| --- | --- | --- |
| 1 | `override` | DevTools → Look with "Temporary override" selected, Theme Studio's **Save and preview**, a link's `?theme=` / `?mode=` / `?radius=` / `?elevation=` / `?font=` / `?motion=`, `theme.setOverride()` |
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
   `localStorage` (`protoyard.<namespace>.appearance`) before first paint:
   canonical `--tx-*` variables, mode class, theme id, motion,
   `data-py-surface`, their `data-tx-*` twins, and the allowlisted component
   profile attributes. Without a cache it still honors
   `prefers-color-scheme`.

The renderer refreshes that cache every time the appearance changes. The
script only replays `--tx-*` names with string values and known
profile
values, and every storage access is wrapped in `try`, so private mode or a
tampered cache cannot break the page or inject markup.

## Per-prototype isolation

| What | Scope |
| --- | --- |
| CSS variables | Written on the `<html>` of the page running that prototype. Each prototype is its own app and page. |
| Preferences | Stored per persona in that prototype's control database |
| Custom themes (Theme Studio) | That prototype's control database, key `customThemes` |
| Prototype themes | Only exist in the prototype that declares them |
| No-flash cache | `localStorage` key per namespace: `protoyard.<namespace>.appearance` |

`applyAppearance()` also works on any element, not only `<html>`. That scopes
a theme to a subtree, which is how the Theme Studio preview, the gallery's
Themes page and the UI Kit's Theme Lab show themes side by side.
`clearAppearance(el)` removes everything it wrote.

## Contrast checks

Presets, library themes and generated themes are tested against WCAG 2.x
contrast (`TEXT_CONTRAST_PAIRS` and `UI_CONTRAST_PAIRS` in
`packages/themes/src/contrast.ts`):

| Pairs | Minimum |
| --- | --- |
| Text on its background: `foreground/background`, `surfaceForeground/surface`, `foreground/elevated`, `mutedForeground` on `background`, `surface` and `muted`, every `xForeground/x` pair, `sidebarForeground/sidebar` | 4.5 : 1 |
| Semantic colors used as text: `primary` on `background`, `surface` and `muted`; `destructive` on `surface` and `muted`; `success` and `info` on `surface` | 4.5 : 1 |
| Focus ring: `ring` on `background` and `surface` | 3 : 1 |

| Where the pairs are enforced | How |
| --- | --- |
| `packages/themes/tests/contrast.test.ts` | The WCAG math and every built-in preset, both modes (the library-wide, hover-fill and 500-seed sweeps were removed in PLAN_009) |
| Theme Studio | Live warnings before saving |
| `theme create` / `theme import` | Refuses to write a failing theme |
| `generate` with a `brand` | Refuses to generate a failing brand theme |

In the presets, `warning` is a fill: use `bg-warning text-warning-foreground`,
not `text-warning`.

The helpers are exported, so a prototype test can check its own theme:

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
way, which is why the loop skips non-hex values.

## Performance

Library theme tokens are built only when a theme is loaded, and the Theme
Studio is a separate DevTools chunk. For measured bundle and timing impact of the
library, the palette engine and the Theme Studio, see
[PERFORMANCE.md](PERFORMANCE.md#themes-library-palette-engine-and-theme-studio).
