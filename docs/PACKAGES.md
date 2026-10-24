# Packages

Protoyard is a pnpm workspace of small packages. Install only the pieces an app uses: the engine packages hold data and runtime behavior, while Svelte packages render it. The repository uses source exports for local development. Engine and Svelte package tarballs map their public exports to generated `dist/` output; wrapper and content packages ship their own emitted files. Do not import a sibling package's `src/` path. The package graph and workspace architecture are described in [ARCHITECTURE.md](ARCHITECTURE.md).

## Release status and installation

The package manifests and tarball tooling are being prepared for the first npm release. **Protoyard packages are not yet available from the public npm registry.** The release workflow has an npm job (Trusted Publishing with provenance; see [PUBLISHING](PUBLISHING.md#releasing-the-packages-to-npm)), but no release has been published to npm yet: the first live publish awaits the developer's approval. The npm commands below are the supported consumer commands once that release is available; they do not install today's unpublished workspace packages.

For repository development, clone the source and install its workspace dependencies.
Protoyard links its component library, [Texuli](TEXULI.md), from a sibling checkout: the
Texuli repository must sit next to Protoyard (`../texuli`) and be installed first
([how it is linked](TEXULI.md#how-it-is-linked)).

```sh
git clone https://github.com/DailybotHQ/protoyard.git
cd protoyard
pnpm install
pnpm protoyard doctor
pnpm protoyard dev crm-demo
```

**Texuli blocks the npm release today.** Eight packages (`@protoyard/themes`, `devtools`,
`charts`, `charts-ui`, `views`, `views-ui`, `blocks` and `blocks-ui`) declare their Texuli
dependencies as `link:` specifiers, and `pnpm check:packages` refuses a packed manifest that
carries one (`LOCAL_DEPENDENCY`). `@protoyard/ui` imports Texuli without declaring it. The
release needs Texuli on npm and these dependencies declared as registry versions
([ADR-044](DECISIONS.md)).

After the npm release, scaffold a workspace with either supported package manager:

```sh
npm create protoyard acme-lab
cd acme-lab
pnpm protoyard dev starter
```

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

`protoyard new` runs inside an existing Protoyard workspace. For a fresh workspace, use `create-protoyard` as above. Until the first npm release, the repository's current local scaffolder command is:

```sh
node packages/create-protoyard/bin/create-protoyard.mjs ../acme-lab --no-install --no-git
```

That local command can create the workspace files, but its pinned Protoyard npm dependencies cannot be installed until those packages have been released. See [QUICKSTART.md](QUICKSTART.md#a-workspace-of-your-own-create-protoyard) for the full first-run workflow.

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
| `@protoyard/crud` | Blueprint CRUD app and lazy screens | `.`, `./registry-meta`, `./app`, `./screens/list`, `./screens/form`, `./screens/settings`, `./screens/calendar`, `./screens/map`, `./screens/board`, `./screens/dashboard`, `./screens/analytics`, `./screens/timeline`, `./styles.css` |
| `@protoyard/charts-ui` | Lazy Svelte chart families | `.`, `./cartesian`, `./part-whole`, `./matrix`, `./compact`, `./canvas`, `./geo`, `./styles.css` |
| `@protoyard/analytics-ui` | Lazy analytics views | `.`, `./date-range`, `./filters`, `./cohort`, `./funnel`, `./grid`, `./drill`, `./styles.css` |
| `@protoyard/views-ui` | Lazy rich-view components | `./board`, `./calendar`, `./timeline`, `./grid`, `./tree`, `./map`, `./editor`, `./activity`, `./notifications`, `./files`, `./settings`, `./states`, `./commands`, `./scenarios`, `./styles.css` |
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
| `protoyard` | Short-name CLI wrapper; install it to get the `protoyard` command | `.` |
| `@protoyard/cli` | CLI implementation and executable | `.` |
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

- `required-file`: every path in `protoyard.pack.required` is in the tarball. The player requires `dist/app/index.html`, its assets manifest and `dist/embed/index.js`.
- `case-collision`: no two source files emit outputs that differ only by letter case. On macOS and Windows one would overwrite the other, at build time and on install.
- `svelte-declaration`: no emitted `X.svelte.d.ts` imports a binding named `X`. That shadows the component's own declaration, so consumers would see a type instead of a component. Alias the import, or use another name for a recursive self-import.

#### attw and Svelte components

The report names one attw exception, `svelte-component-declaration`, and counts the problems it drops per package. It is the only exception:

- **What it drops.** `svelte-package` emits `X.svelte.d.ts` beside each `X.svelte`. Bundler resolution, Vite and svelte-check read that file. TypeScript's `node16` mode looks only for `X.d.svelte.ts`, so attw reports an `InternalResolutionError` for every `./X.svelte` import in a declaration.
- **When.** The exception drops that problem only under `node16`, and only when both the component and its `.svelte.d.ts` are in the tarball.
- **What still fails.** A missing declaration still fails, because attw then also reports it under `bundler` and `node10`. Every other attw problem fails the check.

Package publication checks inspect packed manifests and tarballs. The first npm release is still gated; read [PUBLISHING.md](PUBLISHING.md) and [DECISIONS.md](DECISIONS.md#adr-028--packages-publish-dist-through-publishconfig-the-repository-keeps-source-exports) for the current release contract and status.

## Related guides

- [Quickstart](QUICKSTART.md) — install and run from this repository, then create a workspace.
- [Architecture](ARCHITECTURE.md) — package graph and source-first workspace behavior.
- [Generator](GENERATOR.md) — blueprints, generation and regeneration.
- [Player](PLAYER.md) — hosted no-install exploration and embed protocol.
- [Publishing](PUBLISHING.md) — prototype build, export and site deployment.
