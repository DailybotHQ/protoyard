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
| `BLOCK_ICONS`, `BlockIcon`, `isBlockIcon` | The icon allow-list |
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
| code | `code` | `code` ≤ 20,000 characters and 400 lines, `lang` ts/js/json/bash/python/html/css/sql/yaml/text, `highlights` ≤ 16 steps like `"1-2,4"` |
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
- **Icons** come from `BLOCK_ICONS`: 96 kebab-case Lucide names, a superset
  of the blueprint's screen navigation icons, used by the icon block and the
  icons on list items, callouts, steps, timeline events, cards and CTAs. Any
  other name fails validation (`isBlockIcon`, `IconNameSchema`).
  `@protoyard/blocks-ui` maps each name to a statically imported component.

## Subpaths

| Subpath | Engine | Filled by |
| --- | --- | --- |
| `./formula` | Closed JSON-AST formulas for calculator blocks; see [Formulas](#formulas-protoyardblocksformula) | done |
| `./interactive` | Pure reducers and the `BlockStateHost` contract | T-blocks-interactive-reducers |
| `./code` | Tiny code tokenizer with stepped line highlights; see [Code](#code-protoyardblockscode) | done |
| `./diagram` | Flow, tree, board and terminal layout math | T-blocks-diagram-models |
| `./catalog` | `BLOCK_CATALOG` authoring metadata (use-when, limits, examples) | T-blocks-catalog |

### Diagram models (`@protoyard/blocks/diagram`)

The diagram subpath validates four strict data models and computes deterministic
positions and edges. Renderers draw these records as HTML or SVG and keep labels
as text; the engine never creates images or markup.

```ts
import { layoutFlow, parseDiagram } from '@protoyard/blocks/diagram';

const parsed = parseDiagram({
  type: 'flow',
  nodes: [{ id: 'brief', label: 'Write a brief' }, { id: 'build', label: 'Build' }],
});
if (parsed.success) layoutFlow(parsed.data);
```

`DiagramSchema` is the discriminated union, with individual
`FlowDiagramSchema`, `TreeDiagramSchema`, `BoardDiagramSchema` and
`TerminalDiagramSchema` exports. `parseDiagram` never throws and reports
`jsonPath` diagnostics. Layouts are computed by `layoutFlow`, `layoutTree`,
`layoutBoard` and `layoutTerminal`; each returns canvas dimensions, node or line
positions, and edges. Limits are 12 flow nodes, 64 tree nodes at depth 6, 6
board columns with 8 cards each, and 40 terminal lines. Tree ids and parents
must form an acyclic forest; board and flow ids are unique. Status colors use
the shared tone allow-list, never CSS values.

The untrusted-input guard, the JSON Schema and the text helpers will also be
exported from the root entry.

## Formulas (`@protoyard/blocks/formula`)

Calculator blocks compute their outputs with formulas. A formula is a closed
JSON AST, never a string: nothing in it is parsed as code or executed.

```ts
import { evaluateFormula, formatFormulaValue, parseFormula } from '@protoyard/blocks/formula';

const parsed = parseFormula(
  {
    op: 'mul',
    left: { op: 'var', name: 'seats' },
    right: {
      op: 'if',
      test: { op: 'gte', left: { op: 'var', name: 'seats' }, right: { op: 'num', value: 10 } },
      ifTrue: { op: 'num', value: 900 },
      ifFalse: { op: 'num', value: 1200 },
    },
  },
  { variables: ['seats'] }
);
if (parsed.success) {
  formatFormulaValue(evaluateFormula(parsed.formula, { seats: 12 }), 'cents'); // "$108.00"
}
```

| Kind | Ops |
| --- | --- |
| Number | `num` (finite, at most ±1e15), `var` (lowerCamelCase input name), `add`, `sub`, `mul`, `div` (`left`, `right`), `pow` (`base`, `exponent`), `min`, `max` (`args`, 2–8), `round` (`value`, `digits` −6…6), `clamp` (`value`, `min`, `max`), `if` (`test`, `ifTrue`, `ifFalse`) |
| Condition | `lt`, `lte`, `gt`, `gte`, `eq`, `neq` (`left`, `right` numbers), `and`, `or` (`args` 2–8 conditions), `not` (`value`) |

- **Types are separate.** A condition can only appear as an `if` test or
  inside `and`/`or`/`not`. Using one where a number belongs (or the reverse)
  is a `type-mismatch` diagnostic.
- **Limits (`FORMULA_LIMITS`):** at most 64 nodes and 12 levels. A preflight
  rejects oversize arrays, cycles and non-plain objects before any recursive
  parsing.
- **`parseFormula(input, { variables? })`** never throws. It returns the
  formula and its free variables, or diagnostics with `code`, `jsonPath` and
  `hint`. The codes are `formula-too-large`, `formula-too-deep`,
  `cyclic-formula`, `invalid-container`, `type-mismatch`, `unknown-op`,
  `unknown-variable` and `invalid-formula`.
- **`evaluateFormula(formula, inputs)`** is pure. It reads only own input
  properties and never throws. It returns `null` for:
  - a missing, null or non-finite input;
  - division by zero, NaN or ±Infinity;
  - a `pow` exponent beyond ±64;
  - `clamp` with min > max.

  `null` propagates through every operation. Conditions use three-valued
  logic: `and` with one false operand is false even if another is undefined.
  `round` rounds half away from zero.
- **`formatFormulaValue(value, unit, options)`** uses the chart-spec units:
  `number`, `compact`, `cents` (integer minor units) and `percent` (a ratio).
  It defaults to the `en-US` locale so output is stable, and shows `—` for
  `null`.
- The branches are named `ifTrue`/`ifFalse`, not `then`/`else`, so a formula
  node is never mistaken for a promise.
- **Size:** 3.1 KB gzip minified for the whole subpath with zod external. The
  evaluator and formatter alone are 1.4 KB.

## Code (`@protoyard/blocks/code`)

Code blocks are highlighted by a tiny pure-TypeScript tokenizer. It replaces a
303 KB highlight.js, and nothing loads from a CDN.

```ts
import { resolveHighlightSteps, splitTokenLines, tokenizeCode } from '@protoyard/blocks/code';

const lines = splitTokenLines(tokenizeCode('const a = 1;', 'ts'));
// [[{ kind: 'keyword', text: 'const' }, { kind: 'plain', text: ' a ' }, …]]
resolveHighlightSteps(['1-2,4', [[3, 5]]], 4); // [[1, 2, 4], [3, 4]]
```

- **Languages:** `ts`, `js`, `json` (JSONC comments allowed), `bash`, `python`,
  `html`, `css`, `sql` and `yaml`. Aliases such as `typescript`, `tsx`, `sh`,
  `zsh`, `py`, `yml` and `postgres` resolve with `resolveCodeLanguage`. Any
  other language, including `text`, is one plain token.
- **Output:** `{ kind, text }` tokens, where `kind` is one of
  `CODE_TOKEN_KINDS`: plain, keyword, string, number, comment, operator,
  punctuation, function, type, property, constant, variable, tag and attr.
  Adjacent tokens of one kind are merged, and the token texts always
  concatenate back to the input. Renderers map kinds to theme-token classes
  and print text; tokens are never HTML.
- **Linear time:** each grammar is a few states of sticky regex rules,
  compiled into one alternation per state, so there is one `exec` per position.
  - An opening delimiter always matches: an unterminated string ends at its
    line, and an unterminated block comment, template literal or triple-quoted
    string at the end of the input. No position is scanned twice.
  - Keywords are set lookups after a word match.
  - The only lookahead that could scan far (CSS nested rules) is bounded to
    200 characters.
  - Tests time 20 KB pathological inputs, such as runs of `"\`, `/*`, `${`
    and `a{`, in every grammar. The budget is 50 ms; the measured worst
    median is about 7 ms on a heavily loaded machine.
- **Cap:** the first 20,000 characters are tokenized
  (`CODE_TOKENIZE_MAX_LENGTH`), and the rest is one plain token.
- **Highlight steps:** `resolveHighlightSteps(steps, lineCount)` accepts the
  schema's `"1-2,4"` specs or `[[1, 2], 4]` lists. It returns sorted, unique
  lines clamped to the code, and a malformed step highlights nothing.
- **Limits:**
  - Grammars are honest approximations, not parsers.
  - JS regex literals are not detected.
  - `${…}` stays inside its template string.
  - HTML does not re-tokenize `<script>` or `<style>` bodies.
  - Nested CSS blocks return to the selector state after an inner `}`.
- **Size:** 4.4 KB gzip minified for all nine grammars. One grammar with
  `tokenize` imported directly (for example `typescriptGrammar`) is 2.1 KB.

## Package output

The manifest keeps TypeScript source exports for workspace development.
`pnpm build:packages --filter @protoyard/blocks` creates the ESM and declaration
files under `dist/` that the packed manifest exposes.
