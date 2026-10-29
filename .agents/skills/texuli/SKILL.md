---
name: texuli
description: Build accessible, themed interfaces with Texuli by routing requests to local sub-skills for components, themes, media, installation, and contributions.
version: "0.2.3"
documentation_url: https://texuli.com/guides/
user-invocable: true
allowed-tools: Bash, Read, Grep, Glob
metadata: {"openclaw":{"emoji":"▣","homepage":"https://texuli.com/guides/","requires":{"anyBins":["bash","git"]}}}
---

# Texuli — interface skill

Use this skill to build accessible, token-themed UI with **Texuli**: primitives,
styled components, layouts, charts, media, data views, content blocks, decks,
drag and drop (sortable lists, boards, trees, canvases), workflow editors, the
rich text editor and Astro sites, and decks generated from JSON or Markdown. It also covers interfaces that agents write
as data (blueprints), including whole stateful screens in spec 0.3.0 JSON. This file is the
**router**. Detailed procedures live in neighboring sub-skills and in
[`router/`](router/). Read the matching guide before starting its workflow.
Everything needed to route ships in this pack — **no network** is required for
ordinary routing.

## When to use Texuli

| Situation | Use Texuli when… |
| --- | --- |
| New UI in a Texuli or Protoyard workspace | The app needs accessible components, themes, or media chrome on the Texuli stack |
| Design-system work | Tokens, forced-colors, or theme generation are in scope |
| Agent-driven UI | The developer wants a local skill pack instead of ad-hoc prompts |
| Agent-written blueprints | A tree or envelope must be validated, edited, painted or handed to an owner, never activated by the agent |

Do **not** treat this skill as a license to install software, change global
agent config, or publish packages without explicit consent (see
[`TRUST.md`](TRUST.md)).

## First run

1. If the developer wants this skill installed or updated, follow
   [`setup.sh`](setup.sh) and the host map in [`router/hosts.md`](router/hosts.md).
   Installing the skill does **not** install Texuli packages or a CLI.
2. Confirm the workspace has Texuli (workspace packages `texuli`,
   `@texuli/core`, `@texuli/tokens`, …) before promising package imports.
   All 19 published packages are on npm as `0.4.0` (published by CI with
   provenance; `latest` and `next` both point to it; pre-1.0, so a new minor
   may break and 1.0.0 will be the first stable release), so install them
   plainly (`pnpm add texuli`) and pin `0.4.0` or `^0.4.0`; the workspace packages
   stay `private: true`. `@texuli/drag` (the drag engine),
   `@texuli/workflows` (the workflow editor) and `@texuli/deck` (the deck
   engine behind the deck generator, first published in `0.4.0`) are in
   development but on npm as `0.4.0`. `@texuli/editor` (the rich text
   editor) is in development and not on npm: only a Texuli workspace can
   import it. `0.4.0` ships spec 0.4.0, the new catalog groups,
   `@texuli/primitives/sortable`, the data drag migrations, the player's
   interaction and the `@texuli/slides` v2 stage on `@texuli/deck`;
   `0.3.0` predates them all. The
   package and layer index is [`router/packages.md`](router/packages.md).
3. Route by intent using the table below and
   [`router/routes.md`](router/routes.md).

## Route by intent

| Developer intent | Read |
| --- | --- |
| Install or verify this skill pack on a host | [`setup.sh`](setup.sh), [`router/hosts.md`](router/hosts.md) |
| Trust boundary, consent, no network | [`TRUST.md`](TRUST.md) |
| Full routing table and sub-skill map | [`router/routes.md`](router/routes.md) |
| Which package or subpath exists, and its layer | [`router/packages.md`](router/packages.md) |
| Build or fix a component / layout / shell / screen | [`build-ui/SKILL.md`](build-ui/SKILL.md) |
| A deck from JSON or Markdown: layouts, validation, `DeckStage`, print and PPTX, the `deck` CLI and MCP tool | [`build-ui/references/decks.md`](build-ui/references/decks.md) |
| Drag and drop: sortable lists, groups, boards, trees, a canvas, a workflow editor | [`build-ui/SKILL.md`](build-ui/SKILL.md) (recipes) |
| Themes, palettes, forced-colors, AA contrast, theme CLI/MCP | [`themes/SKILL.md`](themes/SKILL.md) |
| Images, video, captions, compositions, export, generator slot | [`media/SKILL.md`](media/SKILL.md) |
| Validate, wrap, edit or paint an agent blueprint; envelope, player, agent service, spec contract; a whole stateful screen as JSON (state, bindings, actions, `reorder`, `workflow-graph`) | [`blueprints/SKILL.md`](blueprints/SKILL.md) |
| Contribute a primitive or texel | [`contribute/SKILL.md`](contribute/SKILL.md) |
| Install packages, copy (`texuli add`), customize or update components in an app | [`components/SKILL.md`](components/SKILL.md) |
| Check that following this skill yields valid, sink-free, axe-clean trees (golden evals) | [`evals/SKILL.md`](evals/SKILL.md) |

If a named sub-skill folder is not in this pack yet, stay on this router:
follow the repository `AGENTS.md`, package docs under `packages/*/docs/`, and
do not invent install URLs or CLI flags.

## Routing rules

- Keep the developer's requested scope. A one-line fix stays a one-line fix.
- Prefer Texuli public imports (`texuli/button`, `@texuli/core/roving`,
  `@texuli/tokens`) over deep `src/internal` paths.
- Class composition uses Texuli `cx` / `variants` (`texuli/cx`). Never add
  `clsx`, `tailwind-merge`, or `tailwind-variants`.
- WCAG 2.x contrast (AA) in light, dark and `forced-colors` is the contrast
  gate. APCA is out of scope.
- No `{@html}`, `eval`, or `new Function` on untrusted data. Media and link
  URLs go through the URL policy texels.
- **No network** for routing, reading this pack, or local validation. A
  package install, skill install, or docs fetch needs explicit developer
  consent first.

## Commands that always work offline

From a Texuli repository checkout (this pack's parent monorepo):

```bash
# Validate this skill pack (frontmatter, required files, local links, checksums)
pnpm exec tsx scripts/check-skill.ts

# Or the root script (same check)
pnpm check:skill

# Verify checksums only
./skills/texuli/setup.sh --verify

# List supported agent hosts (no install)
./skills/texuli/setup.sh --list-hosts
```

Dry-run an install without writing:

```bash
./skills/texuli/setup.sh --host claude --dry-run
```

## Integrity

`SHA256SUMS` lists every file in this pack. After any edit, regenerate it from
the monorepo:

```bash
pnpm exec tsx scripts/check-skill.ts --write-sums
```

Then `./skills/texuli/setup.sh --verify` must exit 0.

## Local references

- [`TRUST.md`](TRUST.md) — permissions and consent
- [`router/routes.md`](router/routes.md) — intent → guide map
- [`router/hosts.md`](router/hosts.md) — host skill folders
- [`router/packages.md`](router/packages.md) — packages, layers and entries
- Product docs (network): <https://texuli.com/guides/>
