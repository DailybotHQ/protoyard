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

## Table of contents (pure, no DOM)

`buildDocToc` walks heading blocks (and nested columns/tabs/reveals) and returns
`{ id, label, level }[]` for deep links and print. Slug rules match
`DocsLayout` / `@protoyard/blocks` `slugifyHeading`: NFKD, strip accents,
kebab-case, empty → `section`, collisions → `-2`, `-3`, ….

| Export | Role |
| --- | --- |
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

## Coming next

- `PAGE_LIMITS` / `DOC_LIMITS` for the untrusted loader
- `formResponses` services and minimal runtimes
- `PageApp` / `DocApp` in `@protoyard/pages-ui`

## Development

```bash
pnpm --filter @protoyard/pages typecheck
pnpm vitest run packages/pages
```
