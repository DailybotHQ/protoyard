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
- Pure TOC builder
- `formResponses` services
- `PageApp` / `DocApp` in `@protoyard/pages-ui`

## Development

```bash
pnpm --filter @protoyard/pages typecheck
pnpm vitest run packages/pages
```
