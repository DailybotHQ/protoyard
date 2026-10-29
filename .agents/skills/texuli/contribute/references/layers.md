# Contribute — layer map

| Layer | Package | What goes here | Must not import |
| --- | --- | --- | --- |
| L0 | `@texuli/core` | Texels: framework-free behavior and DOM policy | Svelte, any other package |
| L0 | `@texuli/deck` | The framework-free, dependency-free deck engine (model v2, Markdown, layouts, navigation; in development, on npm from `0.4.0`) | Svelte, the DOM at import, any other package |
| L0 | `@texuli/spec` | The schema-first blueprint contract and its TypeScript and Kotlin projections | Any other package |
| L1 | `@texuli/primitives` | Owned headless Svelte controls on the texels | `texuli`, another component library |
| L2 | `@texuli/tokens` | Theme engine, `--tx-*` contract, themes, CSS | Components |
| L3 | `texuli` | Styled components, layouts, shells | Domain packages |
| L4 | `@texuli/charts`, `@texuli/data`, `@texuli/media`, `@texuli/chat`, `@texuli/editor` | Domain kits (the editor is in development and not on npm) | Blocks, catalog and above |
| L5 | `@texuli/blocks` | Content blocks for pages, documents and slides | Catalog and above |
| L6 | `@texuli/catalog` | Manifests, the sink-free renderer, validation, envelope, edit ops, player core | Svelte paint above it |
| L7 | `@texuli/player` | The Svelte paint of validated blueprints | Tools, adapters |
| L8 | `@texuli/slides`, `@texuli/tools`, `@texuli/astro` | The deck stage on `@texuli/deck` and the player; CLI, MCP, custom elements, golden set; the Astro integration | — |
| App | `apps/website`, `apps/agent`, fixtures | The site, the agent service, demos | — |

`scripts/check-layers.ts` enforces this map (`pnpm check:layers`): a package
imports only from lower layers, never another package's `src/`.

## Coupled artifacts

A catalog **manifest** change also refreshes, in the same change:
- the spec vocabulary: `pnpm exec tsx packages/spec/scripts/bootstrap-catalog.ts`,
  then `pnpm exec tsx packages/spec/scripts/generate.ts`, otherwise
  `pnpm vitest run packages/spec` fails its parity test;
- the website's catalog and llms snapshots, regenerated with the commands in
  `apps/website/docs/site-agents-page.md`;
- the native web traces when a golden or a semantic rule changes:
  `pnpm exec tsx native/conformance/web/trace.ts --write`.

## Import rules

- **Texels:** `import { createRovingFocus } from '@texuli/core/roving'`
- **Primitives:** `import * as Dialog from '@texuli/primitives/dialog'`
- **Styled:** `import { Button } from 'texuli/button'`
- **Class helpers (above texuli):** `import { cx, variants } from 'texuli/cx'`
- **Inside texuli package:** `import { cx } from '../../internal/cx.ts'`
- Never `clsx`, `tailwind-merge`, `tailwind-variants`.
- Never `{@html}` on agent or user strings.
- Money stays integer cents; fictional data only in demos.
