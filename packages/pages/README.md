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
| `FormResponseSchema` | Bounded persisted values keyed by a form field name |
| `FORM_RESPONSES_TABLE` / `FORM_RESPONSES_STORE_STRING` | Ordinary IndexedDB feature table name and Dexie indexes |
| `PAGE_FEATURE_TABLES` / `PAGE_FEATURE_STORE_STRINGS` | Feature descriptors for the page/doc runtime |
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

`FormResponseSchema` stores a row `{ id, formId, createdAt, values }` where
`createdAt` is an ISO datetime and `values` contains only bounded strings,
finite numbers, booleans or bounded string arrays. Unsafe keys and unknown row
fields are rejected. The values object is capped at 8 KiB and 32 entries.
Responses use the non-reserved `formResponses` table with indexes
`id, formId, createdAt, [formId+createdAt]` so snapshots include them.

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
- `formResponses` services and minimal runtimes
- `PageApp` / `DocApp` in `@protoyard/pages-ui`

## Development

```bash
pnpm --filter @protoyard/pages typecheck
pnpm vitest run packages/pages
```
