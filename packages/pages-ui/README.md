# @protoyard/pages-ui

Svelte 5 hosts for Protoyard **page** and **doc** kinds ([ADR-039](../../docs/DECISIONS.md)):
`PageApp`, `DocApp`, form-response UI and print CSS. One lazy subpath per family.
Nothing here is re-exported from the `@protoyard/ui` barrel. The data engine is
[`@protoyard/pages`](../pages/README.md).

## Status

Scaffold only. Family subpaths export placeholders so imports and typecheck
resolve before the hosts land.

| Import | Contents today |
| --- | --- |
| `@protoyard/pages-ui` | `PAGE_UI_FAMILIES`, package version, re-export of `@protoyard/pages` identity |
| `@protoyard/pages-ui/page` | `PAGE_UI_SUBPATH` placeholder (PageApp later) |
| `@protoyard/pages-ui/doc` | `DOC_UI_SUBPATH` placeholder (DocApp later) |
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

## Coming next (PLAN_005)

- `PageApp` / `PageHost` on `./page` (MarketingLayout chrome, single scroll)
- `DocApp` / `DocHost` on `./doc` (DocsLayout TOC)
- Form block wiring and responses panel on `./form`
- Print stylesheet and `PrintButton` on `./print`
- Shared use by the player kind entries and level-2 `generate` templates

## Development

```bash
pnpm --filter @protoyard/pages-ui typecheck
pnpm vitest run packages/pages-ui
```
