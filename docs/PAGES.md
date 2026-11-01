# Pages and documents

Protoyard's page and document packages model two content kinds over the shared
block vocabulary. A **page** is one scrolling marketing or landing page with
sections and anchor navigation. A **doc** is one continuous report, guide or
one-pager with headings, an optional table of contents and print styling. They
are data documents, not full website routers or backend services.

For the shared content contract, see [Blocks](BLOCKS.md). For the related deck
kind, see [Decks](DECKS.md); for the `MarketingLayout` and `DocsLayout` chrome,
see [Layouts](LAYOUTS.md). The [Player guide](PLAYER.md) covers the no-install
blueprint runner, and [Generator](GENERATOR.md) covers generated prototypes.

## Current support

The engine schemas, limit checks, TOC helpers, local form-response services,
Svelte hosts, form UI, print stylesheet, doc editing on `@texuli/pages` and
Word/PDF/Markdown downloads with `@texuli/document` are implemented in
`@protoyard/pages` and `@protoyard/pages-ui`. The CLI can validate page and doc
blueprint bodies. The shared `PageApp` and `DocApp` are designed to be mounted
by both the player and generated prototypes.

Both levels are wired:

- **Level 1.** The player opens page and doc blueprints through its kind boot. It also has dedicated `page.html` and `doc.html` entries.
- **Level 2.** `protoyard generate <slug> --blueprint <file>` picks the `templates/page` or `templates/doc` template from the blueprint's kind.

The test that checked both levels render the same content (`kinds-parity.test.ts`) was removed in PLAN_009. The examples under `blueprints/pages/` and `blueprints/docs/` are the reference data, and each one generates into a prototype.

## Page or doc?

| Kind | Body | Navigation | Good fit |
| --- | --- | --- | --- |
| `page` | Ordered `sections[]`, each with blocks and an optional title/role/anchor | One document scroll; section anchors and optional top nav | Landing pages, pricing, waitlists and product stories |
| `doc` | Ordered `blocks[]` in one continuous flow | Heading-based TOC and hash links | Reports, guides, one-pagers and data stories |

Both bodies have a stable `id`, `title`, optional `description` and optional
theme `style` id. `kind` belongs to the top-level blueprint envelope; a page
body goes in `page`, a document body in `doc`. The blueprint format remains
version 1:

```json
{
  "formatVersion": 1,
  "kind": "page",
  "name": "Example landing",
  "page": {
    "id": "example-landing",
    "title": "Example landing",
    "sections": [
      {
        "id": "hero",
        "anchor": "top",
        "role": "hero",
        "blocks": [
          { "type": "heading", "level": 1, "text": "A clear headline" },
          { "type": "text", "markdown": "A short explanation." }
        ]
      },
      {
        "id": "details",
        "title": "Details",
        "blocks": [{ "type": "stat", "items": [{ "value": "24 h", "label": "Example response time" }] }]
      }
    ]
  }
}
```

The schema rejects unknown keys, duplicate section ids/anchors, unresolved form
references and invalid in-page links. The blueprint kind validator also checks
block ids and links across the full page or document. Prefer stable, unique
block ids for heading deep links.

## Compose with blocks

Page sections and doc flows use the same `BlockSchema` from
[`@protoyard/blocks`](../packages/blocks/README.md). The renderers validate
blocks at their host boundary and load the matching `@protoyard/blocks-ui`
family on demand. Unknown or unavailable block types show a safe message;
page and doc content is never inserted with raw HTML.

Page sections may have roles `hero`, `body`, `footer`, `cta`, `features`,
`pricing` or `faq`. `PageHost` decides each section's layout in
`packages/pages-ui/src/page/design.ts`:

- `hero`, or a first role-less section that opens with a level-1 heading,
  becomes the hero at the display scale.
- `cta`, or a closing role-less section made of a CTA and short copy, becomes
  a primary-colored band.
- `footer` goes to the page footer.
- A `pricing` role, or a pricing-like id or anchor (`plans`, `pricing`,
  `tiers`), renders its cards as plan columns with one plan emphasized.
- Plain stat rows (Texuli `Stat` cards), numbered steps and quotes (a Texuli
  `Avatar` for the attribution) get page-specific rows. `features`,
  `faq` and every other block render in the normal body flow on alternating
  backgrounds.

