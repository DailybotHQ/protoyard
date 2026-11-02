---
name: texuli-design-systems
description: Author, validate, repair, apply and export a Texuli design system (one closed JSON document for a whole brand) — importers, the ds.* MCP operations, texuli ds, stable error codes, blueprint designSystem. New in 0.10.0.
version: "0.3.13"
documentation_url: https://texuli.com/guides/
user-invocable: true
allowed-tools: Bash, Read, Grep, Glob, Edit, Write
metadata: {"openclaw":{"emoji":"▣","homepage":"https://texuli.com/guides/","requires":{"anyBins":["bash","git"]}}}
---

# Design systems

Use this sub-skill when the developer wants **a brand as data**: one
design-system document (format `texuli/design-system`, `formatVersion` 1)
that every Texuli surface follows: components, the blueprint player,
documents, decks, email, PDF, DOCX, PPTX, canvas and the Kotlin twin. For a
quick library theme instead, use [`../themes/SKILL.md`](../themes/SKILL.md).

> **Released in `0.10.0`.** The document, compiler, runtime, importers,
> the `ds.*` operations and `texuli ds` ship from `0.10.0` (install
> `^0.12.0`); the 0.9 line does not have them, so an app pinned to
> `^0.9.0` moves up first ([`../upgrade/SKILL.md`](../upgrade/SKILL.md))
> or stays on themes.

Guide (monorepo): `docs/DESIGN_SYSTEMS.md`. Reference: the document
`packages/spec/docs/design-system.md`, the compiler
`packages/tokens/docs/design-system-compiler.md`, importers and emitters
`packages/tokens/docs/design-system-io.md`, the operations
`packages/tools/docs/ds.md`. Example brands (fictional):
`examples/design-systems/` (`quillmark`, `ledgerline`, `tumbletown`).

## Rules

- **Data only.** Colors are `#rgb`, `#rrggbb`, `#rrggbbaa` or a numeric
  `oklch()`; lengths are numbers in px; everything else is an enum, a font
  name or a relative asset path. Never write CSS strings, `var()`, scripts,
  remote URLs or (from an agent) `data:` URLs.
- **Closed objects.** An unknown key is refused (`unknown-key`); copy field
  names from `texuli://design-system/acme`, which shows every section.
- **Fictional brands only** (`example.com`, "Example Co."); never a real
  company's name, colors or logo.
- **Never claim it passes** without a `ds.validate` (or `texuli ds
  validate`) result with `valid: true`.
- **Nothing activates.** Saving needs an explicit path (`ds.save`, local
  only); a blueprint stays a `draft` until its owner activates it.

## Author

1. **Start from what exists** (the MCP tool, or the CLI in a checkout):

   | The developer has | Call |
   | --- | --- |
   | A few words and colors | `ds.import` `{ "from": "brand", "input": "name Example, brand #0e7490, font Inter, rounded, compact" }` |
   | One to three colors | `ds.suggest` `{ "colors": ["#0e7490", "#f59e0b"] }` |
   | A logo | `ds.suggest` `{ "pixels": [r, g, b, a, …] }` (RGBA, at most 128 × 128) |
   | A DTCG or Tokens Studio file | `ds.import` `from` `dtcg` or `tokens-studio` |
   | A flat role palette (light and dark roles) | `ds.import` `from` `role-palette` |
   | A Texuli theme | `ds.import` `{ "from": "theme", "input": "ocean" }`, or `"extends": "texuli:ocean"` |

   Read every warning: each names a value that was dropped and why.
2. **Write only what the brief asks for**: identity (`id` lowercase with
   hyphens, semver `version`, `name`), `color.brand.seed` (plus
   `secondary`, `accent`, `neutral`), then `typography.families`,
   `shape.radius`, `space.density`, `elevation.style`, `motion.personality`,
   `components.<id>.defaults`, `accessibility` (`contrast` AA or AAA,
   `targetMin`). Pin a color (`color.pin.primary`) only when the brand
   requires that exact fill.
3. **Variants** (`high-contrast`, `compact`) are partial documents under
   `variants`; every variant compiles in light and dark.

## Validate and repair

Call `ds.validate` with `{ "document": … }` (bases for `extends:
"id@x.y.z"` go in `bases`). Fix every error by its `code` and `path`, then
validate again, until `valid` is true. The codes and their fixes:
[`references/codes.md`](references/codes.md). Then call `ds.contrast`: every
mode must report `failing: 0`.

## Apply and export

| Goal | Call |
| --- | --- |
| A blueprint follows it | `blueprint.theme` `{ "blueprint": <tree or envelope>, "designSystem": { "inline": <document> } }` (or `{ "ref": "id@x.y.z" }`, `{ "ref": "texuli:ocean" }`), then `blueprint.validate` |
| A stylesheet | `ds.compile` `format` `css` (scoped `[data-tx-ds="<id>"]`, `.dark`) or `tailwind` |
| Token files | `ds.compile` `format` `dtcg` or `tokens-studio` (lossless round trip) |
| A review snapshot | `ds.preview` `svg` or `html` (deterministic) |
| A change review | `ds.diff` `{ "before": …, "after": … }` |
| A file in the project | `ds.save` `{ "path": "design-systems/<id>.ds.json", "document": … }` (local server only), or `texuli ds init` |

In app code (a checkout on the branch): `compileDesignSystem` then
`applyDesignSystem(el, compiled, { mode })`, `<DesignSystemProvider
{compiled} {mode}>` from `texuli/design-system`, `designSystemStyle` for
server HTML, the Astro `designSystem` option, or `<Player designSystems={{
resolve, mode }}>` for blueprints. Details: the guide.

## CLI (`texuli ds`, from `0.10.0`)

```bash
texuli ds init design-systems/example.ds.json --name Example
texuli ds validate design-systems/example.ds.json
texuli ds compile design-systems/example.ds.json --format css --out dist/example.css
texuli ds preview design-systems/example.ds.json --out review/example.svg
texuli ds check design-systems/example.ds.json --json
```

Exit codes: 0 valid, 1 refused, 2 could not run. MCP tools, prompt and
resources: [`references/mcp.md`](references/mcp.md).

## Verify (monorepo)

```bash
pnpm vitest run packages/tokens/tests/examples.test.ts
pnpm vitest run packages/tools/tests/ds-ops.test.ts
pnpm vitest run tests/agent-evals
```
