# @protoyard/blocks

The framework-free engine for Protoyard's shared content blocks
([ADR-037](../../docs/DECISIONS.md)). Decks, pages and docs are built from the
same bounded, data-only blocks: headings, rich text, stats, charts, tables,
media, code, diagrams and interactive pieces. This package holds their
contracts and pure helpers. It never imports Svelte, a UI package, the
database or `@protoyard/blueprint` (the blueprint imports blocks, not the
other way round). The Svelte half is
[`@protoyard/blocks-ui`](../blocks-ui/README.md).

> **Status:** the static content blocks are defined (schemas, types, parse
> helpers). Interactive and container blocks beyond `columns`, the untrusted
> guard, the JSON Schema and the subpath engines land in later PLAN_005 tasks.

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
import { safeParseBlocks, type Block } from '@protoyard/blocks';

const result = safeParseBlocks(input);
if (!result.success) {
  for (const issue of result.issues) console.log(issue.jsonPath, issue.message);
  // $[2]["actions"][0]["href"]  Use an http(s), mailto, #anchor or relative link
}
```

| Export | What it is |
| --- | --- |
| `BlockSchema`, `Block`, `BlockType` | One block, a strict zod union discriminated on `type` |
| `BlockListSchema`, `safeParseBlocks` | A list of blocks; ids must be unique across the list and nested columns |
| `safeParseBlock`, `blockIssues`, `toJsonPath` | Never-throwing parsing; issues carry `path` and a `jsonPath` like `$[0]["items"][2]` (the blueprint authoring format) |
| `<Type>BlockSchema`, `<Type>Block` | One schema and type per block |
| `BLOCK_TYPES`, `BLOCK_TYPE_FAMILY` | Every type and its render family |
| `forEachBlock`, `containerDepth` | Depth-first walk with paths; columns nesting depth |
| `BLOCK_CONTENT_LIMITS` | Per-block caps (below) |
| `classifyMediaSource`, `ImageSourceSchema`, `VideoSourceSchema`, `AvatarIdSchema`, `MEDIA_DATA_URI_MAX_BYTES` | The media source policy |
| `LinkHrefSchema`, `IconNameSchema`, `BlockIdSchema`, `BlockStepSchema`, `BLOCK_REVEALS`, `BlockToneSchema` | Shared field schemas |
| `ChartSpecSchema`, `parseChartSpec`, `ChartSpec` | Re-exported from `@protoyard/ai/chart`, unchanged |
| `BLOCK_TONES`, `isBlockTone`, `BLOCK_FAMILIES`, `isBlockFamily` | The tone and render-family vocabulary |

Root entry size: 5.3 KB gzip minified with zod external (it includes the chart
spec, `safeHref` and the avatar id rules).

### Block types

Every block may carry `id` (`/^[a-z][a-z0-9-]{0,47}$/`), `step` (0–32, slide
fragments), `reveal` (`fade`, `fade-up`, `grow`, `highlight`, `strike`) and
`tone`. Unknown keys are errors, so `style`, `class` or `html` never pass.

| Family | Type | Main fields and limits |
| --- | --- | --- |
| text | `heading` | `text` ≤ 200, `level` 1–4, `eyebrow`, `subtitle`, `align` |
| text | `text` | `markdown` ≤ 4,000, `size`, `align` |
| text | `list` | `items` 1–12 (`text` markdown ≤ 600, `icon`, `done`), `style` bullet/number/check/icon |
| text | `quote` | `quote` ≤ 600, `cite`, `role`, `avatar` id |
| text | `callout` | `body` markdown ≤ 1,000, `title`, `icon` |
| text | `divider` | `label`, `variant` line/space |
| media | `image` | `src`, `alt` (or `decorative: true`), `width` and `height` 1–4,096, `caption`, `credit`, `fit` |
| media | `video` | `src`, `label`, `width`, `height`, `poster`, `autoplay` (needs `muted: true`), `loop`, `controls` |
| media | `people` | `people` 1–24 (`name`, `role`, `avatar` id, `bio`), `layout` |
| data | `stat` | `items` 1–6 (`value`, `label`, `delta`, `deltaTone`, `context`, `trend` 2–60 numbers), `source` |
| data | `table` | `caption` (required), `columns` 1–8 (`format` text/number/percent/cents), `rows` ≤ 50 with one typed cell per column, `currency`, `highlightRow` |
| data | `chart` | `spec` (`ChartSpecSchema`: line, area, bar, donut, pie, funnel; ≤ 366 points, ≤ 8 series), `height`, `showTable` |
| code | `code` | `code` ≤ 20,000 characters and 400 lines, `lang` ts/js/json/bash/python/html/css/sql/text, `highlights` ≤ 16 steps like `"1-2,4"` |
| structure | `timeline` | `events` 2–12 (`time`, `title`, `body`, `icon`, `tone`), `orientation` |
| structure | `steps` | `items` 2–8 (`title`, `body`, `icon`), `numbered` |
| structure | `comparison` | `columns` 2–4 (`label`, `highlight`), `rows` 1–8 with one text or boolean per column |
| structure | `cards` | `items` 1–12 (`title`, `eyebrow`, `body`, `icon`, `image` + `imageAlt`, `href`, `tone`), `columns` 2–4 |
| structure | `icon` | `icon`, `label` (or `decorative: true`), `size` |
| structure | `cta` | `actions` 1–3 (`label`, `href`, `variant`, `icon`), `title`, `body`, `footnote` |
| structure | `columns` | `columns` 2–4, each 1–12 blocks, nested at most 3 deep; `widths`, `align` |

### Text, links and media

- **Text:** single-line fields reject line breaks. Markdown accepts line
  breaks (LF or CRLF), and code also accepts tabs. Every field rejects other
  control characters and the bidi embeddings, overrides and isolates used for
  spoofing.
- **Links** (`cta`, `cards`) must be http(s), mailto, an `#anchor` or a
  relative path that `safeHref` returns unchanged. `javascript:`, `data:`,
  `vbscript:`, `file:` and protocol-relative `//host` are rejected.