A missing nav links every body section by its title or opening heading, never
the hero, band or footer, and falls back to humanized ids only when no section
has a label. The v1 page is a single scroll with hash
anchors. Multi-route marketing sites belong in a generated level-2 app or a
later pages version.

`DocHost` uses `buildDocToc` from `@protoyard/pages`. It derives stable ids from
heading blocks, keeps authored block ids when unique, and disambiguates repeated
slugs. Levels 2–4 may appear in the on-page TOC. The document uses one title
header: if its first block is an `h1`, that block supplies the eyebrow and
subtitle and is not rendered again. One TOC disclosure collapses on phones and
becomes a sticky outline rail on wide screens; its active link follows the
visible section. The article uses a 72-character measure and the TOC is hidden
when printing. A requested TOC must have at least one heading within its
configured depth.

### Reading view and Texuli's reader

The doc reading view is `DocHost`, not `@texuli/pages/reader-core`'s
`PageReaderCore`. A spike on Texuli 0.11.1 (2026-10-31) painted Protoyard's
blocks through the reader's `renderBlock` seam with forms still interactive.
It was re-run on Texuli 0.11.3 (2026-11-01), which added host heading anchors
(`anchorFor`, G132) and `@texuli/document/schema-core` (G133):

| Check | `DocHost` | `PageReaderCore` |
| --- | --- | --- |
| Doc initial JS gzip (`budget.test.ts`, cap 122,880 B) | 120,623 B | Over the cap: the doc entry plus the conversion alone is 147,659 B, before the reader (162,013 B for the whole reader on 0.11.1) |
| Heading anchors | Authored block id, else a slug | Authored block id with `anchorFor={(block) => block.id}` (checked: the outline links match) |
| Heading eyebrow and subtitle, quote citation, callout icon | Shown | Dropped by the edit-mode conversion |
| Headings inside a text block's Markdown | Not TOC entries | Outline entries |

Deep links now hold, so size is the remaining blocker. The reader itself
adds about 1 KB. The rest is the doc → Texuli conversion a reader needs on
the first screen:

- the Markdown codec (`@texuli/core/editor`, about 15 KB), because a doc's
  text blocks are Markdown;
- the schema toolkit `schema-core` validates with (`@texuli/deck/schema`,
  about 9 KB);
- the document model, schema and Markdown import.

`schema-core` saves about 3.8 KB of the conversion and keeps the deck model
out. A switch still needs the conversion off the first screen, or Markdown
text blocks read without the codec, plus a reading conversion mode that keeps
every field. The editor and the downloads already use the conversion, on
their own lazy chunks. `@protoyard/pages` validates with `schema-core`,
which refuses an inline deck (Protoyard never writes one); that shrinks the
downloads' shared chunk from 19,283 B to 3,907 B gzip.

Vertical timeline blocks use a dedicated marker column beside the event labels
so dates and titles remain readable at narrow widths. The shared renderer
applies this layout in decks, pages and docs.

## Public forms are local simulations

