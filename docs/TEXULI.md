# Texuli in Protoyard

Protoyard is Texuli-first: new shared and prototype UI starts with the
published [Texuli](https://www.npmjs.com/package/texuli) components, tokens,
and kits. Protoyard composes them through its public package exports and
keeps product behavior, runtime contracts, and documented exceptions in
Protoyard. Every Texuli dependency is pinned to an exact npm version in this
workspace (`0.8.0` or `0.8.1`; `@texuli/slides` `0.8.2`), and every workspace
package uses the same pin; `check-texuli-latest.ts --registry` compares the pins
with npm `latest` before a release.

## How it is linked

Texuli is consumed from npm at exact versions. The workspace does not require
a Texuli checkout or use `link:`/`file:` dependencies for Texuli. The release
age guard exempts Texuli packages so Protoyard can adopt the release from its
maintainer as it ships. Dependency changes and the lockfile are maintained as
one workspace update.

`pnpm exec tsx scripts/check-texuli-latest.ts` keeps it that way: it fails
when a Texuli dependency is not an exact npm version (`link:`, `file:`,
`workspace:`, a tag or a range) or when two manifests pin one package
differently. `pnpm test` runs it offline through
`scripts/tests/texuli-latest.test.ts`. `--registry` also compares every pin
with that package's npm `latest` dist-tag; run it before a release (the npm
CDN can lag a few minutes after a Texuli publish).

| Package family | Direct Protoyard consumers |
| --- | --- |
| `texuli` | `ai-ui`, `analytics-ui`, `blocks-ui`, `charts-ui`, `crud`, `decks-ui`, `devtools`, `flows-ui`, `gamification-ui`, `pages-ui`, `player`, `renderer-svelte`, `review-ui`, `saas-ui`, `ui`, `views-ui`, gallery; every template and prototype app |
| `@texuli/astro` | gallery |
| `@texuli/blocks` | `blocks`, `blocks-ui`, `pages-ui` |
| `@texuli/charts` | `analytics-ui`, `blocks-ui`, `charts`, `charts-ui`, `ui` |
| `@texuli/chat` | `ai-ui`, `ui` |
| `@texuli/core` | `ui` |
| `@texuli/data` | `analytics-ui`, `blocks-ui`, `ui`, `views`, `views-ui` |
| `@texuli/date` | `analytics-ui`, `ui` |
| `@texuli/deck` | `decks`, `decks-ui` |
| `@texuli/drag` | `views-ui` |
| `@texuli/editor` | `blocks-ui`, `views-ui` |
| `@texuli/primitives` | `devtools`, `ui`, `views-ui` |
| `@texuli/slides` | `decks-ui` |
| `@texuli/tokens` | gallery, `charts`, `themes` |
| `@texuli/workflows` | `flows-ui` |

`texuli` and most `@texuli/*` packages are `0.8.0`; `@texuli/data`, `blocks`,
`catalog` and `astro` are `0.8.1` and `@texuli/slides` is `0.8.2`. Texuli pins its own internal dependencies
exactly, so the family moves together. The root manifest
also pins the published Texuli package family used by optional and future
workspace surfaces. `docs/PACKAGES.md` lists the package graph and direct
dependencies.

Protoyard typechecks against the published package declarations in
`node_modules`; Texuli's own source is covered by the Texuli maintainers'
checks.

## The Texuli agent skill

Agents working in this repository have the Texuli skill at
`.agents/skills/texuli` (version 0.2.3). It is the pinned `skill-v0.2.3`
release, installed from its archive after checking the archive and every file
against the release's `SHA256SUMS` and running
`setup.sh --verify --expect-version 0.2.3`. It explains Texuli's components,
tokens, icons and layouts, and how to report a missing API. To upgrade, repeat
those steps for the new release and replace the folder; never edit it in place.

## Texuli first: the adoption check

Run `pnpm exec tsx scripts/check-texuli-adoption.ts` to enforce the nine
workspace rules. `pnpm test` (which CI runs) includes
`tests/adoption/texuli-adoption.test.ts`, which runs this default ratchet over
the whole repository. Scoped strict checks (`--scope <path> --strict`, with
`--allow-gaps` where a pending entry waits on an open gap) are not part of CI;
run them by hand for the surface a task migrates.

