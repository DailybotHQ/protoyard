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
| `elevation` | `flat` (no shadow), `soft`, `crisp`, `glow` (primary-tinted) | `soft` |
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
| `createThemeFromSeed({ id, name, seed, secondary?, style? })` | A full `Theme` validated by `defineTheme`. The optional `secondary` seed drives the secondary fill and `chart2`; without it the seed is reused. `style` is passed through. The description becomes `Generated from <seed>…`. |

### OKLCH and gamut mapping

The engine works in OKLCH (`packages/themes/src/oklch.ts`), a perceptual
color space where equal lightness steps look equal across hues. That is
what lets one lightness table produce consistent scales for any seed.
`rgbToOklch` converts sRGB to OKLCH; `oklchToHex` converts back and, when a
color falls outside the sRGB gamut, keeps lightness and hue and reduces
chroma by binary search until it fits. Every output is a plain `#rrggbb`.

### How contrast is guaranteed

Neutrals (background, foreground, surface, muted, borders, sidebar) are
fixed values per mode. The colored tokens are searched, not guessed:

| Token | How it is chosen |
| --- | --- |
| `primary`, `ring` | The seed's hue at chroma 0.2, stepping OKLCH lightness from 0.52 down (light) or 0.48 up (dark) until it reaches 4.5:1 against `background`, `surface` and `muted` (light) or `elevated` (dark). Falls back to black or white at the extreme. |
| `destructive`, `success`, `warning`, `info` | Same search at fixed hues (25, 145, 90, 245). |
| `secondary` | A light (or dark) tint of the secondary hue, searched until the foreground reaches 4.5:1. |
| `accent` | Step 100 (light) or 900 (dark) of the seed scale. |
| `secondary`, `accent` repair | If either still fails 4.5:1 with its foreground, it is replaced with a neutral. |
| `chart1` … `chart5` | Step 600 of the seed and secondary scales, plus three fixed hues. |

The result is then held to the same WCAG pairs as the presets (see
[Contrast checks](#contrast-checks)). `packages/themes/tests/palette.test.ts`
checks every text and UI pair in both modes for 500 deterministic seeds.

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

`packages/themes/src/library/definitions.ts` declares **32 library themes**
across 31 categories (two share `accessible`). Each entry is data only: id,
name, description, category, tags, a seed and secondary color, a font
pairing id, radius, density and an optional style profile. Tokens are not
stored; they are built by the palette engine when a theme is loaded.

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

The registry API (`packages/themes/src/library/registry.ts`):

| Export | What it does |
| --- | --- |
| `THEME_LIBRARY_META` | Eager metadata only (id, name, description, category, tags, seed, secondary), no palette tokens |
| `listThemeLibrary({ category?, tag? })` | Filters the metadata |
| `getLibraryThemeMeta(id)`, `getLibraryThemeDefinition(id)` | Lookups |
| `loadLibraryTheme(id)` | Async. Dynamically imports the builder (`import('./build.ts')`), runs `createThemeFromSeed`, then applies the font pairing, radius and density. Results are cached in memory. Unknown ids reject with the list of known ids. |
| `loadAllLibraryThemes()` | Loads every library theme (tests, galleries) |
| `clearLibraryThemeCache()` | Clears the cache (tests) |

The dynamic import keeps the palette engine out of the eager metadata chunk
in bundlers that split on `import()`.

**Where library themes show up today.** The gallery's Themes page
(`apps/gallery/src/pages/themes.astro`) renders all of them next to the
presets, the UI Kit prototype's Theme Lab previews them, and the CLI lists
and exports them. They are **not** added to a prototype's DevTools theme grid
automatically: a prototype's theme list is the built-in presets, its own
`definePrototype({ themes })` and its saved custom themes. To use a library
look in a prototype, start from its seed with `theme create --seed` or the
Theme Studio, or register the theme yourself.

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
| Build | Name the theme; pick a seed color (color picker or hex field) and, optionally, a secondary color; choose a font pairing from `FONT_CATALOG`, a corner radius (Square, Small, Medium, Default, Large, XL, Pill), elevation (`flat`, `soft`, `crisp`, `glow`), surface (Solid, Glass), motion (None, Subtle, Standard, Expressive), focus ring (`ring`, `outline`, `glow`, `inset`) and density (0.75–1.25 in 0.125 steps). The draft is built with `createThemeFromSeed`. |
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

**List** the six presets and the 32 library themes:

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
| Density | `theme.density`, 0.75–1.25 (default 1) | Part of the theme. DevTools → Look has a density slider (0.75–1.25) that is always a temporary override. `applyAppearance(el, { density: 'compact' \| 'comfortable' \| number })` accepts one too (`compact` = 0.875, `comfortable` = 1.125). |
| Viewport | `desktop`, `tablet`, `iphone`, `android`, `custom` | Not a theme setting, but resolved the same way. Narrows the app column (`data-py-viewport`); media queries still follow the real window. |
| Shell, device, orientation | `auto`, `none`, `phone`, `tablet`, `desktop-window`, `browser`, `widget-host`, `extension-popup`, `side-panel`; a catalog device; `portrait` / `landscape` | Not theme settings, but resolved the same way (override › scenario › manifest `preview`). The frame drawn around the app follows the theme and mode. See [SHELLS.md](SHELLS.md). |

## Precedence

The effective theme, mode and reduced-motion value each come from the first
layer that sets them:

| Order | Source | Set by |
| --- | --- | --- |
| 1 | `override` | DevTools → Look with "Temporary override" selected, Theme Studio's **Save and preview**, a link's `?theme=` / `?mode=`, `theme.setOverride()` |
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
| `packages/themes/tests/palette.test.ts` | `createThemeFromSeed` across 500 deterministic seeds, both modes |
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
