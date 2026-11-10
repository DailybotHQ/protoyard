# Packages

Protoyard is a pnpm workspace of small packages. Install only the pieces an app uses: the engine packages hold data and runtime behavior, while Svelte packages render it. The repository uses source exports for local development. Engine and Svelte package tarballs map their public exports to generated `dist/` output; wrapper and content packages ship their own emitted files. Do not import a sibling package's `src/` path. The package graph and workspace architecture are described in [ARCHITECTURE.md](ARCHITECTURE.md).

## Release status and installation

Every public package is on the npm registry at the same lockstep version (see [PUBLISHING](PUBLISHING.md#releasing-the-packages-to-npm) for the current one). CI publishes them from `main` with npm Trusted Publishing and provenance; no package accepts a token publish.

For repository development, clone the source and install its workspace dependencies.
Protoyard installs its component library, [Texuli](TEXULI.md), from npm with the rest of
its dependencies ([how it is linked](TEXULI.md#how-it-is-linked)).

```sh
git clone https://github.com/DailybotHQ/protoyard.git
cd protoyard
pnpm install
pnpm protoyard doctor
pnpm protoyard dev crm-demo
```

Protoyard consumes the published Texuli packages from npm at one exact
version ([TEXULI](TEXULI.md) names it). The table shows direct workspace dependencies
(including peer dependencies); transitive dependencies are omitted. Every
template and prototype app also declares `texuli` at that version for its Svelte UI. The
root pins the complete Texuli family used by current and optional surfaces.

| Protoyard package | Direct Texuli dependencies |
| --- | --- |
| `@protoyard/ai-ui` | `@texuli/chat`, `texuli` |
| `@protoyard/analytics-ui` | `@texuli/charts`, `@texuli/data`, `@texuli/date`, `texuli` |
| `@protoyard/blocks-ui` | `@texuli/blocks`, `@texuli/charts`, `@texuli/data`, `@texuli/editor`, `texuli` |
| `@protoyard/blocks` | `@texuli/blocks` |
| `@protoyard/charts-ui` | `@texuli/charts`, `texuli` |
| `@protoyard/charts` | `@texuli/charts`, `@texuli/tokens` |
| `@protoyard/crud` | `@texuli/canvas`, `@texuli/forms`, `@texuli/sheets`, `texuli` |
| `@protoyard/decks-ui` | `@texuli/deck`, `@texuli/slides`, `texuli` |
| `@protoyard/decks` | `@texuli/deck` |
| `@protoyard/devtools` | `@texuli/primitives`, `texuli` |
| `@protoyard/flows-ui` | `@texuli/workflows`, `texuli` |
| `@protoyard/gamification-ui` | `texuli` |
| `@protoyard/pages-ui` | `@texuli/blocks`, `@texuli/document`, `@texuli/forms`, `@texuli/pages`, `texuli` |
| `@protoyard/pages` | `@texuli/document` |
| `@protoyard/player` | `texuli` |
| `@protoyard/renderer-svelte` | `texuli` |
| `@protoyard/review-ui` | `texuli` |
| `@protoyard/saas-ui` | `@texuli/forms`, `texuli` |
| `@protoyard/themes` | `@texuli/tokens` |
| `@protoyard/ui` | `@texuli/chat`, `@texuli/core`, `@texuli/data`, `@texuli/date`, `@texuli/primitives`, `texuli` |
| `@protoyard/views-ui` | `@texuli/canvas`, `@texuli/data`, `@texuli/drag`, `@texuli/editor`, `@texuli/primitives`, `@texuli/sheets`, `texuli` |
| `@protoyard/views` | `@texuli/data` |
| `@protoyard/gallery` | `@texuli/astro`, `@texuli/tokens`, `texuli` |

The workspace's `pnpm-workspace.yaml` release-age policy allows the Texuli
maintainer's packages to be adopted when released. No Texuli dependency uses
a local checkout, `link:`, or `file:` specifier.

Scaffold a workspace with either supported package manager:

```sh
npm create protoyard acme-lab
cd acme-lab
pnpm protoyard dev starter
```

The generated root `package.json` marks this as a consumer workspace. When the
installed CLI creates, generates, promotes or remixes a prototype there, it
uses the installed lockstep Protoyard version for `protoyard`, `create-protoyard`
and `@protoyard/*` dependencies. Other local workspace dependencies remain
unchanged. Repository development continues to use `workspace:` ranges.

Consumer workspaces can add local starter templates in `protoyard.workspace.json`:

```json
{ "templates": ["templates/*"] }
```

Patterns are relative to the workspace root. Matching local templates stay
inside the workspace, cannot be symlinks, and take precedence over a published
template with the same name. `list --kind template` shows whether each entry
comes from the workspace or `@protoyard/templates`. The published templates
package also carries the app, deck, page and doc blueprint catalog, so
`list --kind blueprint` and `generate --blueprint <id>` work after installing
Protoyard from npm. `validate --all [--build]` checks every prototype in the
workspace.

Or use pnpm throughout:

```sh
pnpm create protoyard acme-lab
cd acme-lab
pnpm protoyard dev starter
```

For an existing app, install the CLI and invoke it with `npx` or pnpm's `exec`:

```sh
npm install --save-dev protoyard
npx protoyard new my-prototype --template blank
npx protoyard dev my-prototype
```

```sh
pnpm add --save-dev protoyard
pnpm exec protoyard new my-prototype --template blank
pnpm exec protoyard dev my-prototype
```

To build a custom Svelte prototype app from the libraries instead of using the CLI scaffold, install the engine and renderer packages it uses:

```sh
pnpm add @protoyard/blueprint @protoyard/crud @protoyard/renderer-svelte @protoyard/ui svelte
```

The equivalent npm command is:

```sh
npm install @protoyard/blueprint @protoyard/crud @protoyard/renderer-svelte @protoyard/ui svelte
```

`protoyard new` runs inside an existing Protoyard workspace. For a fresh workspace, use `npm create protoyard <dir>` as above. To scaffold from an unreleased checkout, run the local scaffolder:

```sh
node packages/create-protoyard/bin/create-protoyard.mjs ../acme-lab --no-install --no-git
```

It pins the checkout's version, so its npm dependencies install only once that version is released. See [QUICKSTART.md](QUICKSTART.md#a-workspace-of-your-own-create-protoyard) for the full first-run workflow.

Protoyard requires Node.js 24.20 or later. pnpm is first-class; npm is supported for scaffolded workspaces and package installs. Bun is not tested. Svelte UI packages require Svelte 5.57 or later as a peer dependency.

## Package families and exports

Imports must use the package name and one of its declared export paths. `.` is the package root. The export lists below match the package manifests; optional kits and their UI components stay on explicit subpaths so they can remain lazy.

### Core and framework-independent packages

| Package | Role | Export paths |
| --- | --- | --- |
| `@protoyard/core` | Contracts, schemas and shared runtime types | `.`, `./manifest`, `./review` |
| `@protoyard/database` | IndexedDB persistence, migrations and snapshots | `.` |
| `@protoyard/scenarios` | Deterministic scenario and generator helpers | `.`, `./presets` |
| `@protoyard/runtime` | Composes the prototype runtime | `.` |
| `@protoyard/themes` | Theme engine, presets, lazy library, CSS and fonts | `.`, `./presets`, `./no-flash`, `./library`, `./base.css`, `./fonts.css` |
| `@protoyard/blueprint` | Blueprint validation, derivation, generation and imports | `.`, `./csv`, `./computed`, `./workflows`, `./generator`, `./search`, `./import/csv-shape`, `./import/json-shape`, `./import/sqlite-schema`, `./schema.json` |
| `@protoyard/analytics` | Analytics models, generators, funnels and cohorts | `.`, `./generators`, `./funnel`, `./cohort` |
| `@protoyard/charts` | Framework-independent chart calculations | `.`, `./scales`, `./shapes`, `./downsample`, `./layout`, `./palette`, `./palette/derive` |
| `@protoyard/views` | Framework-independent rich-view engines | `.`, `./board`, `./calendar`, `./timeline`, `./grid`, `./tree`, `./map`, `./editor`, `./activity`, `./notifications`, `./files`, `./settings`, `./states`, `./commands`, `./scenarios` |
| `@protoyard/saas` | Simulated SaaS data and behavior for prototype UX | `.` |
| `@protoyard/ai` | Simulated AI conversations, agents and response packs | `.`, `./markdown`, `./packs`, `./scenarios`, `./voice`, `./chart` |
| `@protoyard/review` | Review anchors, adapters, handlers and reports | `./anchors`, `./store`, `./adapters/local`, `./adapters/http`, `./adapters/artifact`, `./adapters/artifact-shell`, `./server`, `./report` |
| `@protoyard/avatars` | Fictional portrait data and image assets | `.`, `./manifest.json`, `./assets/*` |
| `@protoyard/http` | Optional fetch-compatible mock API; no server | `.` |
| `@protoyard/offline` | Optional build-time offline support | `.` |

### Svelte renderer and optional UI kits

| Package | Role | Export paths |
| --- | --- | --- |
| `@protoyard/renderer-svelte` | Svelte/Vite renderer and runtime bindings | `.`, `./vite`, `./avatars-plugin`, `./app.css`, `./env` |
| `@protoyard/ui` | Shared primitives, layouts and style sheet | `.`, `./styles.css` |
| `@protoyard/devtools` | In-browser control panel | `.`, `./styles.css` |
| `@protoyard/crud` | Blueprint CRUD app and lazy screens | `.`, `./registry-meta`, `./app`, `./screens/list`, `./screens/form`, `./screens/settings`, `./screens/calendar`, `./screens/map`, `./screens/board`, `./screens/dashboard`, `./screens/analytics`, `./screens/timeline`, `./screens/sheet`, `./screens/canvas`, `./styles.css` |
| `@protoyard/charts-ui` | Lazy Svelte chart families | `.`, `./cartesian`, `./part-whole`, `./matrix`, `./compact`, `./canvas`, `./geo`, `./styles.css` |
| `@protoyard/analytics-ui` | Lazy analytics views | `.`, `./date-range`, `./filters`, `./cohort`, `./funnel`, `./grid`, `./drill`, `./styles.css` |
| `@protoyard/views-ui` | Lazy rich-view components | `./board`, `./calendar`, `./timeline`, `./grid`, `./tree`, `./map`, `./editor`, `./sheet`, `./canvas`, `./activity`, `./notifications`, `./files`, `./settings`, `./states`, `./commands`, `./scenarios`, `./virtual-list`, `./styles.css`, `./blocks.css`, `./player.css` |
| `@protoyard/saas-ui` | Simulated SaaS screens | `.`, `./styles.css` |
| `@protoyard/ai-ui` | Assistant and widget components | `.`, `./voice`, `./widget`, `./styles.css` |
| `@protoyard/review-ui` | Lazy review UI and mount entry | `./overlay`, `./thread`, `./panel`, `./toolbar`, `./mount`, `./styles.css` |

### Content kinds: decks, pages, docs and blocks

| Package | Role | Export paths |
| --- | --- | --- |
| `@protoyard/blocks` | Content block engine: schemas, limits, untrusted-input guard, formula AST, catalog (no Svelte) | `.`, `./formula`, `./interactive`, `./code`, `./diagram`, `./catalog`, `./schema`, `./safety` |
| `@protoyard/blocks-ui` | Svelte block renderers, one lazy subpath per family | `.`, `./text`, `./media`, `./data`, `./structure`, `./code`, `./diagram`, `./interactive`, `./map`, `./embed`, `./styles.css` |
| `@protoyard/decks` | Slide deck engine: schema, 21-layout catalog, navigation, steps, controls registry, style, quality checks (no Svelte) | `.`, `./schema`, `./layouts`, `./style`, `./quality`, `./text`, `./presenter`, `./patch`, `./agent` |
| `@protoyard/decks-ui` | `DeckApp` with the registry-driven toolbar, presenter, overview, print, Deck Studio and the Debug for agents panel | `.`, `./app`, `./layouts`, `./studio`, `./presenter`, `./print`, `./debug`, `./styles.css`, `./player.css` |
| `@protoyard/pages` | Page and doc engine: schemas, limits, TOC helpers, form-response services (no Svelte) | `.`, `./fixtures` |
| `@protoyard/pages-ui` | `PageApp` and `DocApp` hosts, forms and responses UI, print CSS | `.`, `./block-host`, `./page`, `./doc`, `./form`, `./print`, `./styles.css` |

Two deck subpaths serve coding agents:

- `@protoyard/decks/agent` ("Debug for agents") describes the slide on screen for an agent and reads a pasted reference back: `describeSlideForAgent`, `formatAgentReference` (a one-line `[slide-ref]`, a Markdown prompt or JSON), `parseAgentReference` and `safeAgentSource`, which keeps a reference's source only when it is a plain relative `.json` path, a prototype slug or a share id. It is pure TypeScript, kept off the deck entry so the lint rules never load with a deck. `protoyard deck inspect --ref` uses it ([DEVELOPMENT_COMMANDS](DEVELOPMENT_COMMANDS.md)).
- `@protoyard/decks-ui/debug` holds the panel (`DeckDebugPanel`, `BlockOutline`) with `deckDebugAvailable`, `debugQueryOn`, `isDevBuild`, `inertJson`, `deckFileName` and `downloadText`. `DeckApp` loads it on its own lazy chunk only when the panel opens (`debug` prop: `auto`, `on` or `off`; `debugSource` names the source file).

`@protoyard/decks/text` also exports the shared untrusted-text helpers `isInvisibleCodePoint`, `inertJson`, `isSafeDeckPath`, `isSafeShareId` and `SAFE_SLUG`. The root of `@protoyard/decks` exports the `DECK_CONTROLS` registry (with `deckControlFor`, `availableDeckControls` and `deckKeyBindings`), which the toolbar, the help dialog and `protoyard deck capabilities` all read. See [DECKS.md](DECKS.md) for how they are used.

For example, import a specific chart family or view only where it is used:

```ts
import { BarChart } from '@protoyard/charts-ui/cartesian';
import { Board } from '@protoyard/views-ui/board';
import '@protoyard/ui/styles.css';
```

These examples describe the npm package interface after release. In this repository, the same package names resolve to source through workspace links. The export maps, rather than deep filesystem paths, are the interface in both environments.

### CLI, player and site packages

| Package | Role and installation path | Export paths |
| --- | --- | --- |
| `protoyard` | Short-name CLI wrapper; install it to get the `protoyard` command | `.`, `./capture` (deterministic PNG capture of a running prototype: `capture`, `withReadyPage`, `launchChromium`), `./static-server` (`serveStatic`, the `preview` server, for e2e tests) |
| `@protoyard/cli` | CLI implementation and executable | `.`, `./capture`, `./static-server`, `./adoption` (`scanSource`, `checkAdoption`, `RULES`: the Texuli adoption rules as an API) |
| `create-protoyard` | Workspace scaffolder, invoked with `npm create protoyard` or `pnpm create protoyard` | `.` |
| `@protoyard/player` | Prebuilt player app package; its npm API is only for embedding a framed player client | `./embed` |
| `@protoyard/gallery` | Static gallery site package, not an app SDK | No module exports |
| `@protoyard/templates` | Aggregate template package used by CLI scaffolding: every git-tracked file of each template | `.` |

Template packaging tests discover the repository inventory from template folders with a
`protoyard.json` manifest, then verify that prepack copying and the real tarball include every
discovered template. Adding a template therefore does not require updating a count in the test.

The public `/play/` site runs a blueprint without installing Protoyard into a host repository. The player accepts a blueprint at runtime and does not generate project source. To embed the hosted player in another page, use `connectPlayer` from `@protoyard/player/embed`; configure the exact player origin and allowed embedder origin as described in [PLAYER.md](PLAYER.md).

A generated prototype is a separate Vite + Svelte project under `prototypes/<slug>/`. `protoyard generate` writes managed source from `blueprint.json`; developers can own additional code and build or export the result independently. This is the right path when the result needs its own codebase, dependencies or deployment. The hosted player is the no-install path for exploring a blueprint. The shared blueprint model keeps generated prototypes and the player aligned; see [GENERATOR.md](GENERATOR.md#running-a-blueprint-without-generating).

## Versions and packed output

The published `@protoyard/*` packages, `protoyard` and `create-protoyard` use one fixed Changesets version group. Install matching releases together; do not mix versions. At the time of writing, manifests use `1.0.0`; this is not evidence that a release is already on npm.

Workspace development stays source-first and does not require building packages. Release tarballs point at emitted `dist/` JavaScript, declarations, styles and Svelte components. Maintainers can build the two package groups with:

```sh
pnpm build:packages --filter engine
pnpm build:packages --filter svelte
```

`pnpm build:packages` also runs a package's `protoyard.build.postBuild` script after compiling it. The player uses it to build its prebuilt app into `dist/app/`.

### Package checks

`pnpm check:packages --require-all` packs every publishable package and checks the real tarball. It needs `pnpm build:packages` first. Every public package must pass; a package without `publishConfig` fails as `pending`.

On top of publint, arethetypeswrong (`esm-only`) and the file and hygiene rules, it enforces:

- `release-notes`: `CHANGELOG.md` and `README.md` are in the tarball. npm adds the README and LICENSE on its own, never the changelog, so every package lists `CHANGELOG.md` in `files`.
- `required-file`: every path in `protoyard.pack.required` is in the tarball. The player requires `dist/app/index.html`, its assets manifest and `dist/embed/index.js`.
- `case-collision`: no two source files emit outputs that differ only by letter case. On macOS and Windows one would overwrite the other, at build time and on install.
- `svelte-declaration`: no emitted `X.svelte.d.ts` imports a binding named `X`. That shadows the component's own declaration, so consumers would see a type instead of a component. Alias the import, or use another name for a recursive self-import.

#### attw and Svelte components

The report names one attw exception, `svelte-component-declaration`, and counts the problems it drops per package. It is the only exception:

- **What it drops.** `svelte-package` emits `X.svelte.d.ts` beside each `X.svelte`. Bundler resolution, Vite and svelte-check read that file. TypeScript's `node16` mode looks only for `X.d.svelte.ts`, so attw reports an `InternalResolutionError` for every `./X.svelte` import in a declaration.
- **When.** The exception drops that problem only under `node16`, and only when both the component and its `.svelte.d.ts` are in the tarball.
- **What still fails.** A missing declaration still fails, because attw then also reports it under `bundler` and `node10`. Every other attw problem fails the check.

Package publication checks inspect packed manifests and tarballs. Releases are published by CI (`release.yml`, Trusted Publishing with provenance); read [PUBLISHING.md](PUBLISHING.md) and [DECISIONS.md](DECISIONS.md#adr-028--packages-publish-dist-through-publishconfig-the-repository-keeps-source-exports) for the current release contract and status.

## Related guides

- [Quickstart](QUICKSTART.md) — install and run from this repository, then create a workspace.
- [Architecture](ARCHITECTURE.md) — package graph and source-first workspace behavior.
- [Generator](GENERATOR.md) — blueprints, generation and regeneration.
- [Player](PLAYER.md) — hosted no-install exploration and embed protocol.
- [Publishing](PUBLISHING.md) — prototype build, export and site deployment.
