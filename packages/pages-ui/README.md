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
and `MarketingLayout` chrome. `DocHost` renders a `DocDocument` as a continuous
flow with `DocsLayout` navigation and a heading-based table of contents.
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
`@protoyard/pages`. Its `showNav` prop can hide the left navigation rail.

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

## Development

```bash
pnpm --filter @protoyard/pages-ui typecheck
pnpm vitest run packages/pages-ui
```
