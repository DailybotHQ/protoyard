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
Svelte hosts, form UI and print stylesheet are implemented in
`@protoyard/pages` and `@protoyard/pages-ui`. The CLI can validate page and doc
blueprint bodies. The shared `PageApp` and `DocApp` are designed to be mounted
by both the player and generated prototypes.

In this repository revision, dedicated page/doc player HTML entries and the
`templates/page` and `templates/doc` generation templates are not wired yet.
`protoyard generate` accepts app blueprints only. Therefore level-1 playback
and level-2 generated page/doc parity are not available yet; the common hosts
and `definePrototypeFromPage` / `definePrototypeFromDoc` runtime helpers are
building blocks for that integration, not evidence that those flows are done.
The examples under `blueprints/pages/` and `blueprints/docs/` show the current
data shape. They are not app blueprints and cannot yet be generated.

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
`pricing` or `faq`. The current host gives special placement to `hero` and
`footer`; other roles render in the normal section flow. A missing nav is
derived from section titles and ids. The v1 page is a single scroll with hash
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

Vertical timeline blocks use a dedicated marker column beside the event labels
so dates and titles remain readable at narrow widths. The shared renderer
applies this layout in decks, pages and docs.

## Public forms are local simulations

The shared [`form` block](BLOCKS.md#form) defines fields. Pages and docs host
that block through `FormBlock` and the `@protoyard/pages` services. A successful
submission is validated against the registered form, then stored in this
browser's IndexedDB `formResponses` feature table through the runtime service
and a database transaction. The table is part of the kind runtime's feature
stores, so its rows participate in that runtime's snapshot data.

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

The configured provisional player entry ceilings are 150 KB initial JS gzip
and 30 KB CSS gzip for each of page and doc. There is no measured page/doc
player entry in this revision because those entries are not wired yet. See
[Performance](PERFORMANCE.md#versioned-budgets) for the active budget contract
and the evidence recorded when the entry build is added.

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
pnpm vitest run packages/blueprint/tests/kinds/page-doc-runtime.test.ts
```

Related guides: [Blocks](BLOCKS.md), [Decks](DECKS.md), [Layouts](LAYOUTS.md),
[Player](PLAYER.md), [Generator](GENERATOR.md), [Security](SECURITY.md) and
[Performance](PERFORMANCE.md).
