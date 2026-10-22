# @protoyard/pages-ui

Svelte 5 hosts for Protoyard **page** and **doc** kinds ([ADR-039](../../docs/DECISIONS.md)):
`PageApp`, `DocApp`, form-response UI and print CSS. One lazy subpath per family.
Nothing here is re-exported from the `@protoyard/ui` barrel. The data engine is
[`@protoyard/pages`](../pages/README.md).

## Status

The page host, lazy block host and form renderer are implemented. Doc and print
hosts and the form responses panel are still in progress.

| Import | Contents today |
| --- | --- |
| `@protoyard/pages-ui` | `PAGE_UI_FAMILIES`, package version, `BlockHost`, re-export of `@protoyard/pages` identity |
| `@protoyard/pages-ui/page` | `PageHost` marketing landing renderer |
| `@protoyard/pages-ui/doc` | `DOC_UI_SUBPATH` placeholder (DocApp later) |
| `@protoyard/pages-ui/form` | `FormBlock` public-form renderer; submits through `@protoyard/pages` form services |
| `@protoyard/pages-ui/print` | `PRINT_UI_SUBPATH` placeholder (print CSS + button later) |
| `@protoyard/pages-ui/styles.css` | Empty kit stylesheet hook |

## Install in a workspace prototype

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

Import a family from a lazy route so page/doc UI stays out of the initial chunk:

```ts
const page = () => import('@protoyard/pages-ui/page');
```



## PageHost

Marketing landing renderer for a `PageDocument`:

```ts
import { PageHost } from '@protoyard/pages-ui/page';
```

Composes `@protoyard/ui` **MarketingLayout** chrome (brand, hash nav, hero,
sections, footer). Each section id is the deep-link target (`anchor` or `id`).
Root attribute: `data-py-page-host`. Blocks render through `BlockHost`.

## BlockHost

Lazy single-block host used by page and doc surfaces:

```ts
import { BlockHost } from '@protoyard/pages-ui/block-host';
// or from '@protoyard/pages-ui'
```

`BlockHost` validates the block, dynamically imports
`@protoyard/blocks-ui/<family>` (text, media, data, …), shows
`LoadingState` / `ErrorState` from `@protoyard/ui`, and renders a safe
placeholder for unknown types. It never uses raw HTML injection. Family
chunks stay out of the page entry graph.

## FormBlock

Render one validated `FormBlock` from `@protoyard/blocks` and pass the
`createFormServices(runtime, forms)` result from `@protoyard/pages`:

```svelte
<script lang="ts">
import { FormBlock } from '@protoyard/pages-ui/form';

let { form, services } = $props();
</script>

<FormBlock {form} {services} />
```

The form maps text, long text, email, URL, phone, number, boolean, enum and tag
fields to shared `@protoyard/ui` controls. Required fields are checked after
the first submit attempt; service validation errors appear beside their field.
The submit button returns the service promise so it shows pending feedback.
Responses are stored and validated only by `createFormServices`; this simulated
local form is not authentication, an authorization boundary or a network form.

## Coming next (PLAN_005)

- `PageApp` / `PageHost` on `./page` (MarketingLayout chrome, single scroll)
- `DocApp` / `DocHost` on `./doc` (DocsLayout TOC)
- Response management panel and print controls on their family subpaths
- Print stylesheet and `PrintButton` on `./print`
- Shared use by the player kind entries and level-2 `generate` templates

## Development

```bash
pnpm --filter @protoyard/pages-ui typecheck
pnpm vitest run packages/pages-ui
```