| Rule | Prevents | Required direction |
| --- | --- | --- |
| `legacy-import` | Imports of `clsx`, `tailwind-merge`, or `tailwind-variants` | Use Texuli's `cx` from `texuli/cx`. Protoyard keeps `cn` as an alias for compatibility; it is equivalent to `cx` and does not resolve Tailwind conflicts. Update callers that relied on conflict merging. |
| `raw-lucide` | Rendering a component directly from `@lucide/svelte` | Use `Icon` from `texuli/icons` for its ten built-in names. For every other glyph, import the glyph from `@lucide/svelte` and render it through `LucideIcon` from `texuli/icons/lucide`, e.g. `<LucideIcon icon={Activity} />`. Lucide is only the glyph source. |
| `py-token` | Reading legacy `--py-*` styling tokens in authored UI | Use Texuli's `--tx-*` theme tokens. Only renderer-owned geometry (`--py-fixed-right-edge`, `--py-side-panel-width`, `--py-safe-*`, `--py-device-radius`, `--py-app-height`) remains under `--py-*`; deck-stage properties use `--tx-deck-*`. |
| `raw-control` | Native interactive controls in Svelte markup | Use the matching Texuli or public `@protoyard/ui` control. |
| `input-as-choice` | Using `Input` with `type="checkbox"` or `type="radio"` | Use `Checkbox` or `RadioGroup`/`RadioGroupItem`. Texuli `Input` binds its `value`; it is not a choice control. |
| `own-component` | A leaf UI component that draws a generic control without using Texuli or Protoyard UI | Compose Texuli, or use a documented Protoyard exception where the behavior is product-specific. |
| `component-bind-this` | Capturing a Texuli/Protoyard UI component with `bind:this` and then using it as a DOM element | Use `bind:ref` when the component exposes a DOM ref. If it does not, keep a minimal adapter and report the missing ref as a gap. `bind:this` remains valid for component APIs, not DOM operations. |
| `local-motion` | An import from `svelte/transition` or `svelte/animate`, or an `@keyframes` rule, in a UI package (`ui`, `*-ui`, `devtools`, `crud`, `player`, `renderer-svelte`), the gallery, a template or a prototype | Use Texuli motion: the `motion` prop or `MotionProvider` from `texuli/motion`, the `@texuli/core/motion` texels, and the `--tx-motion-*` tokens. They honor reduced motion by construction. |
| `ref-undefined` | `bind:ref={x}` where `x` does not start as `null` (for example `$state<HTMLElement \| null>()` or a declaration with no initializer). Svelte throws at runtime on `bind:ref={undefined}` against a `ref` with a fallback, which stops the whole island | Start refs as `$state<HTMLElement \| null>(null)`, `$state(null)` or `= null`. The check reads the initializer, not the type. |

### Exceptions and the gap loop

`tests/adoption/texuli-exceptions.json` is the reviewed exception list. It
covers Protoyard-owned behavior such as device/browser chrome, shell and frame
geometry, the player’s explanatory surface, and product-specific extension
points. Each entry has a reason. Add an exception only for a real Protoyard
responsibility; generic UI belongs to Texuli.

When a Texuli API cannot support a needed behavior, keep the smallest adapter
that preserves the public Protoyard API. Record the affected path in
`tests/adoption/pending/<unit>.json` with `"gap": "G<n>"`, and report the
gap with its package, API, minimal reproduction, and expected behavior to the
Texuli maintainers. Track the authoritative open and fixed gaps in
[`tests/adoption/texuli-gaps.json`](../tests/adoption/texuli-gaps.json). Once a
maintainer releases the fix, adopt it, remove the adapter and pending entry,
and verify with the strict adoption check. Never copy or patch Texuli source
inside Protoyard.

