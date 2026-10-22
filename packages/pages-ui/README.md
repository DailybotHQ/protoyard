# @protoyard/pages-ui

Svelte 5 hosts and UI for the Protoyard `page` and `doc` content kinds:
`PageApp`, `DocApp`, reusable block rendering, form responses and print
support. The framework-neutral schemas and services are in
[`@protoyard/pages`](../pages/README.md). For the authoring guide and the
current Player/generator integration status, see
[`docs/PAGES.md`](../../docs/PAGES.md).

## Exports

| Import | Contents |
| --- | --- |
| `@protoyard/pages-ui` | Shared metadata, `BlockHost`, `PageApp`, `PageHost`, `DocApp`, `DocHost`, and form service context |
| `@protoyard/pages-ui/block-host` | Lazy renderer for one shared content block |
| `@protoyard/pages-ui/page` | `PageApp` and `PageHost` |
| `@protoyard/pages-ui/doc` | `DocApp` and `DocHost` |
| `@protoyard/pages-ui/form` | `FormBlock`, `ResponsesPanel`, and form service context |
| `@protoyard/pages-ui/print` | `PrintButton` and print stylesheet |
| `@protoyard/pages-ui/styles.css` | Page/doc print rules, all inside `@media print` |
The page and doc hosts, shared block host, public form and responses panel, and
print entry are implemented. `PageApp` and `DocApp` are the same kind-level
hosts used by the player and generated prototypes.

| `@protoyard/pages-ui` | Package metadata, `BlockHost`, `PageHost`, `DocHost`, `PageApp`, `DocApp` and form context helpers |
| `@protoyard/pages-ui/block-host` | Lazy `BlockHost` and block-family resolver |
| `@protoyard/pages-ui/page` | `PageApp` and `PageHost` marketing landing renderer |
| `@protoyard/pages-ui/doc` | `DocApp` and `DocHost` continuous document flow with TOC |
| `@protoyard/pages-ui/form` | `FormBlock` and `ResponsesPanel` |
| `@protoyard/pages-ui/print` | `PrintButton`, `PRINT_ROOT_CLASS` and print stylesheet |
| `@protoyard/pages-ui/styles.css` | Kit stylesheet hook, including print-only rules |

The package root is convenient for shared imports. Use the explicit family
subpaths from lazy routes when you want to keep page, doc, form or print code
out of an entry that does not need it.

## Install and styles

```json
{
  "dependencies": {
    "@protoyard/pages-ui": "workspace:*"
  }
}
```

```css
@import 'tailwindcss';
@import '@protoyard/themes/base.css';
@import '@protoyard/ui/styles.css';
@import '@protoyard/pages-ui/styles.css';
```

For example, load a host from a lazy route:

```ts
const pageUi = () => import('@protoyard/pages-ui/page');
```

## Page and document hosts

`PageHost` renders a `PageDocument` as one marketing page with section anchors
and `MarketingLayout` chrome. `DocHost` renders a `DocDocument` as a focused,
continuous report with one title block and one heading-based table of contents.
Both validate content blocks at their host boundary and render blocks through
`BlockHost`, which dynamically imports the matching `@protoyard/blocks-ui`
family. Unknown block types show a safe message; content is not inserted as
raw HTML.

```svelte
<script lang="ts">
  import { PageHost } from '@protoyard/pages-ui/page';

  let { page } = $props();
</script>

<PageHost {page} />
```

`DocHost` derives heading ids and TOC entries from `buildDocToc` in
`@protoyard/pages`. When the first block is an `h1`, its eyebrow and subtitle
join the document title in one title block; the source block is not rendered a
second time. A single disclosure is a collapsible TOC on phones and a sticky
rail on wide screens. Its active link follows the visible section. The
`showNav` prop remains available to hide the outline. Content stays within a
72-character reading measure, and the TOC is omitted from print output.

## Forms and responses

The `form` subpath exports `FormBlock` for rendering a validated form block
and `ResponsesPanel` for viewing its local responses. Create services with
`createFormServices` from `@protoyard/pages` and provide them to the components.
The service validates submitted fields and stores responses in the current
runtime's IndexedDB `formResponses` feature table.

```svelte
<script lang="ts">
  import { FormBlock } from '@protoyard/pages-ui/form';

  let { form, services } = $props();
</script>

<FormBlock {form} {services} />
```

