# AGENTS.md — Docs Wiki (`docs-wiki`)

The entry point for agents working on this prototype. Repository-wide rules
live in the root [AGENTS.md](../../AGENTS.md); the spec standard is
[docs/SPECS.md](../../docs/SPECS.md).

## Index

- [docs/SPEC.md](docs/SPEC.md): problem, users, capabilities, honest boundaries, rebuild path
- [docs/DATA_MODEL.md](docs/DATA_MODEL.md): tables, indexes, relations, schema versions
- [docs/FLOWS.md](docs/FLOWS.md): user flows mapped to services, capabilities and tables
- [docs/SCREENS.md](docs/SCREENS.md): routes, screens and their states
- [docs/PERMISSIONS.md](docs/PERMISSIONS.md): roles × capabilities, rules, personas

## Rules for this prototype

- **Never render page Markdown as HTML.** Bodies go through `PageBody.svelte`
  (the views-ui `MarkdownPreview` over the shared safe parser from
  `@protoyard/ai/markdown`), which builds elements and text only. No
  `{@html}`, ever. Search highlights are text segments (`highlight()`), shown
  in `<mark>` elements by `Highlighted.svelte`.
- **Every save writes its version in the same transaction** as the page
  (`pages.create`, `pages.save`, `pages.restore`, `spaces.create`). A restore
  adds a new version; history is never rewritten. Moving a page changes its
  place, not its content, so it adds no version.
- **Saves carry `baseVersion`.** A newer stored version refuses the save with
  a field error instead of overwriting someone else's edit.
- **The tree** is `{ id, parentId, rank }` per space, with ranks from
  `rankBetween` (`@protoyard/views/board`). Moves stay inside a space and
  never put a page inside itself (`wouldCycle`). Only leaf pages can be
  deleted.
- **The `active` scenario's "Markdown safety check" page** holds hostile
  Markdown (`HOSTILE_BODY`) on purpose: the safe-render test and the E2E rely
  on it. Keep it.

## Quick commands

<!-- protoyard:generated:commands -->
```bash
pnpm protoyard dev docs-wiki                  # run it (DevTools included)
pnpm vitest run prototypes/docs-wiki          # unit + integration tests
pnpm protoyard validate docs-wiki --build     # contract, schema, build
pnpm protoyard spec docs-wiki --check         # generated spec regions are current
pnpm protoyard export docs-wiki               # relocatable ZIP
```
<!-- /protoyard:generated:commands -->