The shared [`form` block](BLOCKS.md#form--form) defines fields. Pages and docs host
that block through `FormBlock` and the `@protoyard/pages` services. A successful
submission is validated against the registered form, then stored in this
browser's IndexedDB `formResponses` feature table through the runtime service
and a database transaction. The table is part of the kind runtime's feature
stores, so its rows participate in that runtime's snapshot data.

`FormBlock` paints the form with Texuli's `SchemaForm` (`@texuli/forms`):
Texuli runs the required and range checks and shows its error summary before
anything is saved, then the submission goes through the same services. A
service's field issues show inline on their fields, and a successful
submission shows Texuli's confirmation. Fields with unsafe or reserved names
(`__proto__`, `constructor`, `prototype` and Texuli's reserved form names) are
left out. An untitled block hides the heading and keeps its submit label as
the form's accessible name.

The service methods have simulated capability requirements:

| Operation | Capability |
| --- | --- |
| Submit a response | `form:submit` |
| List or export responses | `form:read` |
| Clear responses | `form:admin` |

These persona capabilities only control the prototype UI. They are not security
controls, authentication, authorization or privacy protection. There is no
server, external request, email delivery or real submission destination.
Email fields validate their text; they do not send email.

Response values are bounded to 8 KiB and at most 32 fields, with bounded text,
finite numbers, booleans or bounded string arrays. Unsafe field keys are
rejected. Each form retains at most 500 rows; deletion is explicit. CSV export
quotes RFC 4180 values and prefixes formula-like text so spreadsheet programs
interpret it as text. These caps protect local storage and rendering; they are
not a retention policy.

`ResponsesPanel` provides a live list, CSV download and a guarded clear dialog.
It can be rendered alongside a form by an integrating app; it is not
automatically added to every page or doc. The list is local to the current
browser database and namespace.

## Edit and download a doc

`DocApp` shows a tool bar above the reading view (turn it off with
`tools={false}`). It builds on Texuli's document packages from npm:

- **Download** writes the doc as Word (`.docx`), PDF or Markdown with the
  owned writers of `@texuli/document` (through `exportDocument` from
  `@texuli/pages/export`). Nothing leaves the browser: the file is a `blob:`
  download. The export module and each writer load on the first click.
- **Edit** opens the `@texuli/pages` editor (its own lazy chunk) for personas
  with `DOC_CAPABILITIES.edit` (the kind runtime's `blocks:interact`:
  presenters and audience members; viewers only read and download). It has
  the slash menu (`/` in an empty line), block reordering by drag or
  `Alt`+arrow keys, and undo and redo on the `@texuli/document` op log.
- **Apply changes** converts the edited document back to the doc body, and the
  reading view shows it with forms and interactive blocks still working. With
  a runtime (the player, generated doc prototypes and the doc template), the
  edits are saved in the browser's IndexedDB for this doc and world, so they
  survive a reload. **Reset to the original** deletes them.

### Saved edits

`createDocEditServices(runtime)` from `@protoyard/pages` owns the saved edits.
The content-kind runtime declares their `docEdits` store from database
version 2 (`KIND_DATABASE_VERSIONS`); a browser that holds version 1 data
upgrades in place and keeps its block states and form responses.

- **What is stored:** one row per doc and world, keyed by the storage
  namespace and the doc id, holding the edited doc's `blocks`, a fingerprint
  of the doc they were made on, the time and the simulated persona. The doc's
  title, TOC and print settings always come from the blueprint.
- **Writes** follow the service contract: `save` and `reset` assert
  `DOC_CAPABILITIES.edit` (viewers can read saved edits but not save or reset
  them), validate, then run through `environment.run` and a Dexie
  transaction. Apply and Reset stay pending until the write settles; a
  refused save is named in the editor, which stays open.
- **Loading re-validates** every row as untrusted: the row shape, then the doc
  it makes through `DocDocumentSchema` and the doc limits. A row that fails is
  never painted; the doc shows its original text with a notice and a Reset.
- **A changed doc** (the blueprint was edited, so the fingerprint differs)
  does not show older edits. A notice says they are for an earlier version,
  and Reset clears them.
- **A world reset or scenario load** clears saved edits with the rest of the
  world. They are not part of the blueprint or its share link: to keep or
  share an edited doc, download it.
- `DocApp` without a runtime (a bare reading view) keeps edits in the tab only,
  and says so.

The doc body in the blueprint stays the stored and shared format, so every
blueprint and share link keeps validating. `docToTexuliDocument` and
`texuliDocumentToDoc` from `@protoyard/pages` convert between it and a
Texuli document, validated by `validateDocument` at the untrusted tier:

| Doc block | In the editor | In a downloaded file |
| --- | --- | --- |
| heading, text, list, quote, callout, divider, code | Native Texuli blocks you can edit | The same text, headings and lists |
| table; chart with labels and series | A labelled Protoyard block placeholder (move or remove it) | A table (DOCX, PDF) or a caption and one bullet per row (Markdown) |
| stat, timeline, steps | Placeholder | A list |
| form, embedded app, map and other interactive blocks | Placeholder | The block's title, with a note under the buttons |

Blocks the editor leaves untouched come back exactly as they were (eyebrows,
icons, tones, citations). Editor blocks with no doc equivalent (a nested page,
an image without a size, a catalog component) are left out, and a notice names
them.

Honest limits:

- **Saved edits stay in this browser and world.** They are not written back
  to the blueprint, a share link or another browser. Download to keep or send
  a copy.
- A placeholder's content (a chart's data, a form's fields) is edited in the
  blueprint, not in the editor.
- Heading eyebrows and subtitles, quote citations and list icons are kept but
  not editable in the editor.
- PDF uses the standard 14 fonts: characters outside them are replaced, and
  the download status says so.

## Print

Import `@protoyard/pages-ui/styles.css` to include the page/doc print rules, or
import the dedicated `@protoyard/pages-ui/print` entry when using `PrintButton`.
The CSS is scoped to `@media print`: it hides navigation, TOCs, controls and
overlays; removes screen-only overflow clipping; keeps the content on white
paper; and avoids splitting common block elements across pages. `PrintButton`
calls the browser's `window.print()` dialog. It does not upload or create a PDF
file on a server.

The schemas currently accept `doc.print.pageBreaks` and
`doc.print.hideChrome`, but the stylesheet does not yet vary its behavior from
those values. Print remains continuous page flow; deck printing, which places
one slide on each page, is a separate feature in `@protoyard/decks-ui`.

## Limits and budgets

Document shape and raw-body checks are exported from `@protoyard/pages`:

| Limit | Page | Doc |
| --- | ---: | ---: |
| Serialized body size | 512 KiB | 512 KiB |
| JSON nesting depth | 24 | 24 |
| Sections | 32 | — |
| Blocks per section | 24 | — |
| Body blocks | — | 200 |
| Nav items / form references | 24 / 16 | — |
| TOC depth | — | 2–4 |
| Form-response values | 8 KiB, up to 32 values | same |
| Retained responses per form | 500 | 500 |

`PAGE_DOCUMENT_LIMITS` also bounds titles to 120 characters and descriptions
to 500. Individual block and form-field schemas have their own limits. Use
`checkPageDocumentLimits`, `checkDocDocumentLimits` and
`checkFormResponseLimits` before accepting untrusted JSON at an application
boundary; then parse with the corresponding document or blueprint schema.

The player's `page.html` and `doc.html` entries have ceilings of 150 KB
initial JS gzip and 30 KB CSS gzip each (`protoyard.budgets.json` `kinds`),
enforced by `packages/player/tests/budget.test.ts`, which also holds a tighter
125 KB regression cap. Both measure about 122 KB of initial JS
(2026-10-22). See [Performance](PERFORMANCE.md#versioned-budgets) for the
budget contract and the current measurements.

## Design checks in a real browser

An opt-in Playwright design gate (`page-design.spec.ts`, rules in
[`scripts/lib/page-design.ts`](../scripts/lib/page-design.ts)) used to open the
example landing page and report at both levels and check theme fonts, display
scale, one table of contents, overflow, timeline markers, the form and a clean
console. PLAN_009 removed that spec and the unit tests of its rules to keep the
suite essential; the rules file stays, but nothing runs it today. What runs
instead, in CI:

- `tests/e2e/content-kinds-a11y.spec.ts` renders the example page and doc in
  the built player, in light and dark on desktop and Pixel 7, under axe, and
  checks that a page form response is still there after a reload;
- `tests/e2e/doc-edits.spec.ts` applies a doc edit, reloads and resets it
  (needs the `doc` target in `PROTOYARD_E2E_PROTOTYPES`).


The last gate run, on 2026-10-22, measured at both levels a 60 px page hero
and a 64 px doc title on desktop (1280 px), both titles at 36 px on a phone
(412 px), a 16 px Inter body and no horizontal scroll. Those numbers are
history now, not a check.

## Packages and development

- [`@protoyard/pages`](../packages/pages/README.md) is the framework-neutral
  engine: schemas, limits, TOC helpers, response validation and services.
- [`@protoyard/pages-ui`](../packages/pages-ui/README.md) contains Svelte hosts
  and UI. Its explicit imports include `/page`, `/doc`, `/block-host`, `/form`,
  `/print` and `/styles.css`. Use family subpaths when you want to keep unused
  UI out of an entry graph.

```ts
import { PageDocumentSchema, buildPageToc } from '@protoyard/pages';
import { PageApp } from '@protoyard/pages-ui/page';
import { FormBlock, ResponsesPanel } from '@protoyard/pages-ui/form';
import '@protoyard/pages-ui/styles.css';
```

Local checks:

```sh
pnpm --filter @protoyard/pages typecheck
pnpm --filter @protoyard/pages-ui typecheck
pnpm vitest run packages/pages packages/pages-ui
pnpm vitest run packages/blueprint/tests/kinds/runtime.test.ts
```

Related guides: [Blocks](BLOCKS.md), [Decks](DECKS.md), [Layouts](LAYOUTS.md),
[Player](PLAYER.md), [Generator](GENERATOR.md), [Security](SECURITY.md) and
[Performance](PERFORMANCE.md).