- **Media sources** are one of:
  - `avatar:av-007`, an image from `@protoyard/avatars`;
  - `data:image/png;base64,…` (png, jpeg, webp, gif) or `data:video/mp4;base64,…`
    (mp4, webm), at most 192 KB decoded;
  - a relative path such as `assets/cover.webp`, for level-2 prototypes only.
    The level-1 player refuses relative sources in its untrusted-input guard.

  SVG, `http(s)`, protocol-relative URLs, root-absolute paths, backslashes and
  `..` segments are always rejected. `classifyMediaSource` returns the kind and
  decoded bytes so hosts can apply per-level rules and the 512 KB per-document
  cap.
- **Icons** are kebab-case Lucide names for now. T-blocks-icons narrows them to
  the `BLOCK_ICONS` allow-list.

## Subpaths

| Subpath | Engine | Filled by |
| --- | --- | --- |
| `./formula` | Closed JSON-AST formulas for calculator blocks (no `eval`) | T-blocks-formula |
| `./interactive` | Pure reducers and the `BlockStateHost` contract | T-blocks-interactive-reducers |
| `./code` | Tiny code tokenizer with stepped line highlights | T-blocks-code-tokenizer |
| `./diagram` | Flow, tree, board and terminal layout math | T-blocks-diagram-models |
| `./catalog` | `BLOCK_CATALOG` authoring metadata (use-when, limits, examples) | T-blocks-catalog |

The untrusted-input guard, the JSON Schema and the text helpers will also be
exported from the root entry.

## Package output

The manifest keeps TypeScript source exports for workspace development.
`pnpm build:packages --filter @protoyard/blocks` creates the ESM and declaration
files under `dist/` that the packed manifest exposes.
