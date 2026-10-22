# @protoyard/pages-ui

Svelte 5 hosts for Protoyard **page** and **doc** kinds ([ADR-039](../../docs/DECISIONS.md)):
`PageApp`, `DocApp`, form-response UI and print CSS. One lazy subpath per family.
Nothing here is re-exported from the `@protoyard/ui` barrel. The data engine is
[`@protoyard/pages`](../pages/README.md).

## Status

| Import | Contents today |
| --- | --- |
| `@protoyard/pages-ui` | `PAGE_UI_FAMILIES`, package version, `BlockHost`, `PageHost`, `DocHost`, pages identity |
| `@protoyard/pages-ui/page` | `PageHost` marketing landing renderer |
| `@protoyard/pages-ui/doc` | `DocHost` continuous doc flow with DocsLayout TOC |
| `@protoyard/pages-ui/form` | `FORM_UI_SUBPATH` placeholder (form block host + responses panel later) |
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

## DocHost

Continuous block-flow renderer for a `DocDocument`:

```ts
import { DocHost } from '@protoyard/pages-ui/doc';
```

Composes `@protoyard/ui` **DocsLayout**: optional left nav (level-2 TOC entries),
main `BlockHost` list, and a sticky on-page TOC. TOC entries come from
`buildDocToc` (`@protoyard/pages`); heading elements receive matching `id`s so
deep links and `aria-current` stay aligned. Root attribute: `data-py-doc-host`.
Set `showNav={false}` to hide the left rail.

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

## Coming next (PLAN_005)

- Form block wiring and responses panel on `./form`
- Print stylesheet and `PrintButton` on `./print`
- Shared use by the player kind entries and level-2 `generate` templates

## Development

```bash
pnpm --filter @protoyard/pages-ui typecheck
pnpm vitest run packages/pages-ui
pnpm vitest run packages/pages-ui/tests/doc-host.test.ts
```
