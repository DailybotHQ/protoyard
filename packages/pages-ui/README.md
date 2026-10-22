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
| `@protoyard/pages-ui` | `PAGE_UI_FAMILIES`, package version, `BlockHost`, `PageHost`, `DocHost`, pages identity |
| `@protoyard/pages-ui/page` | `PageHost` marketing landing renderer |
| `@protoyard/pages-ui/doc` | `DocHost` continuous doc flow with DocsLayout TOC |
| `@protoyard/pages-ui/form` | `FORM_UI_SUBPATH` placeholder (form block host + responses panel later) |
| `@protoyard/pages-ui/doc` | `DOC_UI_SUBPATH` placeholder (DocApp later) |
| `@protoyard/pages-ui/form` | `FormBlock` public-form renderer; submits through `@protoyard/pages` form services |
| `@protoyard/pages-ui/print` | `PRINT_UI_SUBPATH` placeholder (print CSS + button later) |
| `@protoyard/pages-ui/styles.css` | Empty kit stylesheet hook |
| `@protoyard/pages-ui/print` | `PrintButton`, `PRINT_ROOT_CLASS` and the print stylesheet (`print.css`) |
| `@protoyard/pages-ui/styles.css` | Kit stylesheet hook; includes the print rules (print media only) |

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



## Print

Pages and docs print as clean documents. The print stylesheet
(`src/print/print.css`) keeps every rule inside `@media print`, so it costs
nothing on screen. It is part of `@protoyard/pages-ui/styles.css`, and importing
`@protoyard/pages-ui/print` loads it too. It applies to the `PageHost` and
`DocHost` roots (`data-py-page-host`, `data-py-doc-host`); other hosts opt in
with the `PRINT_ROOT_CLASS` (`py-print-root`) class on their root.

- **Hidden on paper:**
  - DevTools (`.py-devtools`), the demo badge, review comment UI, the progress
    bar, toasts and other fixed overlays;
  - page navigation (`data-py-page-nav`), the doc navigation and table of
    contents;
  - the print button itself, and anything marked `data-py-print-hide`.
- **Kept on paper:**
  - external links print their address after the text;
  - cards and blocks (`data-py-block`), figures, tables, code, quotes, images
    and list items avoid breaking across pages, and headings stay with the
    text after them;
  - scroll regions print in full;
  - the doc content takes the whole sheet once the side columns are hidden.
- **Paper:** white background and dark text whatever the theme, no shadows or
  animation, and `@page` margins of 16 mm, 14 mm and 18 mm.
- **Size:** in a Tailwind v4 build the print block is 2,903 B minified (738 B
  gzip), measured on 2026-10-21.

```svelte
<script lang="ts">
import { PrintButton } from '@protoyard/pages-ui/print';
</script>

<PrintButton label="Print report" />
```

`PrintButton` is a `@protoyard/ui` `Button` with a visible label (default
"Print") and a printer glyph. It calls `window.print()` once per click. Deck
slide-per-page printing lives in `@protoyard/decks-ui`.

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

- Form block wiring and responses panel on `./form`
- `PageApp` / `PageHost` on `./page` (MarketingLayout chrome, single scroll)
- `DocApp` / `DocHost` on `./doc` (DocsLayout TOC)
- Response management panel and print controls on their family subpaths
- Print stylesheet and `PrintButton` on `./print`
- Shared use by the player kind entries and level-2 `generate` templates

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
pnpm vitest run packages/pages-ui/tests/doc-host.test.ts
pnpm vitest run packages/pages-ui/tests/security.test.ts
```
