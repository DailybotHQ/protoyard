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
`--py-*` custom property (`tokenToCssVar('primaryForeground')` →
`--py-primary-foreground`). `@protoyard/themes/base.css` maps them into the
Tailwind 4 theme, so you style with ordinary utilities:

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
| [Chart palette](#chart-palettes) (optional `theme.charts`) | `--py-chart6` … `--py-chart8`, `--py-seq-1` … `--py-seq-9`, `--py-div-1` … `--py-div-9`, `--py-chart-grid`, `--py-chart-axis` | `bg-chart-6` … `bg-chart-8` (fall back to series 1–3), `stroke-chart-grid`, `text-chart-axis` |
| `shadow` | `--py-shadow` | used inside `shadow-soft`, `shadow-float` |
| (computed) | `--py-primary-hover`, `--py-destructive-hover` | `bg-primary-hover`, `bg-destructive-hover` |

The two hover fills are computed per theme and mode by `hoverFill()`: a
visible step darker or lighter that keeps the button text at 4.5:1 or more.

### Typography, shape, density and motion variables

| Variable | From | Used for |
| --- | --- | --- |
| `--py-font-sans`, `--py-font-heading`, `--py-font-mono` | `fontFamily`, `fontFamilyHeading`, `fontFamilyMono` | `font-sans`, `font-heading`, `font-mono`; `h1`–`h4` use the heading font |
| `--py-font-size-xs` … `--py-font-size-9xl` | `style.typography.scaleRatio` | `text-xs` … `text-9xl`. `null` keeps Tailwind's sizes; a ratio gives `ratio^n rem` with `base` = `1rem` |
| `--py-font-weight-body`, `-medium`, `-heading`, `-bold` | `style.typography.weights` | `font-normal`, `font-medium`, `font-semibold`, `font-bold`; body and heading weights |
| `--py-letter-spacing-body`, `-heading` | `style.typography.tracking` | body and `h1`–`h4` letter spacing; `tracking-body`, `tracking-heading` |
| `--py-radius` | `radius` | `rounded-lg`; `rounded-xs` … `rounded-2xl` are derived from it |
| `--py-radius-step-6`, `-4`, `-2` | `style.shape.radiusScale` | The offsets between radius steps (`6px`, `4px`, `2px` × scale) |
| `--py-border-width` | `style.shape.borderWidth` | Tailwind's default border width |
| `--py-shadow-soft`, `--py-shadow-float` | `style.elevation` | `shadow-soft`, `shadow-float` |
| `--py-density` | `density` (or a density override) | Multiplies Tailwind's `--spacing`, so every `p-4`, `gap-2` scales |
| `--py-motion-fast`, `-base`, `-slow`, `--py-motion-easing` | `style.motion` | `duration-fast`, `duration-base`, `duration-slow`, default transition duration and easing; `0ms` / `linear` under reduced motion |
| `--py-focus-ring-width`, `--py-focus-ring-offset` | `style.focusRing` | `@protoyard/ui` focus-ring profiles |
| `--py-motion` | reduced motion | `0` when reduced, `1` otherwise |

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
  still win. The no-flash cache replays the merged `--py-*` variables, so a
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
`var(--py-font-stack-<id>-…, <local fallback>)`, so choosing one never
downloads a font. `@protoyard/themes/fonts.css` is optional and only declares
those `--py-font-stack-*` variables so a prototype can override them.
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

That file imports Tailwind, `@protoyard/themes/base.css` and
`@protoyard/ui/styles.css` in the right order.

**Use tokens, not raw colors.** `bg-primary text-primary-foreground` follows
every theme and both modes; `bg-violet-600` does not.

## The palette engine

`packages/themes/src/palette.ts` turns one brand color into a complete,
accessible light and dark theme. It is pure and deterministic: the same
input always gives the same hex values.

| Function | What it does |
| --- | --- |
| `generatePaletteScale(seed)` | An 11-step scale (`PALETTE_STEPS`: 50, 100, 200 … 900, 950) from a `#rgb` or `#rrggbb` seed. Keeps the seed's OKLCH hue, caps chroma at `0.24`, and places each step at a fixed OKLCH lightness (`0.98` for 50 down to `0.12` for 950). Throws a `TypeError` for anything that is not hex. |
| `createThemeFromSeed({ id, name, seed, secondary?, neutral?, style? })` | A full `Theme` validated by `defineTheme`. The optional `secondary` seed drives the secondary fill and `chart2`; without it the seed is reused. `neutral` picks a [neutral family](#neutral-families); without it the original neutrals are used. `style` is passed through. The description becomes `Generated from <seed>…`. An unknown family throws a `TypeError`. |

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

Omitting `neutral` keeps the original neutrals bit-for-bit, so every
existing generated and library theme renders exactly as before. A library
definition can set `neutral` too (`LibraryThemeDefinition.neutral`); no
library theme sets one yet.

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
[Contrast checks](#contrast-checks)). `packages/themes/tests/palette.test.ts`
checks every text and UI pair in both modes for 500 deterministic seeds,
with the original neutrals and with every neutral family.

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

Chart colors belong to the theme. `packages/themes/src/charts.ts` derives, per
mode, the colors a chart needs from `chart1` … `chart5` and checks them with
the same rules as the charts kit (`validateChartPalette` in
`packages/charts/src/palette`):

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
| `categorical` | 8 series colors; the first five are `chart1` … `chart5` | `--py-chart1` … `--py-chart8` |
| `sequential` | 9 steps, low → high values | `--py-seq-1` … `--py-seq-9` |
| `diverging` | 9 steps, negative end → neutral midpoint (step 5) → positive end | `--py-div-1` … `--py-div-9` |
| `grid`, `axis` | The palette's `border` and `mutedForeground` | `--py-chart-grid`, `--py-chart-axis` |

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

`applyAppearance` always writes `--py-chart-grid` and `--py-chart-axis`, and
writes the series 1–8 and the ramps when the theme has a `charts` block. It
removes series 6–8 and the ramps again when the next theme has none.
`packages/themes/tests/charts.test.ts` checks every preset and library theme
in both modes, 120 generated themes, and that the charts kit has nothing left
to repair.

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

The library holds **64 themes**: the 32 product-category themes of
`packages/themes/src/library/definitions.ts` (first table) and 32 more in
`definitions-extra.ts` (second table). Each entry is data only: id, name,
description, category, tags, collection, mood, a seed and secondary color,
a neutral family, a font pairing id, radius, density, an optional style
profile and, for colorblind-safe themes, five chart seeds. Tokens are not
stored; they are built by the palette engine when a theme is loaded. All
names are fictional.

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
motion or focus-ring values; see `definitions.ts` for the full profile.

Twenty of the first 32 now use a neutral family, so no two themes in one
family have nearly the same primary (the table above does not list the
neutral; see `definitions.ts`). `accessible-high-contrast` and
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
searches every text pair to 7:1 and needs a `neutral` family;
`chartSeeds` (five hex colors) replaces the derived chart series before the
chart repair.

Each definition can also set catalog metadata (`packages/themes/src/library/types.ts`):

| Field | Values | Default |
| --- | --- | --- |
| `collection` | `industry`, `brand-like`, `high-contrast`, `colorblind-safe`, `seasonal`, `mono` (`THEME_COLLECTIONS`) | `industry` |
| `mood` | any of `calm`, `bold`, `playful`, `corporate`, `editorial`, `technical`, `warm`, `fresh`, `luxurious`, `minimal` (`THEME_MOODS`) | none |
| `darkFirst` | `true` when the theme is meant to be shown in dark mode first | `false` |
| `contrastLevel` | `AA` (text 4.5:1) or `AAA` (text 7:1, enforced by `tests/library.test.ts`) | `AA` |
| `neutral` | a [neutral family](#neutral-families) | the original neutrals |

The 32 current entries set none of these yet, so they all sit in `industry`
at `AA`. `tests/library.test.ts` checks every definition: unique kebab-case
ids, `#rrggbb` seeds, known fonts, neutrals, collections, moods and contrast
levels, density range, and the style profile through core's
`ThemeStyleSchema`.

The registry API (`packages/themes/src/library/registry.ts`):

| Export | What it does |
| --- | --- |
| `THEME_LIBRARY_META` | Eager metadata only (id, name, description, category, tags, collection, mood, darkFirst, contrastLevel, seed, secondary, neutral), no palette tokens. Optional definition fields arrive with their defaults. |
| `listThemeLibrary({ category?, tag?, collection?, mood? })` | Filters the metadata |
| `searchThemeLibrary(query)` | Case-insensitive search over name, id, tags, mood, category, collection and description. Every word must match; results rank name and id matches first (3), then tags, mood, category and collection (2), then the description (1), with ties in library order. An empty query returns the whole library. |
| `listCollections()` | Every collection in a fixed order with its theme count |
| `getLibraryThemeMeta(id)`, `getLibraryThemeDefinition(id)` | Lookups |
| `loadLibraryTheme(id)` | Async. Dynamically imports the builder (`import('./build.ts')`), runs `createThemeFromSeed`, then applies the font pairing, radius and density. Results are cached in memory. Unknown ids reject with the list of known ids. |
| `loadAllLibraryThemes()` | Loads every library theme (tests, galleries) |
| `clearLibraryThemeCache()` | Clears the cache (tests) |

The dynamic import keeps the palette engine out of the eager metadata chunk
in bundlers that split on `import()`.

**Using a library theme in any prototype.** Every prototype can use every
library theme with no code of its own. `mountPrototype` gives the runtime a
resolver (`resolveLibraryTheme` in `packages/renderer-svelte/src/mount.ts`)
that loads `@protoyard/themes/library` the first time an unknown id is asked
for: a `?theme=fintech-ledger` link, a scenario's `appearance.themeId`, a
persona preference or a DevTools override. The resolved theme is validated,
registered once and applied like any other theme. The no-flash cache then
replays it before the next boot, and a stored override keeps it across
reloads. An id the library does not know falls back visibly to the manifest
default. The gallery's Themes page (`apps/gallery/src/pages/themes.astro`),
the UI Kit prototype's Theme Lab and the CLI list them too.

**DevTools → Look → Theme** is a theme browser
(`packages/devtools/src/sections/ThemeBrowser.svelte`). It groups the
prototype's own themes, the built-in presets and saved custom themes, with
the whole library collapsed behind **Browse N more themes**:

- **Search** matches name, id, description, tags, mood, category and
  collection across every group (`searchThemeLibrary` for the library). A
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
| `id`, `name` | theme id and display name; both default from the brand or blueprint name (`Acme Teal` → `acme-teal`) |

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

Without `brand`, the template's default theme is kept.

## Theme Studio

DevTools → Look has a **Theme Studio** section
(`packages/devtools/src/sections/ThemeStudioSection.svelte`). It is its own
lazy chunk: its code loads only when you press **Open studio**.

| Area | What you can do |
| --- | --- |
| Build | Name the theme; pick a seed color (color picker or hex field) and, optionally, a secondary color; choose a font pairing from `FONT_CATALOG`, a corner radius and motion from the [style presets](#style-presets) (Square, Sharp, Default, Round, Pill; None, Subtle, Standard, Expressive), elevation (`flat`, `soft`, `crisp`, `glow`, `layered`), surface (Solid, Glass), focus ring (`ring`, `outline`, `glow`, `inset`) and density (0.75–1.25 in 0.125 steps). The draft is built with `createThemeFromSeed`. |
| Preview | A sample card, buttons, badge and input themed by the draft only (scoped with `applyAppearance` on the preview box, cleared on close), with its own Light / Dark toggle. |
| Contrast | Live WCAG warnings for every text pair (4.5:1) and focus pair (3:1) in both modes, or a confirmation that all pass. An invalid name or seed shows an inline error and nothing can be saved. |
| Save | **Save** stores the theme; **Save and preview** also applies it as a temporary override. The id is a slug of the name, and saving again with the same name replaces it. |
| Custom themes | Lists saved themes. Each can be exported or deleted; deleting the active theme falls back to a known theme. Saved themes appear in the theme grid above the Studio. |
| Export | Shows the theme as JSON and offers a `<id>.theme.json` download. |
| Import | Paste JSON or choose a file. It is validated before saving; errors are shown inline per field. |

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
| File format | `{ "format": "protoyard-theme/v1", "theme": { … } }`; import also accepts a bare theme object |

The same API is on the runtime's theme controller for scripts and tests:
`customThemes()`, `isCustom(id)`, `saveCustom(input)`, `removeCustom(id)`,
`exportTheme(id)` and `importTheme(json)`.

To make a Studio theme permanent, export it and turn it into code with the
CLI. `protoyard theme import` and `theme create --from` read a **bare** theme
object, so take the `theme` value out of the Studio's
`protoyard-theme/v1` wrapper first; the wrapped file is rejected with a
validation error.

## The CLI

`pnpm protoyard theme <command>` (`packages/cli/src/commands/theme.ts`).
Every command also takes `--json`.

| Command | Options | Writes files |
| --- | --- | --- |
| `theme list` | — | no |
| `theme export [id]` | `--from <file>` (instead of an id), `--format css\|tailwind\|tokens` (default `css`) | no |
| `theme create <slug>` | `--seed <hex>` with `--id <id>` (required), `--name`, `--secondary <hex>`; or `--from <file>`; `--force`, `--dry-run` | `prototypes/<slug>/src/theme.ts` |
| `theme import <slug> <file>` | `--force`, `--dry-run` | `prototypes/<slug>/src/theme.ts` |

`create` and `import` validate the theme with `ThemeSchema` and the WCAG
pairs in both modes before writing, refuse to overwrite an existing
`src/theme.ts` without `--force`, and print the file instead of writing it
with `--dry-run`. They write the file only; register the exported theme in
`definePrototype({ themes })` yourself.

**List** the six presets and the 64 library themes:

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
climate-earth	Climate Earth	library
crypto-ledger	Crypto Ledger	library
```

**Export** a built-in or library theme (library themes are built on the fly
with `loadLibraryTheme`). `css` prints both palettes as `--py-*` variables
under `:root` and `.dark`:

```text
$ pnpm protoyard theme export fintech-ledger --format css
:root {
  --py-background: #fafafa;
  --py-foreground: #111827;
  …
  --py-primary: #007a71;
  --py-primary-foreground: #ffffff;
  …
  --py-radius: 0.5rem;
  --py-density: 0.95;
  --py-font-family: var(--py-font-stack-grotesk-sans, "Helvetica Neue", Helvetica, Arial, sans-serif);
}

.dark {
  …
  --py-primary: #00a296;
  --py-primary-foreground: #09090b;
  …
}
```

`tailwind` prints an `@theme` block that maps the variables to color
utilities; `tokens` prints W3C design-tokens JSON (colors per mode, radius,
font family, density):

```text
$ pnpm protoyard theme export ocean --format tailwind
@theme {
  --color-background: var(--py-background);
  --color-foreground: var(--py-foreground);
  …
  --color-shadow: var(--py-shadow);
  --radius-theme: var(--py-radius);
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
format names the font `--py-font-family` (the runtime uses `--py-font-sans`),
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
   the `--py-*` variables, mode class, theme id, motion, `data-py-surface`
   and the allowlisted component profile attributes. Without a cache it
   still honors `prefers-color-scheme`.

The renderer refreshes that cache every time the appearance changes. The
script only replays `--py-*` names with string values and known profile
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
| `packages/themes/tests/contrast.test.ts` | Every built-in preset and every library theme, both modes; built-in hover fills stay visible and keep text at AA |
| `packages/themes/tests/library.test.ts` | Every library theme, both modes |
| `packages/themes/tests/palette.test.ts` | `createThemeFromSeed` across 500 deterministic seeds, both modes, with the original neutrals and every neutral family |
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
