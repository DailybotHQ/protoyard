---
"@protoyard/themes": minor
"@protoyard/devtools": minor
"@protoyard/cli": minor
---

Design systems from Texuli: `createDesignSystem` builds a Texuli design-system document from a brief or a few inputs (colors, fonts, shape, density, motion, contrast). `designSystemFromTheme` imports any Protoyard theme. `compileDesignSystemDocument` validates and compiles a document at `trust: 'untrusted'` with Texuli's compile-core, and `defineDesignSystemTheme` applies it with `applyDesignSystem`. The CLI gains `protoyard ds new|validate|export|use`, `protoyard mcp` gains `ds_create`, `ds_validate`, `ds_export` and `ds_use`, and Theme Studio gains a Design system panel. The compiler loads only on demand; a prototype without a design system does not grow.