The checker supports a normal ratchet run, `--scope <path> --strict`,
`--allow-gaps` with strict mode, and `--prune` to remove fixed pending entries.
The ratchet also fails on a stale pending entry (its recorded count is above
today's, or the violation is gone) until `--prune` tightens it, so a fixed file
cannot regress silently up to its old count. In `.svelte` files, markup drops
only `<!-- -->` comments; JS and CSS comments are stripped only inside
`<script>` and `<style>`.
It scans source under `packages/`, `apps/`, `templates/`, and `prototypes/`;
tests and build output are excluded.

## Themes come from `@texuli/tokens`

`@protoyard/themes` builds and adapts Protoyard's appearance model using
`@texuli/tokens`. The 64-theme catalog and opt-in 204-theme library remain
Protoyard's product surface. Theme writers now emit only Texuli's `--tx-*`
variables. The deprecated `--py-*` theme aliases are removed; renderer-owned
geometry remains under `--py-*`, while deck-stage properties use `--tx-deck-*`. Import token
subpaths such as `@texuli/tokens/css` and `@texuli/tokens/contract`; do not
statically import the root barrel, which includes the theme library.

## Decks run on `@texuli/deck` and `@texuli/slides`

`@protoyard/decks` is a thin layer over `@texuli/deck` (the deck model,
validation, catalog, steps, navigation, controls, presenter protocol, lint,
patches and text twins), and `@protoyard/decks-ui`'s `DeckApp` presents decks
on the `@texuli/slides` stage. Protoyard keeps its deck shape, offline media
policy, themes, free slides through `@protoyard/blocks-ui`, custom slides, the
debug panel and Deck Studio. Details and the migration note:
[DECKS](DECKS.md#built-on-texuli-migration-note).

## Charts from `@texuli/charts`

`@protoyard/charts` re-exports Texuli chart math and adapts palette tokens.
`@protoyard/charts-ui` exposes lazy chart-family subpaths backed by Texuli,
with thin adapters for Protoyard data shapes and callbacks. Analytics and
block UI consume the same chart families through their public package
subpaths. Protoyard retains analytics models, deterministic data generation,
and its dashboard-specific composition.

## Content blocks from `@texuli/blocks`

`@protoyard/blocks` uses Texuli for tokenization, diagram layout, limits,
safety, and formula operations while owning Protoyard schemas, catalog,
interactive host, and product extensions. `@protoyard/blocks-ui` renders
Texuli block families through lazy public subpaths and thin shape adapters;
Protoyard-specific block types remain extensions. `@protoyard/pages-ui` uses
the same block rendering surface for pages and documents.

## Generic styled components come from `texuli`

`@protoyard/ui` exposes the stable Protoyard UI API while re-exporting or
composing Texuli's styled components and primitives. Use its public exports in
prototypes; do not import its source paths. Direct Texuli imports belong in
package adapters or when a needed component is not available from the
Protoyard public API. The UI package also owns Protoyard-specific shells,
device frames, navigation contracts, overlays, and scenario controls.

`@texuli/primitives` underpins the remaining wrappers in the dialog, floating,
and simple-control families. `@protoyard/ui` preserves its props and the
overlay stack, device containment, and undo behavior. This is a compatibility
layer, not a reason to create new generic controls.

### Follow-ups: components that stay Protoyard wrappers

Some public Protoyard components remain thin adapters because their stable
props or host behavior differ from Texuli's APIs. The current exception list
and adoption pending files identify these paths and any blocking gap. In
particular, keep Protoyard service callbacks, overlay ownership, layout
contracts, and API compatibility in their existing package boundaries.
New components should start from Texuli; add a wrapper only when it translates
a real Protoyard contract or works around a tracked gap.

## Layouts come from `texuli/layouts`

`@protoyard/ui`'s `LayoutHost` wraps Texuli's layout host and registers the
Texuli app, mobile, and auth/settings layouts alongside Protoyard-specific
dashboard-grid and marketing entries. Protoyard retains its layout catalog,
the docs layout contract, device frames, and host markers. `@protoyard/crud`,
DevTools, pages, decks, and prototypes consume layouts through public
`@protoyard/ui` exports.

## UI package migration

Every UI package now uses Texuli as its component foundation. Its own domain
behavior and host contracts remain Protoyard-owned:

| Package | Texuli role today | Protoyard-owned surface |
| --- | --- | --- |
| `ui` | Styled components and primitives, navigation, choice, field, input, feedback, and layout exports | Shells, device frames, overlays, scenario and honesty controls, stable public API |
| `devtools` | Texuli components and tokens for the control center | Prototype runtime controls, inspectors, theme studio workflows |
| `crud` | Texuli UI and lazy layout/screen composition | Blueprint CRUD behavior and screen registry |
| `charts-ui` | Texuli chart families through lazy adapters | Protoyard prop/data compatibility |
| `analytics-ui` | Texuli KPI, date, filter and chart components | Analytics dashboard composition and Protoyard engine integration |
| `views-ui` | Texuli rich-view renderers and primitives | Service callbacks, view host APIs, and extensions where Texuli gaps remain |
| `blocks-ui` | Texuli block-family renderers | Protoyard-only block renderers and extensions |
| `decks-ui` | Texuli controls and styled UI | Deck authoring, presenter, print, and prototype-specific behavior |
| `pages-ui` | Texuli controls and block renderers | Page/doc hosts, forms, response UX, and print behavior |
| `saas-ui` | Texuli controls and styled components | Simulated SaaS screen flows and route guards |
| `ai-ui` | Texuli chat components and styled UI | Assistant state, safe rich answers, tool orchestration and widget modes |
| `flows-ui` | Texuli workflow editor and run-panel components | Protoyard workflow contract and deterministic simulation |
| `review-ui` | Texuli controls and styled UI | Review thread, anchor, and mount integration |
| `gamification-ui` | Texuli controls and styled UI | Protoyard points, badge, mission, and streak presentation |
| gallery | Texuli Astro integration and tokens | Protoyard gallery and marketplace experience |
| `player` | Texuli styles and controls in the prebuilt blueprint player | Blueprint-kind routing and no-install player behavior |
| `renderer-svelte` | Texuli appearance integration at the prototype host boundary | Vite setup, shell routing, and runtime bindings |

The non-UI packages `themes`, `charts`, `views`, and `blocks` use the
corresponding Texuli token, math, data, or block APIs.

## The dev server

Texuli is installed in `node_modules`, so `@protoyard/renderer-svelte` does
not need to expose a linked Texuli source tree through Vite's `/@fs` allowlist.
The dev server helper remains for consumers that link local packages.

## Using a Texuli package

Import only documented package exports. For example:

```svelte
<script lang="ts">
  import { Button } from '@protoyard/ui';
</script>

<Button>Save</Button>
```

When a package adapter needs a Texuli API directly, use its exported
subpath—for example `texuli/button`, `texuli/icons`, or
`@texuli/data/board/engine`—rather than a deep `src/` path. The package
manifest's `exports` map is the API boundary.

## Verified

The public-docs, adoption, package, component and runtime tests are the source
of truth for current behavior. Useful checks include:

| Command | What it proves |
| --- | --- |
| `pnpm exec tsx scripts/check-texuli-adoption.ts` | The nine adoption rules and pending/gap ratchet |
| `pnpm exec tsx scripts/check-texuli-latest.ts [--registry]` | Exact, consistent Texuli pins from npm; with `--registry`, equal to npm `latest` |
| `pnpm vitest run tests/adoption` | Rule matching, strict mode, gap allowances, exception records and pending cleanup |
| `pnpm vitest run packages/ui` | The shared Texuli-backed component API and Protoyard wrapper contracts |
| `pnpm check:packages --filter @protoyard/ui` | The packed public component exports and declarations |

## Limits

Texuli gaps are release-dependent; check the gap tracker before choosing an
adapter or claiming support. Protoyard verifies its use against the published
package declarations and runtime. It does not replace Texuli's own package
tests or claim that simulated prototype behavior is a real backend.

## Views from `@texuli/data`

### Engines (`@protoyard/views`)

Board, calendar, timeline, grid, tree, map, activity, and files use the
corresponding `@texuli/data` engine exports. Protoyard retains extension
engines such as editor, notifications, settings, states, commands, and
scenarios where they express Protoyard-specific contracts or tracked gaps.

### UI (`@protoyard/views-ui`)

Each rich view is a thin host adapter over Texuli's matching public view
export, with liveQuery and service callbacks where the Protoyard runtime API
differs. The grid filter/saved-view toolkit, tree outline editor, map routes
and fences, and other host-only behavior remain Protoyard extensions while
the relevant APIs are gaps. Consult `tests/adoption/texuli-gaps.json` and the
package pending list for current gap ids and affected files.
