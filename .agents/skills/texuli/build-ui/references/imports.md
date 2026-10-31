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
| Decks (stage and v1) | `@texuli/slides/stage` (`DeckStage`, `prepareDeck`), `@texuli/slides/stage-core` (`DeckStageCore`, new in `0.6.0`), `@texuli/slides/export` (`DeckPrintView`, print plan, PDF seam, PPTX), `@texuli/slides/model`, `@texuli/slides/grammar`, `@texuli/slides/templates` (report, pitch, review; v1) |
| Rich text editor | `@texuli/editor/editor` (`RichTextEditor`), `@texuli/editor/toolbar`, `@texuli/editor/controller`, `@texuli/editor/markdown` (`markdownToDocument`, `documentToMarkdown`); in development, on npm from `0.5.0` (host inline extensions new in `0.6.0`) |
| Astro sites | `@texuli/astro` (`texuli()` integration), `@texuli/astro/styles.css`, `@texuli/astro/site` (`defineSite`, `sitePageMeta`, `siteSitemap`), `@texuli/astro/layouts/ContentLayout`, `@texuli/astro/appearance` (`AppearanceSwitcher`; new in `0.5.0`) |
| Paint a validated blueprint | `@texuli/player` (+ `@texuli/player/styles.css`) |
| Drag and drop (Svelte) | `@texuli/primitives/sortable` (`Sortable`); views: `@texuli/data/board`, `@texuli/data/tree-view` |
| Drag engine (framework-free) | `@texuli/drag/sortable`, `@texuli/drag/gesture`, `@texuli/drag/spatial`, `@texuli/drag/graph`, `@texuli/drag/messages`; in development, on npm as `0.8.0` |
| Workflows | `@texuli/workflows/editor`, `@texuli/workflows/viewer`, `@texuli/workflows/inspector`, `@texuli/workflows/model`, `@texuli/workflows/layout`, `@texuli/workflows/spec-adapter`; in development, on npm as `0.8.0` |
| Block documents | `@texuli/pages/editor` (`PageEditor`), `@texuli/pages/reader` (`PageReader`), `@texuli/pages/paged` (`PagedView`), `@texuli/pages/export` (`exportDocument`, `downloadBlob`), `@texuli/pages/collab` (`CollabEditor`, `createCollabSession`; lazy), `@texuli/pages/host` (`createDocumentPlayerHost`, `checkDocumentDraft`); the engine `@texuli/document/*` (`model`, `schema`, `ops`, `markdown`, `paged`, `docx`, `pdf`, `sync`, `collab`); in development, new in `0.7.0` |
| Dates | `@texuli/date` (`CalendarDate`, Gregorian only) |
| Class helpers from those packages | `texuli/cx` only |

## New in 0.9.0

These APIs ship in `0.9.0`, the first release of `@texuli/mcp`; the 0.8
line does not have them. Use them with `^0.9.0`.

