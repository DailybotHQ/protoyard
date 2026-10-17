---
name: add-theme
description: Add a Protoyard theme — a prototype-specific theme passed to definePrototype or a new built-in preset in BUILTIN_THEMES — with light and dark palettes that pass the WCAG contrast test.
version: "1.0.0"
user-invocable: true
allowed-tools: Bash, Read, Grep, Glob, Edit, Write
# === Documentation (ignored by harnesses, useful for humans) ===
tier: standard
intent: create
max-files: 4
---

# Skill: Add a theme

## Goal

Ship a theme whose light and dark palettes validate with `ThemeSchema`
(`packages/core/src/theme.ts`) and meet WCAG AA: 4.5:1 for every pair in
`TEXT_CONTRAST_PAIRS` and 3:1 for `UI_CONTRAST_PAIRS`
(`packages/themes/src/contrast.ts`).

## When to use

- A prototype needs its own brand look (prototype theme).
- The platform should offer another preset to every prototype (built-in) —
  this changes `packages/themes`, so agree with its owner first.

## Inputs

- Theme `id` (kebab-case), name, the brand colors, and the scope
  (prototype or built-in).

## Steps — prototype theme

1. Create `prototypes/<slug>/src/theme.ts`. Start from a preset so every
   token is defined, then override what the brand needs:
   ```ts
   import { defineTheme } from '@protoyard/core';
   import { violetTheme } from '@protoyard/themes/presets';

   export const brandTheme = defineTheme({
     ...violetTheme,
     id: 'brand',
     name: 'Brand',
     description: 'Brand colors for this prototype.',
     light: { ...violetTheme.light, primary: '#0f5bd8', ring: '#0f5bd8' },
     dark: { ...violetTheme.dark, primary: '#7fb0ff', primaryForeground: '#0b1b33', ring: '#7fb0ff' },
   });
   ```
   Colors are hex (`#rgb` / `#rrggbb`) so the contrast math can verify them.
2. Register it: `definePrototype({ …, themes: [brandTheme] })` in
   `src/prototype.ts`. The renderer offers it next to `BUILTIN_THEMES`.
3. Optionally make it the default: `"defaultTheme": "brand"` in
   `protoyard.json`.
4. The prototype now imports `@protoyard/themes`: add
   `"@protoyard/themes": "workspace:*"` to `prototypes/<slug>/package.json`
   and ask the lockfile owner to run `pnpm install`.
5. Test in `prototypes/<slug>/tests/theme.test.ts`, mirroring
   `packages/themes/tests/contrast.test.ts`: for `light` and `dark`, every
   `TEXT_CONTRAST_PAIRS` ratio ≥ 4.5 and every `UI_CONTRAST_PAIRS` ratio ≥ 3
   using `contrastRatio` from `@protoyard/themes`, and
   `ThemeSchema.parse(brandTheme)` round-trips.

## Steps — built-in preset

1. Add a `preset({ id, name, description, base, accent })` call in
   `packages/themes/src/presets.ts` using the scales in
   `packages/themes/src/scales.ts`, and append it to `BUILTIN_THEMES`.
2. Update the expected id list in `packages/themes/tests/contrast.test.ts`
   (it pins the preset ids); the per-mode AA test then covers the new preset
   automatically.
3. Document it in `packages/themes/README.md`.

## Validation

```bash
pnpm vitest run packages/themes                      # built-in
pnpm vitest run prototypes/<slug>/tests/theme.test.ts # prototype theme
pnpm --filter @prototype/<slug> typecheck
pnpm protoyard dev <slug>   # check light, dark and system with ?theme=<id>&mode=dark
```

## Notes

- Components never hard-code colors; they use token classes or
  `var(--py-*)` (`tokenToCssVar` in `packages/core/src/theme.ts`).
- If a ratio fails, adjust the color; never lower the threshold.
- Charts use `chart1` … `chart5`; keep them distinguishable in both modes.
