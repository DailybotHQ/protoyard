# Docs Wiki

A Protoyard starter for docs, wikis and knowledge bases: **spaces**, a nested
**page tree**, a **Markdown editor with a safe preview**, every save kept as a
**version** you can restore, and **full-text search**.

| Screen | What it does |
| --- | --- |
| **Home** | Search, the spaces with page counts, recently updated pages; **New space** (owner) |
| **Space** | The page tree (`@protoyard/views-ui/tree`: keyboard, typeahead, drag or "Move to…") and recent changes |
| **Page** | Breadcrumb, the body rendered safely, subpages; **Edit**, **History**, **New subpage**, **Delete** (leaf pages) |
| **Edit page** | Title and the `@protoyard/views-ui/editor` Markdown editor in split mode with a live preview (lazy chunk) |
| **Page history** | Every version with author, time and changed lines; preview any of them and **Restore** |
| **Search** | Every word must match the title or the text; title matches rank first; highlighted snippets; space filter |

```bash
pnpm protoyard new my-wiki --template docs-wiki
pnpm protoyard dev my-wiki
```

| Scenario | What you see |
| --- | --- |
| `empty` | No spaces yet (owner): every empty state; create the first space |
| `active` *(default)* | Three spaces, about 45 nested pages with months of history, and a "Markdown safety check" page of hostile content (editor) |
| `large` | About 1,500 pages: search and the tree (virtualized above 500 rows) at scale |
| `viewer` | The `active` wiki seen by a reader: no edit controls, the tree is read-only |

| Persona | Role | Can do |
| --- | --- | --- |
| `user_0001` Mara Quinn | owner | everything, including new spaces |
| `user_0002` Theo Grant, `user_0003` Ines Duarte | editor | create, edit, move, restore and delete pages |
| `user_0004` Ravi Patel | viewer | read, browse history and search |

Open DevTools with **Ctrl/⌘ + .** to switch persona or go offline.

## How it stays safe and consistent

- **Safe rendering:** bodies render through `PageBody.svelte`, the views-ui
  `MarkdownPreview` over the shared parser in `@protoyard/ai/markdown`. It
  builds elements and text, never HTML. `<script>`, `onerror=` and
  `javascript:` links show as literal text (see the "Markdown safety check"
  page and `tests/safe-render.test.ts`). Search highlights are text segments.
- **Versions:** `pages.create`, `pages.save` and `pages.restore` write the page
  and its new `versions` row in one transaction, so offline or failed saves
  leave neither. Restoring adds a new version (`Restored v3`); history is never
  rewritten. An unchanged save writes nothing.
- **Conflicts:** the editor sends the version it started from. If someone
  saved since, the save is refused with a message and the typed text stays.
- **Tree:** ranks come from `rankBetween`. Moves stay inside the space and
  never into the page itself or its descendants. Only leaf pages can be deleted.
- **Search** is an in-memory scan (`searchPages`), fine for thousands of
  pages. A real product would use a server index.

## Layout

```text
protoyard.json               manifest (id, slug, scenarios, storage namespace + schemaVersion)
src/prototype.ts             definePrototype(): schema + policy + scenarios + generator + integrity
src/database/schema.ts       spaces, pages (tree: parentId + rank), versions ([pageId+version] unique)
src/domain/wiki.ts           pure rules: pageTree, wouldCycle, plainText, searchPages, highlight, lineChanges
src/domain/validation.ts     zod: page create/save (baseVersion)/move, space create
src/domain/services.ts       spaces.create, pages.create / save / restore / move / remove
src/scenarios/index.ts       four scenarios from @protoyard/scenarios presets
src/scenarios/generators.ts  curated trees per space, extra pages for `large`, versions, HOSTILE_BODY
src/screens/*.svelte         Home, Search, SpaceHome, PageView, PageEdit, PageHistory (lazy routes)
src/components/*.svelte      PageBody (safe preview), PageTree, NewPageDialog, SearchForm, Highlighted, PageHeader
tests/generators.test.ts     per-scenario determinism and integrity, trees, history invariant, scale, search and tree rules
tests/safe-render.test.ts    hostile Markdown renders as inert text; structure renders as elements
tests/services.test.ts       versions, conflicts, restore, moves, deletes, validation, permissions, offline, determinism
```

## Docs

- Agent spec: [AGENTS.md](AGENTS.md) and [docs/](docs/) (`pnpm protoyard spec docs-wiki --write`).
- Editor and tree: [views-ui README](../../packages/views-ui/README.md); the safe parser: [AI kits](../../docs/AI_KITS.md).
