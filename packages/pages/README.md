# @protoyard/pages

Framework-agnostic **page** and **doc** engine for Protoyard blueprints
(`kind: "page"` and `kind: "doc"`, [ADR-036](../../docs/DECISIONS.md) and
[ADR-039](../../docs/DECISIONS.md)). No Svelte. Svelte hosts live in
[`@protoyard/pages-ui`](../pages-ui/README.md).
For the authoring guide and current Player/generator limits, see
[`docs/PAGES.md`](../../docs/PAGES.md).

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
| `createFormServices` / `FORM_CAPABILITIES` | Capability-checked submit, list, guarded CSV export and clear operations |
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

`FormResponseSchema` stores a row `{ id, formId, createdAt, values }` with
optional `personaId` and `documentId`. `createdAt` is an ISO datetime and
`values` contains only bounded strings, finite numbers, booleans or bounded
string arrays. Unsafe keys and unknown row fields are rejected. The values
object is capped at 8 KiB and 32 entries. The Dexie indexes also include
`personaId`, `documentId` and `[formId+createdAt]`.
Responses use the non-reserved `formResponses` feature table. The kind runtime
includes it in its database and snapshot data.

## Form response services

Build the response services with the active runtime and the form blocks from
the document. The service validates each submission against that form's field
names, required flags, types, options and bounds, then validates the complete
row with `FormResponseSchema` before it writes:

```ts
import { createFormServices } from '@protoyard/pages';

const forms = [contactForm]; // FormBlock values with stable ids
const responses = createFormServices(runtime, forms);

const saved = await responses.submit('contact-form', {
  email: 'ada@example.com',
  topics: ['research'],
});
const rows = await responses.list('contact-form');
const csv = await responses.exportCsv('contact-form');
const removed = await responses.clear('contact-form');
```

`submit` requires `form:submit`; `list` and `exportCsv` require `form:read`;
`clear` requires `form:admin`. These are simulated capabilities, not real
authentication or data protection. Writes pass through `environment.run` and
a Dexie transaction on `formResponses`. A form retains at most
`PAGE_LIMITS.maxResponsesPerForm` rows; clearing is explicit. CSV output uses
RFC 4180 quoting and prefixes formula-like text so spreadsheet software treats
it as text. Plain numeric values remain unmodified.

The minimal page/doc runtime has an empty world and policy. A host must provide
an active simulated principal with the needed capabilities before these
operations can succeed.

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


## Development fixtures

Internal JSON under `packages/pages/fixtures/` supports unit tests, KINDS
smoke and visual QA. The `@protoyard/pages/fixtures` export is available only
from the workspace source; fixtures are not part of the published package.
Fictional **example.com** data only.

| File | Contents |
| --- | --- |
| `landing-page.json` | Marketing landing: hero, stats, CTA, waitlist form, nav |
| `one-pager-doc.json` | Report one-pager: TOC, headings, stats, chart, table, quote |

```ts
import {
  loadLandingPageFixture,
  loadOnePagerDocFixture,
} from '@protoyard/pages/fixtures';

const page = loadLandingPageFixture();
const doc = loadOnePagerDocFixture();
```

AUTHORING owns catalog blueprints under `blueprints/pages` and `blueprints/docs`;
these fixtures stay small and package-local.

## Development

```bash
pnpm --filter @protoyard/pages typecheck
pnpm vitest run packages/pages
```

## Runtime and forms

This package is a **pure engine**: schemas, limits, TOC, `FormResponseSchema`,
and `createFormServices`. It does **not** depend on `@protoyard/blueprint`.

Build a page/doc prototype runtime from
`@protoyard/blueprint/kinds`:

```ts
import {
  defineKindRuntime,
  definePrototypeFromPage,
  definePrototypeFromDoc,
} from '@protoyard/blueprint/kinds';
```

`definePrototypeFromPage` / `definePrototypeFromDoc` wrap a document body as a
content blueprint and call `defineKindRuntime` (shared personas, policy, stores).
Kind services (`createKindServices`) delegate form submit/list to
`createFormServices` here.

These runtime helpers do not mean that level-1 Player page/doc entries or
level-2 `protoyard generate` templates are wired yet; see the current status in
[`docs/PAGES.md`](../../docs/PAGES.md#current-support).
