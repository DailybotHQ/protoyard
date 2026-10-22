# @protoyard/pages

Framework-agnostic **page** and **doc** engine for Protoyard blueprints
(`kind: "page"` and `kind: "doc"`, [ADR-036](../../docs/DECISIONS.md) and
[ADR-039](../../docs/DECISIONS.md)). No Svelte. Svelte hosts live in
[`@protoyard/pages-ui`](../pages-ui/README.md).

KINDS owns the blueprint `kind` discriminator and envelope. This package
validates the **payload bodies** after that parse.

## Install

```json
{
  "dependencies": {
    "@protoyard/pages": "workspace:*"
  }
}
```

## Document schemas

| Export | Role |
| --- | --- |
| `PageDocumentSchema` | Landing/marketing: meta, `sections[]` of blocks, optional `nav` and `forms` |
| `DocDocumentSchema` | Continuous flow: meta, `blocks[]`, optional `toc` and `print` |
| `PAGE_DOCUMENT_LIMITS` | Document caps (sections ≤ 32, blocks/section ≤ 24, doc blocks ≤ 200, …) |
| `safeParsePageDocument` / `safeParseDocDocument` | Never-throw helpers |
| `definePrototypeFromPage` / `definePrototypeFromDoc` | Minimal, Faker-free runtime definitions with an empty default world |

```ts
import { PageDocumentSchema, DocDocumentSchema } from '@protoyard/pages';

const page = PageDocumentSchema.parse({
  id: 'landing',
  title: 'Example landing',
  sections: [{ id: 'hero', role: 'hero', blocks: [{ type: 'text', markdown: 'Hello' }] }],
});
```

Shared meta: `id`, `title`, optional `description` and `style` (theme preset id).
Section `blocks` and doc `blocks` use `@protoyard/blocks` `BlockSchema`. Form
*block* schema stays in blocks; `page.forms` only lists form block ids for the
responses UI.

Unknown keys fail. Over-limit arrays fail. Section ids, anchors, nav fragments
and form refs are cross-checked.


## Limits (untrusted and authoring)

| Export | Role |
| --- | --- |
| `PAGE_LIMITS` | Page caps: sections, blocks/section, form fields/options, response bytes/count, JSON bytes/depth |
| `DOC_LIMITS` | Doc caps: max blocks, toc depth, shared form-response ceilings |
| `checkPageDocumentLimits` / `checkDocDocumentLimits` | Never-throw size and count guards on raw JSON |
| `checkFormResponseLimits` | Guard one response `values` blob and list length |
| `UNTRUSTED_PAGE_DOC_HINT` | Snapshot for KINDS to wire into `blueprint` untrusted loader |

Default numbers (also enforced structurally by the document schemas where noted):

| Cap | Page | Doc |
| --- | --- | --- |
| JSON bytes | 512 KiB | 512 KiB |
| JSON depth | 24 | 24 |
| Sections | 32 | — |
| Blocks / section | 24 | — |
| Doc body blocks | — | 200 |
| Form fields (untrusted ceiling) | 32 | 32 |
| Field options | 32 | 32 |
| Response values bytes | 8 KiB | 8 KiB |
| Responses per form | 500 | 500 |

```ts
import { PAGE_LIMITS, checkPageDocumentLimits } from '@protoyard/pages';

const gate = checkPageDocumentLimits(rawJson);
if (!gate.ok) console.error(gate.issues);
```

**KINDS note:** copy `UNTRUSTED_PAGE_DOC_HINT` into `packages/blueprint/src/untrusted.ts`
(or a content-kind branch) so paste/link loads refuse oversized page/doc bodies
before full schema parse. This package does not patch the blueprint loader.

## Coming next

- Pure TOC builder
## Table of contents (pure, no DOM)

`buildDocToc` walks heading blocks (and nested columns/tabs/reveals) and returns
`{ id, label, level }[]` for deep links and print. Slug rules match
`DocsLayout` / `@protoyard/blocks` `slugifyHeading`: NFKD, strip accents,
kebab-case, empty → `section`, collisions → `-2`, `-3`, ….

| `buildDocToc(doc \| blocks, { depth? })` | Doc flow TOC; levels 2…depth (default 3 from `doc.toc.depth` or 3) |
| `buildPageToc(page, { depth? })` | Section titles (id = anchor ?? section id) then in-section headings |
| `headingId(label)` | Same slug as DocsLayout `headingId` |
| `allocateHeadingId(label, used, preferredId?)` | Keep author id when unique; else slug + suffix |

Level 1 headings are omitted (document title). Author `block.id` / section
`anchor` wins when unique. Pure: never mutates the document, never touches the DOM.

```ts
import { buildDocToc, headingId } from '@protoyard/pages';

const toc = buildDocToc(doc);
// [{ id: 'getting-started', label: 'Getting Started', level: 2 }, …]
expect(headingId('  Café  Overview! ')).toBe('cafe-overview');
```
## Minimal runtimes

The page/doc runtime entry points can use the same helpers to create
definitions without the app blueprint generator or Faker:

```ts
import { definePrototypeFromPage } from '@protoyard/pages';

const definition = definePrototypeFromPage(pageDocument, {
  namespace: 'bp-example',
  slug: 'example-page',
  name: 'Example page',
  brandThemeId: 'violet',
});
```

The player and generated-prototype wiring is owned by the KINDS tasks. The
document title and description seed the manifest unless root blueprint
metadata overrides them. Pass a resolved `brandTheme` when the blueprint brand
defines a local theme, or `brandThemeId` for a library theme. Each helper
declares one `default` scenario with an empty world, no domain roles and no
generator module. A `formResponses` store is declared only when the document
contains a form block, including one nested inside columns, tabs or reveal.
These are local prototype simulations; a form does not provide real
authentication or data protection.

## Coming next

- `PAGE_LIMITS` / `DOC_LIMITS` for the untrusted loader
- `formResponses` services and minimal runtimes
- Pure TOC builder
- `formResponses` services
- `PageApp` / `DocApp` in `@protoyard/pages-ui`

## Development

```bash
pnpm --filter @protoyard/pages typecheck
pnpm vitest run packages/pages
```
