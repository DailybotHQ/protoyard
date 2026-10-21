# @protoyard/blocks

The framework-free engine for Protoyard's shared content blocks
([ADR-037](../../docs/DECISIONS.md)). Decks, pages and docs are built from the
same bounded, data-only blocks: headings, rich text, stats, charts, tables,
media, code, diagrams and interactive pieces. This package holds their
contracts and pure helpers. It never imports Svelte, a UI package, the
database or `@protoyard/blueprint` (the blueprint imports blocks, not the
other way round). The Svelte half is
[`@protoyard/blocks-ui`](../blocks-ui/README.md).

> **Status:** scaffold. The root entry exports the shared vocabulary (tones
> and render families). The subpaths below are reserved: they have no runtime
> exports yet and are filled by the PLAN_005 tasks named in the table.

## Rules every block follows

- **Data only.** Blocks are JSON validated by zod. Nothing in a block is
  executed or rendered as HTML.
- **Rich text** is a markdown string (at most 4,000 characters) parsed by
  `@protoyard/ai/markdown` at render time.
- **Charts** use `ChartSpecSchema` from `@protoyard/ai/chart`, unchanged.
- **Colors are tones**, never CSS, hex values or style strings.
- **Media at level 1** is limited to avatar ids and raster `data:` images (png,
  jpeg, webp, gif). There is no SVG, no remote `https` and no iframe.
- **Interactive state** changes through pure reducers behind a
  `BlockStateHost`; the kind runtime persists it through a service.

## Root entry

```ts
import { BLOCK_FAMILIES, BLOCK_TONES, isBlockFamily, isBlockTone } from '@protoyard/blocks';
```

| Export | What it is |
| --- | --- |
| `BLOCK_TONES`, `BlockTone`, `isBlockTone` | `neutral`, `accent`, `info`, `success`, `warning`, `danger`; renderers map each tone to theme tokens |
| `BLOCK_FAMILIES`, `BlockFamily`, `isBlockFamily` | The render families, one lazy `@protoyard/blocks-ui/<family>` subpath each: `text`, `media`, `data`, `structure`, `code`, `diagram`, `interactive`, `map`, `embed` |

## Subpaths

| Subpath | Engine | Filled by |
| --- | --- | --- |
| `./formula` | Closed JSON-AST formulas for calculator blocks (no `eval`) | T-blocks-formula |
| `./interactive` | Pure reducers and the `BlockStateHost` contract | T-blocks-interactive-reducers |
| `./code` | Tiny code tokenizer with stepped line highlights | T-blocks-code-tokenizer |
| `./diagram` | Flow, tree, board and terminal layout math | T-blocks-diagram-models |
| `./catalog` | `BLOCK_CATALOG` authoring metadata (use-when, limits, examples) | T-blocks-catalog |

Block schemas, limits, the untrusted-input guard, the JSON Schema and the text
helpers will be exported from the root entry.

## Package output

The manifest keeps TypeScript source exports for workspace development.
`pnpm build:packages --filter @protoyard/blocks` creates the ESM and declaration
files under `dist/` that the packed manifest exposes.