`ResponsesPanel` supports a live list, CSV download and a capability-guarded
clear action. Capabilities such as `form:read` and `form:admin` are simulated
prototype behavior. They do not provide authentication, security, privacy
protection, server storage or email delivery. The form and response boundaries
are documented in [`docs/PAGES.md`](../../docs/PAGES.md#public-forms-are-local-simulations).

## Print

Import the stylesheet through `@protoyard/pages-ui/styles.css`, or import
`@protoyard/pages-ui/print` when using `PrintButton`. The print CSS hides
navigation and overlays, removes screen-only clipping, and formats page/doc
content for paper. `PrintButton` calls the browser's `window.print()` dialog;
it does not upload or create a server-side PDF. Deck slide-per-page printing is
provided separately by `@protoyard/decks-ui`.

The schema accepts `doc.print.pageBreaks` and `doc.print.hideChrome`, but the
current print stylesheet does not apply those per-document preferences.

## Integration status

The schemas, body checks, hosts, forms and print styles are implemented. The
dedicated level-1 Player page/doc entries and level-2 `templates/page` and
`templates/doc` generation templates are not wired in this repository revision.
`protoyard generate` currently supports app blueprints only. The shared hosts
and `definePrototypeFromPage` / `definePrototypeFromDoc` runtime helpers are
available for those integrations, but do not provide Player or generation
parity by themselves. See [`docs/PAGES.md`](../../docs/PAGES.md#current-support)
for the full scope and limits.
<ResponsesPanel {form} {services} can={(capability) => runtime.session.can(capability)} />
```

- **Live list.** It uses `liveQuery` from `@protoyard/renderer-svelte` over
  `services.list(form.id)`, so a submission from the form on the same page, a
  scenario load or a snapshot restore updates it without a refresh. It shows
  a loading state, an empty state ("No responses yet") and the service's
  error. The table has one column per form field, oldest first; lists are
  joined, booleans are Yes/No, and empty values are "—".
- **Download CSV** calls `services.exportCsv(form.id)` (RFC 4180, with
  formula-like cells guarded) and saves `<form-id>-responses.csv` as a
  `text/csv` blob. The button shows pending feedback, and a failure appears
  as an alert. Pass `save` to deliver the blob another way.
- **Clear…** opens the shared `AlertDialog` (Cancel focused). Confirming calls
  `services.clear(form.id)` with a spinner. The list empties live, and a
  failure keeps the dialog open with the error.
- **Simulated roles.** Without `form:read` the panel shows a note and no data.
  Without `form:admin` there is no clear action, only a note. The services
  assert the same capabilities, so the panel never offers a button that would
  fail. These roles are a prototype simulation, not security.

The panel adds about 37 KB gzip to the form subpath when measured on its own
(svelte and zod external). In a page entry, the ui kit, `renderer-svelte` and
Dexie are already loaded by the host. Import it only on the screen that shows
responses.

## Bundle budgets

`PageApp` and `DocApp` are measured independently with real production Vite
fixtures. Each entry stays under 120 KB gzip JavaScript and its package-owned
CSS stays under 20 KB gzip. Shared Tailwind, theme and UI stylesheets belong to
the consuming app and are excluded. The static graph excludes the CRUD app,
Faker and the player worker. Current measurements and the exact gate are in
[`docs/PERFORMANCE.md`](../../docs/PERFORMANCE.md#page-and-doc-host-budgets).

## Security

Page and doc hosts never inject raw HTML. Rich text goes through the same
safe markdown path as the rest of Protoyard (`safeHref` / `safeImageSrc`);
`javascript:` and `data:` links are dropped; form field names
`__proto__`, `constructor` and `prototype` are ignored on submit. The suite
[`tests/security.test.ts`](./tests/security.test.ts) scans `src/` for
`{@html}`, `eval`, `innerHTML` assignment and related patterns, and proves
the rendering rules above.

```bash
pnpm vitest run packages/pages-ui/tests/security.test.ts
# companion gate: no raw HTML directive in source
rg -n '\{@html\}' packages/pages-ui/src && exit 1 || true
```

## Development

```bash
pnpm --filter @protoyard/pages-ui typecheck
pnpm vitest run packages/pages-ui
```
