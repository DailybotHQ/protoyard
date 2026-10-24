# Layouts

A layout is the page structure around a prototype's routed screens: navigation,
header, content columns and responsive chrome. A shell is the simulated device
or host frame around the whole app ([SHELLS.md](SHELLS.md)); the two compose.
Layouts render navigation from data, so the same route set can work in several
page structures. The contract and width fallbacks are data in `@protoyard/core`.
`@protoyard/ui`'s `LayoutHost` wraps texuli's (`texuli/layouts/host`): every
layout but `docs` is texuli's implementation, and `docs` stays Protoyard's
([TEXULI.md](TEXULI.md#layouts-come-from-texulilayouts)).


### Page kind host (`@protoyard/pages-ui`)

`PageHost` composes the shared **marketing** layout chrome for `kind: "page"`
documents: brand, hash navigation, hero section, sequential body sections and
footer. Section elements expose `id` (from `section.anchor` or `section.id`),
`data-py-page-section`, and `scroll-mt-20` so in-page `#` links scroll into view.
The root node is `data-py-page-host` for tests and visual sweep.

```svelte
<script lang="ts">
  import { PageHost } from '@protoyard/pages-ui/page';
  import type { PageDocument } from '@protoyard/pages';
  let { page }: { page: PageDocument } = $props();
</script>

<PageHost {page} />
```

### Doc kind host (`@protoyard/pages-ui`)

`DocHost` composes the shared **docs** layout chrome for `kind: "doc"` documents:
optional left section nav, continuous `BlockHost` flow, and a sticky on-page TOC.
TOC entries come from `buildDocToc` in `@protoyard/pages`; heading elements get
matching `id`s so `#` links and live `aria-current` stay aligned. The root node
is `data-py-doc-host`. Docs layout CSS is scoped inside `DocsLayout` (sticky TOC
from the `72rem` container breakpoint).

```svelte
<script lang="ts">
  import { DocHost } from '@protoyard/pages-ui/doc';
  import type { DocDocument } from '@protoyard/pages';
  let { doc }: { doc: DocDocument } = $props();
</script>

<DocHost {doc} />
```

## Catalog

The shared layouts are selected from `preview.layout`, DevTools, or a
`?layout=<id>` override. The host measures its own available width, which is
the useful width inside a shell or side panel. When a layout has a fallback,
the host resolves the chain from the core `LAYOUTS` catalog.

| Id | Intended use | Minimum width | Narrow fallback |
| --- | --- | ---: | --- |
| `sidebar` | General app navigation with a persistent sidebar | 768 px | `mobile-drawer` |
| `rail` | Dense apps with icon-first navigation | 640 px | `mobile-tabs` |
| `top-nav` | Apps with a small set of primary destinations | 768 px | `mobile-drawer` |
| `dual-sidebar` | Workspace switcher, section navigation and context panel | 1024 px | `sidebar`, then its fallback |
| `master-detail` | A selectable list beside its current detail | 900 px | `mobile-drawer` |
| `dashboard-grid` | Static dashboard widgets | 768 px | `mobile-drawer` |
| `docs` | Documentation navigation, content and table of contents | 900 px | `mobile-drawer` |
| `marketing` | A content-first landing or product page | none | adapts itself |
| `mobile-tabs` | Mobile navigation with a bottom tab bar | none | adapts itself |
| `mobile-drawer` | Mobile navigation behind a header menu | none | adapts itself |
| `wizard` | Step-based setup or guided flow | none | adapts itself |
| `auth-split` | Sign-in and account entry pages | none | adapts itself |

`custom` means the prototype supplies its own page layout. It is the default
and is not a shared component in the registry. `LAYOUTS` and
`layoutForWidth()` in `packages/core/src/layouts.ts` are the source of truth
for supported ids, platform hints, width thresholds and fallbacks.

## Manifest and overrides

Opt in through `preview.layout` in `protoyard.json`:

```json
{
  "preview": {
    "layout": {
      "id": "sidebar",
      "supported": ["rail", "top-nav"],
      "options": { "visibleItems": 4 }
    }
  }
}
```

`id` selects the starting layout. `supported` limits the choices offered by
DevTools and always retains `id`; when omitted, all shared layouts are
available. When `id` is `custom` and `supported` is omitted, only `custom` is
offered; set `supported` explicitly to opt into shared choices. `options` is a
flat map of string, number or boolean values for a layout-specific, data-only
setting.
The runtime resolves appearance as temporary override, scenario, then
manifest. `?layout=top-nav` sets a clearable temporary override, and the
reproducible share link carries it.

## Navigation model and routed screens

`NavModel` is data, not layout markup. Use `navFromSidebar()` to adapt an
existing `Sidebar` item list, or construct `sections`, `items`, `actions` and
`user` directly. Items use hash links and stable ids. Layouts calculate the
active route from the current path; the deepest matching item is active and
its parents are marked as a trail. Icons can be Lucide components or names
from `NavIconName`. A navigation action can return a promise to get pending
feedback from the layout.

Wrap the app's router once with `LayoutHost`. The router continues to own the
routes; changing the shared layout moves its stable screen outlet to the new
layout and preserves the currently mounted route state. It is therefore a
page-level choice around routes, not a route declaration or a second router.

```svelte
<script lang="ts">
  import { createRouter, Router, useAppearance } from '@protoyard/renderer-svelte';
  import { LayoutHost, navFromSidebar } from '@protoyard/ui';

  const appearance = useAppearance();
  const router = createRouter(routes);
  const nav = navFromSidebar([
    { href: '#/', label: 'Overview' },
    { href: '#/projects', label: 'Projects' },
  ], { brand: { label: 'Northstar' } });
</script>

<LayoutHost layout={appearance.current.layout.value} {nav} storageKey="northstar">
  <Router {router} />
</LayoutHost>
```

`LayoutHost` also accepts `path`, validated `options`, and an `aside` snippet
for layouts that use a context panel. Its default content frame keeps screens
visible when a selected id has no registered component; registered modules
show a loading skeleton while their lazy import resolves.

### Content layouts

`master-detail`, `dashboard-grid` and `docs` are page layouts like the others:
select them through `LayoutHost`, which mounts the routed screen in them.
`master-detail` (Texuli's) lists the nav model's items as the master list and
shows the routed screen as the detail; on narrow containers it shows the list
or the active detail with a Back link. `dashboard-grid` (Texuli's) mounts the
screen into a container-query widget grid where children with `data-span="2"`
through `data-span="4"` span columns, clamped to the current column count; it
does not implement drag-and-drop. `docs` (Protoyard's `DocsLayout`, also
exported as `@protoyard/ui/layouts/docs`) accepts navigation and content
snippets and builds a table of contents from visible h2 and h3 headings.

For composition inside a screen, `PageGrid` fits cards to a minimum preferred
item width and caps the number of columns, while `SplitView` (Texuli's,
re-exported) provides labeled list and detail regions. The grid and panes use `min-width: 0` so wide child
content can shrink within narrow containers. `SplitView` shows the list or the
selected detail on narrow hosts via `detailActive`, and both panes at the
existing 56rem desktop breakpoint. The caller owns route selection and back
navigation; these primitives add no navigation catalog entries.

```svelte
<script lang="ts">
  import { PageGrid, SplitView } from '@protoyard/ui';
  let detailActive = $state(false);
</script>

<PageGrid label="Projects" columns={3} minItem={280}>
  <ProjectCards />
</PageGrid>

<SplitView bind:detailActive listLabel="Projects" detailLabel="Project details">
  {#snippet list()}<ProjectList />{/snippet}
  {#snippet detail()}<ProjectDetails />{/snippet}
</SplitView>
```
Rich views remain screen content inside these page structures. For example,
`TimelineView` keeps its grouped schedule, milestone focus, unscheduled tray
and truncation notice inside the active route; the shared layout owns page
navigation and responsive chrome, while the timeline owns its task controls.

## Responsive rules and shells

Desktop layouts use container queries. Below their catalog width they fall
back to mobile tabs, mobile drawer, or—in the dual-sidebar chain—the sidebar
before its own mobile fallback. Mobile tabs show up to five destinations and
put the remainder in a **More** sheet. Mobile drawer keeps the complete model
in a side drawer. The first `nav.actions` entry, when present, is rendered as
the mobile tab bar's primary action; later actions remain in the header. The
tab bar stays in normal flow, includes horizontal and bottom safe-area padding,
and exposes badge values as part of each destination's accessible name. The
mobile header and tabs stay around one scrollable content area; test that the
active shell does not cover primary inputs.

A layout inside a phone, tablet, browser, desktop window or panel should size
to the app container, not the browser viewport. Prefer container queries to
viewport media queries. Use `h-app` and `min-h-app` for framed viewport height,
safe-area utilities for cutouts, and `device-frame:` variants when a max-width
would otherwise leave a narrow column inside a wide device frame. See
[SHELLS.md](SHELLS.md#laying-out-an-app-inside-a-shell) for frame sizing and
[TESTING_GUIDE.md](TESTING_GUIDE.md#visual-qa-sweep) for the visual matrix.

## Adding or changing a shared layout

Every shared layout but `docs` is Texuli's, so a change to one of those
belongs in Texuli ([TEXULI.md](TEXULI.md#layouts-come-from-texulilayouts)).
For a new id, or a layout Protoyard owns:

1. Add the data-only id, platform support, minimum width and fallback in
   `packages/core/src/layouts.ts`; keep `LAYOUT_IDS` and `LAYOUTS` aligned and
   extend `packages/core/tests/layouts.test.ts`.
2. Implement the layout against Texuli's `LayoutProps` (exported from
   `texuli/layouts/host`): mount the outlet with `mountScreen(target)`,
   preserve the supplied route content, and cover focus, narrow containers,
   navigation and shell composition. A Protoyard-owned layout lives under
   `packages/ui/src/layouts/`, as `DocsLayout.svelte` does.
3. Register one lazy import for the id in `registerProtoyardLayouts`
   (`packages/ui/src/layouts/register.ts`), the way `docs` is registered
   with `registerLayout`. Do not export the layout through the
   `@protoyard/ui` barrel; unused layout code must stay off the initial path.
4. Add or extend the UI layout tests and verify a production bundle. Run the
   layout-fit E2E checks on the app's desktop and phone contexts when its
   dimensions or scrolling behavior change.

Useful scoped checks:

```bash
pnpm vitest run packages/core/tests/layouts.test.ts packages/ui/tests/layout-host.test.ts
pnpm --filter @protoyard/ui typecheck
```

See [packages/ui/README.md](../packages/ui/README.md) for the component-level
catalog and API, and [PERFORMANCE.md](PERFORMANCE.md) for measured layout
payloads.