| Need | Use |
| --- | --- |
| Restyle components from a design system | Component tokens (`--tx-<component>-<key>`, listed in `@texuli/tokens/components`) and system tokens (`@texuli/tokens/system`) set on a `[data-tx-scope]` element; import `@texuli/tokens/base.css` |
| Default variants and sizes | `setDesignDefaults` and `getDesignDefaults` (`texuli/defaults`); an explicit prop always wins |
| Overlays that keep a themed subtree's tokens | Nothing to do: `Dialog.Portal`, `AlertDialog.Portal` and `Portal` follow the nearest `[data-tx-scope]` (`createScopedPortal` in `@texuli/core/portal`) |
| A time x-axis on a chart | `xKind="time"`, `formatX` and `locale` on the cartesian charts (`@texuli/charts/cartesian`) |
| Keyboard rows in a table grid | `DataGrid` `mode="table"` with `rowFocusable` (Enter and Space), `searchPredicate`, a numbered pager |
| Field label context in your own control | `useFieldLabel` and `getFieldLabelContext` (`texuli/field`) |
| Compose event handlers | `composeHandlers` and `chainHandlers` (`texuli`, `@texuli/primitives`) |
| Every operation from code or a shell | `@texuli/tools/ops` (`invoke`), `texuli <group> <verb>`, and the MCP servers ([`../../router/hosts.md`](../../router/hosts.md#mcp)) |

Behavior changes to expect in `0.9.0` are in
[`../../upgrade/SKILL.md`](../../upgrade/SKILL.md) and `docs/RELEASE.md` in
the Texuli repository ("0.9.0").

## New in 0.8.0

These APIs ship in `0.8.0`, the first release of `@texuli/forms`,
`@texuli/canvas` and `@texuli/sheets`; `0.7.0` does not have them. Use them
with `^0.8.0` or later. The three packages are in development (pre-1.0).

| Need | Use |
| --- | --- |
| A form from a closed schema | `SchemaForm` and `validateFormSchema` (`@texuli/forms`), the model and `checkFormDraft` in `@texuli/forms/model`; formats and validators are names, conditions are `@texuli/core/expression` trees, never a pattern or code |
| An infinite canvas | `CanvasEditor` (`@texuli/canvas/editor`), `CanvasViewer` (`/viewer`), `loadUntrustedCanvas` (`/model`), `canvasToSvg` and `canvasToPng` (`/export`), collaboration in `/sync` |
| A spreadsheet | `SheetView` (`@texuli/sheets/view`), `loadUntrustedSheet` (`/model`), the formula engine in `/formula`, `csvToSheet` and `sheetToCsv` (`/csv`) |
| A dashboard of widgets | `Dashboard` and `DashboardWidget` (`@texuli/data/dashboard`), `parseDashboard` for a saved layout (`@texuli/data/dashboard/engine`) |
| Host data for generated views | `defineSource`, `createSourceRegistry` and `createSourceLoader` (`@texuli/core/data-source`), passed to `<Player sourceRegistry>`; a blueprint names a source with `$source`, never a URL |
| One bounded expression language | `parseExpression` and `evaluateExpression` (`@texuli/core/expression`) |
| Component labels from one catalog | `createI18n` (`@texuli/core/i18n`) and `setI18nContext` (`texuli`); label props still win, English is the only shipped language |
| Forms, canvases and sheets from an agent | `schema-form`, `canvas` and `spreadsheet` nodes (spec 0.8.0) validated with `checkForm: checkFormDraft`, `checkCanvas: checkCanvasDraft` and `checkSheet: checkSheetDraft`, and painted through `<Player formHost={createFormPlayerHost()} canvasHost={createCanvasPlayerHost()} sheetHost={createSheetPlayerHost()}>` (`@texuli/forms/host`, `@texuli/canvas/host`, `@texuli/sheets/host`); without the host check they are refused |
| Email and PDF from a blueprint | `renderEmail` (`@texuli/tools/email`), `renderBlueprintPdf` (`@texuli/tools/print`) and the player's `print` mode |

Behavior changes to expect in `0.8.0` are in
[`../../upgrade/SKILL.md`](../../upgrade/SKILL.md) and `docs/RELEASE.md` in
the Texuli repository ("0.8.0").

## New in 0.7.0

These APIs ship in `0.7.0`, the first release of `@texuli/document` and
`@texuli/pages`; `0.6.0` does not have them. Use them with `^0.7.0` or later.

| Need | Use |
| --- | --- |
| A block document engine (no Svelte, no DOM) | `@texuli/document/model` (the format, `createDocument`), `/schema` (`loadUntrustedDocument`, `documentJsonSchema`), `/ops` (`applyOperations`, `applyDocumentPatch`, `createDocumentHistory`), `/markdown` (`documentFromMarkdown`, `documentToMarkdown`), `/paged` (`paginate`), `/docx` (`writeDocx`), `/pdf` (`writePdf`), `/sync` (`createMemorySyncHub`, `createBroadcastChannelAdapter`), `/collab` (`createDocumentSync`) |
| Edit, read, page and export documents | `PageEditor` (`@texuli/pages/editor`), `PageReader` (`/reader`), `PagedView` (`/paged`), `exportDocument` and `downloadBlob` (`/export`); keep the document in `$state.raw` and validate untrusted input with `loadUntrustedDocument` first |
| Collaboration | `createCollabSession` and `CollabEditor` from `@texuli/pages/collab` (import lazily): comments, suggestions, versions, presence; landmark names carry each person (`CollabLabels.landmark`), so two editors share a page |
| Documents from an agent | A `document` node (spec 0.7.0) validated with `checkDocument: checkDocumentDraft` and painted through `<Player documentHost={createDocumentPlayerHost()}>` (`@texuli/pages/host`); edit it with the `patchDocument` op (`applyEditOps(tree, ops, { patchDocument })` from `@texuli/catalog/edit`), addressed by node `key` |
| Document commands | `runDocumentCommand` (`@texuli/tools/document`), the `document` command of the `texuli` bin and the read-only `document.run` and `document.export` MCP tools |

Behavior changes to expect in `0.7.0` are in
[`../../upgrade/SKILL.md`](../../upgrade/SKILL.md) and `docs/RELEASE.md` in
the Texuli repository ("0.7.0").

## New in 0.6.0

These APIs ship in `0.6.0`; `0.5.0` does not have them. Use them with
`^0.6.0`, and keep code pinned to `^0.5.0` on the old API.

| Need | Use |
| --- | --- |
| Motion on components | `motion` prop (`{ enter, exit, layout, duration }` by name, or `false`) on dialogs, sheets, popovers, menus, tooltips, toasts, tabs, accordions, `Board` and `DataGrid`; `MotionProvider` (`level`: `full`, `subtle`, `none`; `reducedMotion`) from `texuli/motion` |
| Motion in your own code | `animate`, `createMotionPresence`, `createFlip`, `createSharedElements`, `timeline`, `stagger` from `@texuli/core/motion`; springs from `@texuli/core/motion/spring`; tokens from `@texuli/tokens/motion` (`MOTION_DURATIONS`, `MOTION_EASINGS`, `MOTION_SPRINGS`). Instant on the server and under reduced motion |
| One component contract | `bind:ref` and rest attributes (`id`, `aria-*`, `data-*`, `class`, `style`, handlers) on every exported primitive part and styled component; caller handlers run first (`preventDefault()` skips the part's action); a `Field`'s `{...control.props}` reach the focusable control (`docs/STANDARDS.md`, "Component API contract") |
| Paint while an agent writes | `<Player stream={source}>` (`@texuli/player`) with `createBlueprintStream` from `@texuli/spec/stream`; check a streamed node yourself with `validateStreamNode` (`@texuli/catalog/validate`). `validateDraft` stays the only verdict |
| Motion in a blueprint | Node `motion` and envelope `motion.level` (spec 0.6.0): closed preset names, never CSS or milliseconds; checks in `@texuli/spec/motion` |
| A stage without the default renderers | `DeckStageCore` from `@texuli/slides/stage-core`; prepared decks (`prepareDeckV2`, `isPreparedDeck`, developer tier only), `loadDeckMigration`, a `tools` toolbar snippet on `@texuli/slides/stage`; `preloadDeckPrintView` on `@texuli/slides/export` |
| Escaped XML or HTML, ZIP files | `el`, `serializeHtml`, `serializeXml`, `linkUrl`, `imageUrl` from `@texuli/core/markup`; `writeZip`, `writeZipAsync` from `@texuli/core/zip` |
| Mentions in Markdown | `createInlineExtensions` (`@texuli/core/editor-model`) passed as `extensions` to `markdownToDocument` and `documentToMarkdown` (`<sigil>{id\|label}`) |
| Filter catalogs and saved segments | `operators`, `groups`, `parseSegment`, `serializeSegment` in `@texuli/data/filter-builder` |
| Dialogs in a framed preview | `mode="contained"` + `container`, `onDismissRequest`, `onCloseAutoFocus` on `Dialog`, `AlertDialog`, `CommandPalette`; `Toaster` `mode="contained"` |
| Chat reading position | `bind:anchor` + `onAnchorChange`, `avatarSrcset`, `onEditUnchanged` on `MessageList` / `ChatThread` |
| Grid and board options | `DataGrid` `activateOnClick`, `mode="table"`, column `hideBelow`; `Board` column `description`, `columnHeader` snippet, column-only mode without `getRank` |
| Other additions | Tab `badgeLabel`; toast `action.retryOnError`; `TagsInput` `readonly` and list `delimiter`; `CardGrid` `gap`; date `hideLabel`, `defaultFocusedValue`, `DateRangePicker` `required`; `ContentLayout` `onActiveHeadingChange`; `MarketingSectionHeader` (`texuli/layouts/marketing/section`); `AppearanceSwitcher` `size="sm"`; inbox `allowMarkUnread`; cohort `heatScale` |

Behavior changes to expect in `0.6.0` are in
[`../../upgrade/SKILL.md`](../../upgrade/SKILL.md) and `docs/RELEASE.md` in
the Texuli repository ("0.6.0").

## New in 0.5.0

These APIs ship in `0.5.0`; `0.4.0` does not have them. Use them with
`^0.5.0`, and keep code pinned to `^0.4.0` on the old API.

| Need | Use |
| --- | --- |
| Stop a streaming reply | `Composer` (and `ChatThread`) `streaming` + `onStop`: the send button becomes Stop, Escape stops; `onkeydown` runs before the built-in keys (`preventDefault()` takes a key over); an `actions` snippet gets `{ canSend, busy, streaming, submit, stop }` |
| Message actions and edit | `MessageList` / `ChatThread` `actions` snippet (`edit()`, `canEdit`) and `onEdit(message, body)`; return `false` to keep the editor open |
| Page a client-side table | `DataGrid` (`@texuli/data/grid-core`) `pageSize` + `bind:page`, `rowClass(row)`, `filters`, `toolbar` and `bulkActions` (`{ selected, rows, clear }`) snippets |
| Undo after a toast | `toast.info(msg, { action, onSettle(reason) })` from `texuli/toast`: `reason` is `timeout`, `action` or `dismiss`, called once; `pause()`, `resume()`, `announcement(id?)` on the store |
| A time of day | `TimeField` from `texuli/date` (`bind:value` as `"HH:mm"`, `hourCycle`, `minuteStep`) |
| Deterministic dates | `today="YYYY-MM-DD"` on `Calendar`, `DatePicker` and `DateRangePicker` (no clock reads), plus `weekStartsOn`, `maxDays` and `onInvalid` |
| A trend in a KPI tile | `Sparkline` from `@texuli/charts/sparkline-lite`: the compact props, no data table, lighter first screen; use `@texuli/charts/compact` when readers need the values table |
| Markdown in an editor | `markdownToDocument(source)` (untrusted tier by default, HTML stays text) and `documentToMarkdown(doc)` from `@texuli/editor/markdown` |
| Nested filters, inbox, cohorts | `FilterBuilder` (`bind:value` or `onValueChange`) + `applyFilter` (`@texuli/data/filter-builder`), `NotificationInbox` (`@texuli/data/activity/inbox`), `CohortTable` (`@texuli/data/cohort`) |
| A content page with its own TOC | `ContentLayout` from `texuli/layouts/content` (children, `toc` entries, `tocLevels`) |

Behavior changes to expect in `0.5.0`: `Input` with `type="number"` or
`range` binds a number or `null`; `type="file"` binds `files` as `null`
until a pick; a caller `oninput` (or `onclick`, `onkeydown` on primitives)
runs before the built-in handler instead of replacing it. Full list:
[`../../upgrade/SKILL.md`](../../upgrade/SKILL.md) and `docs/RELEASE.md` in
the Texuli repository ("0.5.0").

## CSS layers

```css
@layer tx.base, tx.components;
```

Consumer utilities win over component defaults when ordered correctly.
