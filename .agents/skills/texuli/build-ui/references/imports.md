# Public import map (build-ui)

Prefer these entries. Never import package `src/internal` paths from apps.
Every package and its layer: [`../../router/packages.md`](../../router/packages.md)
(derived from the real `exports`).

## texuli (styled)

| Need | Import |
| --- | --- |
| Classes | `texuli/cx` — `cx`, `variants` |
| Button | `texuli/button` |
| Input / textarea | `texuli/input` |
| Card | `texuli/card` |
| Badge | `texuli/badge` |
| Select | `texuli/select` |
| Toggle | `texuli/toggle` |
| Dialog / sheet | `texuli/dialog`, `texuli/sheet` |
| Layout hosts | layout subpaths under `texuli` (see package exports) |

## @texuli/core (texels)

| Need | Import |
| --- | --- |
| Roving tab | `@texuli/core/roving` |
| URL policy | `@texuli/core/url-policy` |
| Focus scope | `@texuli/core/focus-scope` |
| Editor model and Markdown | `@texuli/core/editor-model`, `@texuli/core/editor-markdown` (not in the root barrel) |

Never `@texuli/core` root barrel for app code.

## @texuli/tokens

| Need | Import |
| --- | --- |
| Library themes | `@texuli/tokens/library` / `library-expand` |
| Modes | `@texuli/tokens/modes` |
| CSS compile | `@texuli/tokens` (`compileThemeCss`, `applyTheme`) |
| No-flash | `@texuli/tokens/no-flash` |
| AA gate | `@texuli/tokens/aa-gate` |

## @texuli/catalog

| Need | Import |
| --- | --- |
| Build | `@texuli/catalog/build`, `@texuli/catalog/build/node` |
| Manifest groups | `@texuli/catalog/manifests/display` (and forms, content, layouts, …) |
| Render | `@texuli/catalog/render/renderer` |
| Limits | `@texuli/catalog/render/limits` |
| Grammar | `@texuli/catalog/render/grammar` |
| Rich text nodes | `@texuli/catalog/render/richtext` |
| Artifact frame | `@texuli/catalog/render/frame` |
| Validate untrusted blueprints | `@texuli/catalog/validate` (`validateDraft`) |
| Envelope and lifecycle | `@texuli/catalog/envelope` |
| Edit ops and undo | `@texuli/catalog/edit` |
| Player core (framework-free) | `@texuli/catalog/player` |

## Layers above texuli

| Area | Import style |
| --- | --- |
| Data views | `@texuli/data/<view>` |
| Charts | `@texuli/charts/<family>` (`cartesian`, `compact`, `flow`, `geo`, `matrix`, `part-whole`, …) |
| Media | `@texuli/media/<area>` |
| Chat | `@texuli/chat` (`ChatThread`, `Composer`, `parseMessageText`) |
| Content blocks | `@texuli/blocks/<family>` (lazy) or `@texuli/blocks/<family>/renderers` |
| Decks (v2 engine) | `@texuli/deck/model` (`parseDeck`, `loadUntrustedDeck`, `DECK_LAYOUTS`), `@texuli/deck/markdown` (`parseDeckMarkdown`, `deckToMarkdown`), `@texuli/deck/authoring`, `@texuli/deck/templates`, `@texuli/deck/engine`, `@texuli/deck/math`; in development, on npm from `0.4.0`. See [`decks.md`](decks.md) |
| Decks (stage and v1) | `@texuli/slides/stage` (`DeckStage`, `prepareDeck`), `@texuli/slides/export` (`DeckPrintView`, print plan, PDF seam, PPTX), `@texuli/slides/model`, `@texuli/slides/grammar`, `@texuli/slides/templates` (report, pitch, review; v1) |
| Rich text editor | `@texuli/editor/editor` (`RichTextEditor`), `@texuli/editor/toolbar`, `@texuli/editor/controller`; in development, workspace only (not on npm) |
| Astro sites | `@texuli/astro` (`texuli()` integration), `@texuli/astro/styles.css`, `@texuli/astro/site` (`defineSite`, `sitePageMeta`, `siteSitemap`), `@texuli/astro/layouts/ContentLayout` |
| Paint a validated blueprint | `@texuli/player` (+ `@texuli/player/styles.css`) |
| Drag and drop (Svelte) | `@texuli/primitives/sortable` (`Sortable`); views: `@texuli/data/board`, `@texuli/data/tree-view` |
| Drag engine (framework-free) | `@texuli/drag/sortable`, `@texuli/drag/gesture`, `@texuli/drag/spatial`, `@texuli/drag/graph`, `@texuli/drag/messages`; in development, on npm as `0.4.0` |
| Workflows | `@texuli/workflows/editor`, `@texuli/workflows/viewer`, `@texuli/workflows/inspector`, `@texuli/workflows/model`, `@texuli/workflows/layout`, `@texuli/workflows/spec-adapter`; in development, on npm as `0.4.0` |
| Dates | `@texuli/date` (`CalendarDate`, Gregorian only) |
| Class helpers from those packages | `texuli/cx` only |

## CSS layers

```css
@layer tx.base, tx.components;
```

Consumer utilities win over component defaults when ordered correctly.
