# Design systems

A design system is a first-class entity in a Protoyard workspace
([ADR-047](DECISIONS.md#adr-047--design-systems-are-first-class-workspace-entities)):
a folder with a Texuli design-system document (its `allow` section, its
library and its approval inside), its own components and the requests for new
ones. A workspace can hold many. Each
prototype names the one it uses, and a **locked** prototype can only draw its
UI with that design system.

This guide covers the whole loop, every file and its schema, and the limits.
How a document compiles and paints, and the full `check ds` rules, are in
[THEMES](THEMES.md#design-systems).

## The loop

| Step | How | Status |
| --- | --- | --- |
| 1. Create | `pnpm protoyard ds new <id>` from a few inputs, a theme, or your brand: a tokens file, a stylesheet, an SVG logo or a brief | Works |
| 2. Review in a kit | `pnpm protoyard ds kit <id>`, then open `prototypes/<id>-kit` and review every component | Works |
| 3. Approve | A designer runs `ds approve <id> --by <name> [--release <semver>]` and commits the document (and its release) for review | Works |
| 4. Create locked prototypes | `pnpm protoyard ds use <slug> <id> --lock` | Works |
| 5. Request components | `ds component request`, `approve-request`, `new` | Works |
| 6. Upgrade | Approve a new version, then `ds use <slug> <id> --upgrade` | Works |
| 7. Release and compare | `ds release <id>`, `ds versions <id>`, `ds diff <id> [<from>] [<to>]` | Works |

### 1. Create

```bash
pnpm protoyard ds new harbor --name Harbor --brand '#0f766e' --font Inter --shape rounded --density compact
pnpm protoyard ds validate harbor
```

`ds new` writes the folder `design-systems/harbor/`: `document.json` with an
`allow` section and a draft `approval`, and an empty component library
(`components.json`). `ds validate` checks the document as untrusted input,
checks its `allow` section and library against the Texuli catalog, compiles
it, reports contrast per mode, the `contentHash`, the approval status, whether
it can be locked, and any drift between `components.json` and
`components/*.svelte`. Every way to create one (`--brief`, `--from-theme`,
`--from-theme-file`) is in [THEMES](THEMES.md#design-systems). A flat
`design-systems/<id>.json` from before the folder layout becomes a folder with
`pnpm protoyard ds migrate <id>`.

### Create from your brand

`ds new` can start from what a company already has. Each source runs Texuli
0.16.0's design-system generator (`generateDesignSystem`, from
`@texuli/tokens/design-system/generate`) offline. The generator imports the
source, keeps its type, shape, space and motion values, then repairs the
result until it meets Texuli's AA guarantees.

```bash
pnpm protoyard ds new acme --from-tokens brand/tokens.json      # W3C DTCG or Tokens Studio JSON
pnpm protoyard ds new acme --from-css brand/site.css            # a site stylesheet's tokens
pnpm protoyard ds new acme --from-logo brand/logo.svg           # the palette from an SVG logo
pnpm protoyard ds new acme --brief "Calm banking for nurses. Deep teal #0f766e brand, Inter font, rounded."
pnpm protoyard ds new acme --brief brand/brief.md               # a .txt or .md file
echo "brand #0f766e, font Inter, compact" | pnpm protoyard ds new acme --brief -
```

| Source | What Texuli reads |
| --- | --- |
| `--from-tokens <file>` | A W3C DTCG file (Texuli's `importDtcg`) or a Tokens Studio file (`importTokensStudio`); the generator picks by shape (`$metadata`, or a root `global`, `light` or `dark` set, means Tokens Studio) and tries the other format if the first refuses. Texuli's own layout round-trips. Foreign tokens are mapped by name: semantic roles under a `light` or `dark` group, `brand` as the seed, font families by role, a radius token. |
| `--from-css <file>` | `importSiteCss`: the declarative token surface of a stylesheet (custom properties, font families, radius). It never resolves `@import`, fetches fonts or evaluates values; a stylesheet with an `@import` or an executable value is refused whole. |
| `--from-logo <file>` | SVG only. Protoyard reads the colors in `fill`, `stroke`, `stop-color` and similar attributes and inline styles as text (hex, `rgb()`, `rgba()`, `black`, `white`), weights each one by how often it appears, and passes them as pixels to Texuli's `importLogoPixels`. Texuli then picks the seed and a secondary color. |
| `--brief <text\|file\|->` | Texuli's brand one-liner (`importBrand`). Protoyard first splits prose into clauses (on sentence ends, commas, semicolons, line breaks, and the words *and*, *with*, *but* and *plus*). A clause `importBrand` already reads is kept as written. Any other clause is read for colors (with the role a nearby word names: *brand*, *primary*, *secondary*, *accent*), fonts (*Inter font*, *headings in Fraunces*), the shape, density, elevation and surface words, motion, and `AA`/`AAA`. The `--brand`, `--font` and other flags are added after the brief, so they win. |

Only one source is allowed per run. `--from-tokens`, `--from-css` and
`--from-logo` also refuse the brand flags (`--brand`, `--font`, and so on).
Edit the draft document afterwards instead. Every run prints, and returns under
`data.generation` with `--json`:

- the **loss report** (`losses`): each value the importer refused or could not
  place, and each value a later input replaced, with its JSON path;
- the **AA repair report** (`repairs`), which lists each value the generator
  or compiler changed to meet the AA guarantees, such as a brand seed it
  replaced, a pin it removed, or a control height raised to the 44 px target;
- the **guarantees** result (`passed`, `issues`);
- the source: the file, how each brief clause was read (`brief.reading` and
  the final `brief.oneLiner`), or the logo colors and how many values were
  ignored.

**Untrusted input.** Each file must be inside the workspace and must not be a
symlink or sit under a symlinked folder that leaves the workspace. Size caps
apply: tokens and CSS 1 MiB (also Texuli's cap), an SVG 512 KiB, a brief
16 KiB. Nothing is executed, fetched or rendered. The SVG is never parsed as
markup, so a `<script>` in it is just text. Texuli validates the result at
`trust: 'untrusted'`.

**Always a draft.** The document gets a draft `approval` like every `ds new`.
An `approval` an input carries (for example in a DTCG file's
`$extensions["com.texuli.design-system"]`) is dropped. Then the usual flow
applies: `--allow`, review, `ds approve <id> --by <name>`, then
`new <slug> --ds <id>`, which refuses the draft until it is approved. The same
input always gives the same bytes. `--dry-run` reads and generates but writes
nothing.

**Limits.**

- **Raster logos** (PNG, JPEG, GIF, WebP) are refused. Texuli 0.16.0 reads
  logo *pixels* (`importLogoPixels`), and the CLI does not decode images,
  because that would add a dependency. Pass the logo's main color with
  `--brand <hex>`, or export the logo as SVG.
- **SVG colors are weighted by count, not by area.** A small accent drawn many
  times can outweigh a large background shape. Gradients referenced with
  `url(#…)`, `currentColor`, `*-opacity` and named colors other than `black`
  and `white` are ignored. Ignored values are counted in the report.
- **A brief is read by keywords.** It is not understood as language. A clause
  with nothing to read stays in the one-liner, and Texuli reports it as an
  `unmapped` loss. Words such as *calm*, *soft* or *solid* are read as motion,
  elevation or surface choices even in an unrelated sentence. Check
  `brief.reading`.
- **Generator refusals.** When the generator cannot meet its guarantees, the
  run fails with `validation`, the errors and the report, and writes nothing.
  One known case: a stylesheet that pins a role color below AA (for example
  `--primary: #ffff00`) is refused with `$.color.brand.seed: Required.`:
  Texuli 0.16.0's repair loop first replaces the seed, then removes it, instead
  of the failing pin. Remove that pin from the stylesheet, or use `--brand`.

### The allow section

A locked design system says which Texuli catalog components a locked
prototype may use, and which values of their styling axes (variant, size,
tone, density) and states. The section lives in the document (Texuli's
design-system spec 0.13.0):

```json
"allow": {
  "button": { "variants": ["default", "outline"], "sizes": ["sm", "md"] },
  "card": {},
  "badge": { "variants": [] }
}
```

- The keys are catalog ids: Texuli's (`@texuli/catalog`, 194 components
  today) and the [catalog extensions](#catalog-extensions) of
  `@protoyard/ui`'s own components (`protoyard:data-table`, 57 today). An
  omitted list allows every value the catalog lists; an empty list allows
  none.
- **A design system without `allow` is not locked and cannot be locked.**
  `ds new` writes one by default; `--allow` picks it:

  | `--allow` | Section |
  | --- | --- |
  | `all` (default) | Every catalog component and every extension, with every axis value and state; the designer narrows it |
  | `minimal` | Texuli's core preset (actions, form controls, text and status, containers, overlays, page layouts), plus the extensions whose `composes` that preset covers (`protoyard:dialog`, `protoyard:input`, `protoyard:page-grid` and `protoyard:select` today) |
  | `<file>.json` | An allow section from a workspace file (`{ "button": {…} }` or `{ "allow": {…} }`), checked against the catalog |
  | `none` | No allow section: the old unlocked document |

- `pnpm protoyard ds allow init <id> [--preset all|minimal|<file>]` adds a
  section to a design system without one (`--force` replaces one). The
  approval goes back to draft.
- `ds validate` runs Texuli's `checkDesignSystemAllow` and fails on an id or
  value the catalog does not list, with Texuli's codes and JSON paths
  (`unknown-component at $.allow["no-such-thing"]`, `unknown-variant at
  $.allow.button.variants[0]`, also `unknown-size`, `unknown-tone`,
  `unknown-density`, `unknown-state`, and `unknown-component` for a library
  entry's `composes`). Extension keys are checked the same way, against the
  merged catalog.

### Catalog extensions

`@protoyard/ui` has components of its own (`DataTable`, `StatCard`,
`Notice`, its `Dialog` and `Select` wrappers…) next to its re-exports of
Texuli's (`Button`, `Card`). Texuli's catalog lists only Texuli's, so each
own component that renders Texuli components carries a **catalog extension
manifest**: plain data with the same shape as a Texuli catalog manifest (id,
package, label, summary, group, tier, props with `enumValues`, axes, states,
`imports: [{ module, exports }]`), a namespaced id and `composes`, the Texuli
ids it renders:

```ts
{
  id: 'protoyard:notice',
  package: '@protoyard/ui',
  label: 'Notice',
  summary: 'An inline message with a tone and an icon.',
  group: 'protoyard-ui',
  tier: 'app',
  props: [{ name: 'tone', kind: 'enum', enumValues: ['info', 'success', 'warning', 'error', 'brand'], default: 'info' }],
  axes: { tone: 'tone' },
  states: [],
  imports: [{ module: '@protoyard/ui', exports: ['Notice'] }],
  composes: ['alert', 'icon'],
  // useWhen, dontUseWhen, a11y and examples as in a Texuli manifest
}
```

- **Where they live.** `packages/cli/src/lib/ds-extensions/protoyard-ui.ts`
  holds three tables: the manifests (one per own component that renders
  Texuli components), the re-exports (each Texuli component `@protoyard/ui`
  re-exports, as the Texuli import it is: `FormField` is `Field` from
  `texuli/field`) and the own components that are not catalog components.
  `@protoyard/ui` has no subpath for them, and adding one would change its
  `package.json`, so the CLI holds the data. Any library that wraps Texuli
  can publish the same shape under its own namespace.
- **Merge.** Texuli's `mergeCatalogs` (from `@texuli/spec/catalog-extensions`)
  merges them. The CLI passes it the installed catalog in Texuli's
  `SpecCatalog` shape and the manifests as Texuli extension files
  (`{ format: "texuli/catalog-extension", version: 1, namespace, components }`,
  one per namespace), so Texuli applies its own rules and codes: namespace
  (`extension-namespace`; `texuli`, `tx`, `spec` and `catalog` are
  reserved), ids and collisions (`extension-id`, `extension-collision`),
  `composes` of 1 to 32 catalog ids (`extension-composes`), props, axes and
  states (`extension-props`, `extension-axis`, `extension-state`) and its
  limits (16 extension files, 256 components each). Texuli refuses an
  extension file whole when one of its components fails. The one rule the
  CLI checks itself is the one Texuli cannot see: no extension import names a
  `(module, export)` pair a Texuli manifest or another extension already
  names (`extension-collision` at `$.extensions[<i>].imports`). For the
  shipped data Texuli answers `ok: true`, one namespace (`protoyard`) and 50
  components.
- **Mapping.** An own component imported from `@protoyard/ui` maps by its
  manifest's `imports` to the extension id (`<DataTable>` →
  `protoyard:data-table`). A re-export maps to the Texuli id of the import it
  is (`<Button>` → `button`, `<FormField>` → `field`). So a locked prototype
  that uses `<Notice>` needs `protoyard:notice` in `allow`; allowing `alert`
  alone does not allow it.
- **Non-components.** Texuli's catalog lists the exports that are not
  components (`MotionProvider`, `SafeArea`, `AppShell`, `@texuli/primitives`
  parts…); they are never refused and never counted. An own component that
  renders none of Texuli's catalog components, only such exports or plain
  elements (`SafeArea`), gets no extension and is classified the same way.
  The input wrappers (`ChipGroup`, `FileDropzone`, `MobileAppShell`,
  `OtpInput`, `StarRating`, `TagEmailInput`, `WeekdayPicker`) render inputs
  Texuli 0.15.0 catalogs (`toggle-group`, `file-upload`, `mobile-app-frame`,
  `pin-input`, `rating`, `tags-input`), so they are extensions.
- **Rules.** `ds-not-allowed` allows an own component only when its extension
  id is in `allow`; `ds-disabled-value` reads the extension's axes
  (`<Notice tone="warning">` with `"protoyard:notice": { "tones": ["info"] }`
  fails).
- **Library entries** may list extension ids in `composes`;
  `ds component new` writes them when a component renders one.

Texuli's design-system validator accepts `<namespace>:<id>` allow keys, so
`ds new`, `ds validate`, `ds allow init` and `ds approve` hand Texuli the
document as written: it locks, validates, compiles and approves it with the
extension keys, and the approval's content hash covers them.

**Adding a component to `@protoyard/ui`.** Run:

```bash
pnpm vitest run packages/cli/tests/ds-extensions.test.ts
```

The test reads `packages/ui/src/index.ts` and fails when an own component
that renders Texuli components (a `.svelte` file the barrel exports) has no
manifest or more than one, when an own component that renders none is
missing from the non-component table, when a manifest names something the
package does not export as its own, when `composes` differs from the Texuli
ids the source renders (through its local children; the failure prints the
right list), when an axis value is not in the source, or when the re-export
table differs from the barrel's re-exports. Copy a similar entry into the
table it names. A Texuli re-export never gets a manifest: it maps to a Texuli
id (`AppShell`, a Texuli non-component, is the one exception today). Texuli
imports the `@protoyard/ui` sources use that Texuli's catalog neither maps nor
lists as non-components (`@texuli/primitives` parts, compound parts of
`texuli/sheet` and `texuli/navigation`) are a pinned list in the test.

### 2. Review in the kit

```bash
pnpm protoyard ds kit harbor
pnpm protoyard dev harbor-kit
```

`ds kit <id>` writes the design system's kit prototype, `prototypes/<id>-kit`
(the slug the gallery's **Open the kit** link looks for; `--slug` picks
another). Its one screen is Texuli's `DesignSystemKit` (`texuli/ds-kit`),
rendered from data, so it works for any design system:

- **Header**: name, version, the approval with its content-hash check
  (approved, draft, or changed since the approval), and a light, dark or
  side-by-side mode switch.
- **Foundations**: every compiled token per mode, contrast pairs.
- **Voice and rules**: the document's voice section.
- **Components**: every catalog component the `allow` section enables, with
  its variants, sizes and states, and the components it does not allow (as a
  list, never as samples). The catalog is Texuli's merged catalog, so the
  `protoyard:` extensions are listed too; Texuli renders no sample for them.
- **Library**: the design system's own components (`@ds/<id>/<Name>`), each
  with the variants of its story (`stories/<Name>.json`), in both modes, with
  each entry's approval.
- **Changes**: what changed since the previous release (tokens, allow,
  library, approval), when the design system has one (see
  [7. Release and compare versions](#7-release-and-compare-versions)).

The path names the section and item (`#/matrix/button`,
`#/library/status-pill`), so a link to one part of the kit survives a refresh.

What the command writes:

| File | What it holds |
| --- | --- |
| `src/kit/kit.json` | The document, its compiled output (with Texuli's allow manifest), Texuli's merged catalog reduced to what the kit reads, the library stories and the previous release's document and compiled output |
| `src/kit/library.ts` | One `@ds/<id>/<Name>` import per library component with a source file |
| `src/App.svelte`, `src/screens/KitPage.svelte`, `src/kit/model.ts` | The routed kit page (the same for every design system) |
| `src/prototype.ts`, `src/database/schema.ts`, `src/scenarios/*` | A definition with no domain tables and one `review` scenario with a fictional reviewer |
| `tests/kit.test.ts`, `index.html`, `README.md`, the kit fields of `protoyard.json` | |

- **Created once, refreshed after.** The first run copies the `blank`
  template (its `src/` except `main.ts` and `app.css` is replaced), links it
  with `pnpm install` (`--no-install` skips that) and indexes it, so the
  gallery lists it. Later runs rewrite only the files whose content changed:
  the same design system gives the same bytes, and a rerun writes nothing.
  Re-run it after every change to the design system; `ds kit <id> --check`
  writes nothing and exits 4 when the kit is missing or stale (use it in CI).
- **Bound, not locked.** The kit binds to the design system
  (`designSystem: { id, version, locked: false }`) through the `ds use` code
  path, and follows the document's version on every refresh. It is not locked
  because a kit has to render a draft under review, and a lock refuses a
  draft. It still uses only the design system: the command runs the `check
  ds` scan on it after every write and fails (exit 4) on a violation.
- Everything under `src/` except `main.ts` and `app.css` belongs to the
  command; `src/design-system.ts` is written by the `ds use` path it runs.
  The command refuses a `prototypes/<slug>` folder that is not this design
  system's kit.

Commit the kit with the design system, or leave it out and regenerate it
where you review; both work, since it is rebuilt from the folder alone.

### 3. Approve

```bash
pnpm protoyard ds approve harbor --by "Ada Example"
pnpm protoyard ds approve harbor --by "Ada Example" --release 1.1.0
```

`ds approve` calls Texuli's `approveDesignSystem` and writes the result into
`document.json`:

```json
"approval": {
  "status": "approved",
  "version": "1.0.0",
  "approvedBy": "Ada Example",
  "approvedAt": "2026-11-09T12:00:00.000Z",
  "contentHash": "<designSystemContentHash of the document>"
}
```

`--release <semver>` approves that version, makes it the document's
`version` (the flag is not `--version`, which prints the CLI's own version)
and records the release `releases/<semver>.json` (see
[7. Release and compare versions](#7-release-and-compare-versions));
`--changelog <text>` gives its changelog entry. When that release already
exists the command refuses before it writes anything.
It refuses a flat document (run `ds migrate` first), an unknown id, a document
without `allow`, an `allow` section the catalog refuses and a missing `--by`.
It prints Texuli's note and the commit guidance. Commit `document.json` in a
change a human reviews.

**An approval is a record, not a proof.** The CLI cannot tell who ran the
command. The guarantee is the reviewed commit; protect `design-systems/` with
CODEOWNERS so a designer has to approve every change there. No MCP tool
approves.

A `.github/CODEOWNERS` (or `CODEOWNERS` at the root, or in `docs/`) for a
workspace on GitHub, with branch protection that requires code-owner review;
the team names are examples:

```text
# Design systems: documents, approvals, releases, components and stories.
/design-systems/            @example-org/design-reviewers
# Kit prototypes are rebuilt from the folder (`protoyard ds kit <id>`).
/prototypes/*-kit/          @example-org/design-reviewers
# Bindings: `designSystem.locked` decides whether CI render-checks a prototype.
/prototypes/*/protoyard.json  @example-org/design-reviewers
```

The last line matters for CI: the build workflow render-checks only the
prototypes whose `protoyard.json` declares `designSystem.locked: true`, so a
pull request that sets it to `false`, or removes the binding, also removes the
check. With the manifests under code-owner review, that change needs a
designer's approval too. The CLI does not compare the binding with the base
branch.

This repository has no `design-systems/` folder of its own, so it ships no
such file; the snippet is for the workspaces that keep design systems.

A folder from before spec 0.13.0 may still hold the legacy
`approval.json` sidecar. The CLI reads it when the document has no `approval`,
never writes it, and `pnpm protoyard ds migrate <id>` moves it into the
document.

### 4. Create locked prototypes

```bash
pnpm protoyard new harbor-orders --template dashboard
pnpm protoyard ds use harbor-orders harbor --lock
pnpm protoyard validate harbor-orders --build
```

`--lock` writes `"designSystem": { "id": "harbor", "version": "1.0.0",
"locked": true }` into the prototype's `protoyard.json`. It refuses a flat
document, a document without `allow` (or with one the catalog refuses), a
draft, an approval for another version, an approval without a content hash and
a document that changed after its approval. A locked prototype loads only that
design system's theme, and `check ds` and `validate` fail on raw controls,
visual CSS, inline styles, visual utility classes, other UI libraries, local
motion, components the `allow` section does not list (`ds-not-allowed`) and
literal axis values it does not enable (`ds-disabled-value`)
([Locked design systems](THEMES.md#locked-design-systems),
[check ds](THEMES.md#check-ds)).

### 5. Request components

When no component fits, an agent stops and asks the human; then:

```bash
pnpm protoyard ds component request harbor StatusPill --purpose "Shows a ticket status with its label" --why "Badge has no label layout" --by "Ada Example"
pnpm protoyard ds component approve-request harbor StatusPill --by "Bo Example"
pnpm protoyard ds component new harbor StatusPill
```

Prototypes import it as `@ds/harbor/StatusPill`. `ds component new` also adds
the component to the document's `library` (id `status-pill`, `composes` = the
catalog ids its source renders), and `pnpm protoyard ds component approve
harbor StatusPill --by "Bo Example"` approves both its `components.json` entry
and its library entry after review. A library change moves the document's
content hash: approve the design system again. The steps, what each writes and
refuses, are in
[Requesting a new component](THEMES.md#requesting-a-new-component).

### 6. Upgrade

Change the document, bump its `version`, approve the new version, then move
each bound prototype:

```bash
pnpm protoyard ds use harbor-orders harbor --upgrade
```

`--upgrade` moves the pin and lists the compiled values that changed, were
added or were removed. Without it, `ds use` refuses a new version for a bound
prototype.

### 7. Release and compare versions

```bash
pnpm protoyard ds approve harbor --by "Ada Example" --release 1.1.0 --changelog "Teal brand, compact density"
pnpm protoyard ds release harbor          # record a version already approved
pnpm protoyard ds versions harbor
pnpm protoyard ds diff harbor             # the document against the last release with other content
pnpm protoyard ds diff harbor 1.0.0 1.1.0
```

A release is an immutable snapshot of one approved version:
`design-systems/<id>/releases/<version>.json` holds the whole document as
approved, its content hash, who approved it and when, the `components.json`
entries (name, version, source hash) and a changelog entry.

- `ds approve --release <semver>` approves and records in one step. `ds
  release <id>` records a version that is already approved: the approval must
  be for the document's version and its hash must match the document now
  (approve again after a change). Both refuse to overwrite a release; a new
  version is a new file.
- Without `--changelog`, the entry is a summary of the changes since the
  previous release (`Changes since 1.0.0: tokens 138 changed, 0 added, 0
  removed; allow 0 added, 1 removed, 0 lists changed`), or `First release of
  <id> (<version>).`
- `ds versions <id>` lists the releases, oldest first, whether the current
  document is released, and the release it is compared with. A file that
  fails its schema, names another design system or version, or whose
  document no longer matches its hash is listed under `issues` and ignored.
- `ds diff <id> [<from>] [<to>]` compares two versions, each `current` or a
  release. By default `to` is `current` and `from` is the newest release at or
  below its version whose content differs (for a release, the newest one
  below it). Token changes and contrast regressions come from Texuli's
  `diffDesignSystems` over both compiled versions; the allow changes
  (components added or removed, lists changed), library changes and approval
  changes have the shape of the kit's `KitChangesModel`.
- The kit's **Changes** section compares the document with the same
  baseline, using Texuli's own `changesModel`.

## List them

```bash
pnpm protoyard ds list
pnpm protoyard ds list --json
```

`ds list` re-indexes the workspace and prints every design system: id, name,
version, status, whether `ds use --lock` would accept it, layout, component
count and the prototypes bound to it (`slug@version`, and `(locked)`). The MCP
tool `ds_list` returns the same envelope. A broken folder, a document whose id
does not match its folder, a flat file shadowed by a folder of the same id, a
symlink, or a prototype bound to an id with no design system is listed under
`issues` and never fails the index.

**In the registry.** `protoyard index` writes them to
`.protoyard/registry.json` as a top-level `designSystems` array, with
`designSystemIssues` for the problems and `stats.designSystems` for the count.
Each prototype entry also carries its manifest binding as `designSystem`
(`null` when it has none).

| Field | Meaning |
| --- | --- |
| `id`, `name`, `version` | From the document (`name` falls back to the id) |
| `status` | `draft` or `approved`, from the document's `approval` (or a legacy `approval.json`); a flat document is always a draft |
| `approvedBy`, `approvedAt`, `approvedVersion` | From an approved approval, else `null` |
| `contentHash` | The document's hash now |
| `lockable` | Has a valid `allow` section, approved at this version and unchanged since: `ds use --lock` accepts it |
| `layout`, `path` | `folder` (`design-systems/<id>`) or `flat` (`design-systems/<id>.json`) |
| `componentCount` | Entries in `components.json` |
| `boundPrototypes` | `{ slug, name, version, locked }` for each prototype whose manifest names this id, sorted by slug |

Why a separate array and not registry entries with a new `kind`: galleries and
CLIs that predate design systems check each entry's `kind` and would report
every design system as an invalid entry. They ignore a top-level field they do
not know, so an older gallery keeps working with a newer registry. The
registry `version` stays 1.

The index reads each document, a legacy `approval.json` and `components.json` as data.
It never reads component sources and never compiles a document (`ds validate`
does). It looks one level under `design-systems/`, skips names that start with
`.` or `_`, and does not follow symlinks.

**In the gallery.** The **Design systems** page (`/design-systems/`) lists
each one with its version, status, approval, whether it can be locked, its
component count and its prototypes, linked when the gallery lists them. The
prototype browser on the home page has a **Design system** filter (also as
`?ds=<id>` in the URL), shown when at least one listed prototype is bound. An
**Open the kit** link appears only when a prototype named `<id>-kit` exists
(`ds kit <id>` writes it). The gallery checks the `designSystems` array as
untrusted input and drops anything malformed.

## The full check

`ds validate` runs Texuli's full validator, `checkDesignSystemFull` from
`@texuli/tools/ds-check`, over the installed Texuli catalog with Protoyard's
catalog extensions (`protoyard:*`) merged, the same merge `ds validate` and
`check ds` use for the allow section. Its report is the `full` key of
`--json`: `ok`, the error `codes`, a `summary` (errors, warnings, info) and
every finding with Texuli's stable code, severity, area, path and fix hint
(structure, `extends`, allow, approval and content hash, contrast, data-viz
palette, tokens). The human output prints the counts and the first ten
findings.

The exit code does not change on it: a document that passed `ds validate`
before still passes, and a stale approval stays a reason `lockable` is false.
`--strict` also fails (exit 4) when the full report has an error. `ds import`
prints the same report for the document it imports.

## Share between workspaces

```bash
pnpm protoyard ds export harbor --bundle --out tmp/harbor.ds-bundle.json
pnpm protoyard ds import tmp/harbor.ds-bundle.json --dry-run
pnpm protoyard ds import tmp/harbor.ds-bundle.json
```

`ds export <id> --bundle` packs the folder `design-systems/<id>/` into one
JSON file. Without `--out` it prints the bundle (`--json` returns it as
`data.bundle`); `--out` writes a `.json` file under `design-systems/`,
`artifacts/` or `tmp/` (never `package.json`, `protoyard.json`,
`tsconfig*.json`, `.github/`, a source folder or a path through a symlink)
and refuses an existing one without `--force`; `--force` replaces only an
earlier bundle. It refuses a flat document (run `ds migrate`), a symlink
in the folder, a file that is not UTF-8 or is over 1 MiB, a JSON file its
schema refuses and component drift (a bundle only carries sources that match
their `components.json` hashes). Files the format does not know (a `README`,
`.DS_Store`) are left out and listed as `skipped`. The same folder always
packs to the same bytes: the bundle holds no timestamp.

**The format** (`protoyard/ds-bundle`, version 1, `bundle.schema.json`):

```json
{
  "format": "protoyard/ds-bundle",
  "version": 1,
  "designSystem": "harbor",
  "release": "1.0.0",
  "contentHash": "<designSystemContentHash of the document>",
  "texuli": { "format": "texuli/design-system-bundle", "version": 1, "...": "..." },
  "files": [
    { "path": "components.json", "sha256": "…", "bytes": 412, "text": "{…}" },
    { "path": "components/StatusPill.svelte", "sha256": "…", "bytes": 980, "from": "library:status-pill" },
    { "path": "document.json", "sha256": "…", "bytes": 6120, "from": "document" }
  ]
}
```

- `texuli` is Texuli's own bundle, made by `packBundle` in
  `@texuli/spec/design-system`: the document, each component's source as text
  with its SHA-256 (library id = the component name in kebab case), the allow
  manifest (with the merged catalog's digest and the `protoyard` extension
  namespace) and the release history (each `releases/<version>.json`, and the
  current approval when it matches the document). Texuli's bundle schema is
  closed, so Protoyard's files ride beside it, not inside it.
- `files` lists every file of the folder: `document.json`, `components.json`,
  `components/<Name>.svelte`, `requests/<Name>.json`, `stories/<Name>.json`,
  `releases/<version>.json` and a legacy `approval.json`. Each has its
  SHA-256 and size, and either its UTF-8 `text` or `from`, which names where
  its bytes already are: `document` (the document as the CLI writes it,
  two-space JSON) or `library:<id>` (a component source). So nothing is
  stored twice.

**Import is untrusted input.** `ds import` checks the whole bundle before it
writes a byte:

1. the file is a regular file (never a symlink) of at most 8 MiB, parsed with
   `JSON.parse`, nested at most 64 levels;
2. Protoyard's schema (closed objects, at most 400 files, each at most 1 MiB,
   `text` or `from`, never both);
3. Texuli's `validateBundle` (through `unpackBundle`): the document schema at
   trust `untrusted`, path-safe source ids, every source hash, the allow
   manifest's content hash, the history and its caps;
4. every path against a closed list (no `..`, no absolute path, no backslash,
   no unknown file such as `NOTES.md` or `components/evil.js`), with
   duplicates refused, also case-insensitively (`requests/STATUSPILL.json`
   next to `requests/StatusPill.json`);
5. every file's bytes against its recorded SHA-256 and size, at most 8 MiB in
   all (the check stops at the cap), and every library source used by
   exactly one component file (a second reference is refused before its
   bytes are built);
6. `document.json` against Texuli's document, each JSON file against its own
   schema (a story's variant names are unique, and its props may not carry a `javascript:`, `vbscript:`,
   `data:`, `file:` or `blob:` URL), `components.json` against the component
   files (hash, missing, unlisted) and their library sources, each release
   record against its own document (`releaseProblems`: id, version and
   content hash, as `ds versions` checks them) and against an entry of
   Texuli's release history with the same version and content hash;
7. the document compiles (as data), and Texuli's full check runs (reported,
   not blocking, as in `ds validate`).

Then it writes into a hidden staging folder
(`design-systems/.<id>.import-<random>`, which the index skips) and renames it
into place. It never replaces an existing `design-systems/<id>/` without
`--force`; with it, the old folder moves aside, the staged one takes its
place, and the old one is removed (moved back if the rename fails). A flat
`design-systems/<id>.json` of the same id is never shadowed. `--dry-run`
makes the same refusals (a flat `<id>.json`, a symlinked folder, an existing
design system without `--force`). The import compiles the document as data
(step 7), but compiles no component code, runs nothing and renders nothing
as HTML.

**Component sources are code.** `components/<Name>.svelte` is reachable as
`@ds/<id>/<Name>`: it is compiled into every prototype that imports it, `ds
kit` imports every library component into the kit, and the result runs in
the browser of whoever views the prototype, published or not. A component
can do anything a Svelte file can, such as read a workspace file through a
Vite `?raw` import at build time and send it somewhere. The hashes only prove
the files are the ones the bundle's author packed. So `ds import` lists every
imported component source with its size (`data.components`, and in the text
output) under the note "review this code before `ds kit`, `dev` or `build`".
Review it like a dependency from npm, in the commit a designer approves.
`--dry-run`
runs every check and writes nothing. `--id <id>` imports under another id:
the document's `id` changes, so its approval resets to draft; it is refused
when the bundle has release records, which name the original id.

**The approval on import.** It is imported as it was, so an unchanged
round trip gives byte-identical files and a reviewer sees exactly what the
source workspace approved. But an imported approval is a record from another
workspace, **not a proof**: anyone can edit a JSON file. The import prints
`importedFrom` (the bundle file and its SHA-256) and that note, and it lists
the imported release records (`data.releases`) under the same "record, not a
proof" note: each matches its document and the bundle's history, but the
bundle's author wrote both. The
guarantee stays the same as for any design-system change: the import lands in
a commit a designer reviews (CODEOWNERS on `design-systems/`). A workspace
that wants its own approval passes `--draft`, which resets the document's
approval to `{ "status": "draft", "version": … }` (the content hash covers no
approval, so `ds approve` re-approves the same content).

Why not always reset it: the content hash would not change, so a reset would
only add a step, and the reviewed commit is the guarantee either way. Keeping
it makes a bundle reproduce the folder exactly; `--draft` is there for a
workspace whose policy is to re-approve everything it imports.

## Folder layout and contracts

```text
design-systems/
  harbor/                  a folder: can be approved and locked
    document.json          the Texuli design-system document: allow, library, approval
    components.json        the design system's own components, with source hashes
    components/*.svelte
    requests/<Name>.json   component requests
    stories/<Name>.json    the kit story of each component
    releases/<version>.json  approved versions, never rewritten
  legacy.json              a flat document: usable with ds use, never locked
```

Each file Protoyard writes has a zod schema in
[ds-contracts.ts](../packages/cli/src/lib/ds-contracts.ts), the module every
reader uses, and a JSON Schema (draft 2020-12) generated from it in
[ds-schemas/](../packages/cli/src/lib/ds-schemas/). A test fails when a JSON
Schema file drifts from its zod schema, and checks that the CLI's readers
refuse every document the JSON Schema refuses.

| File | Format | JSON Schema `$id` | Schema file | Written by |
| --- | --- | --- | --- | --- |
| `document.json` | `texuli/design-system` (with `allow`, `library`, `approval`) | Texuli's spec | (Texuli) | `ds new`, `ds approve`, `ds allow init`, `ds migrate`, `ds component new` and `approve`, by hand |
| `approval.json` (legacy) | `{ status, version, approvedBy?, approvedAt?, contentHash? }` | `urn:protoyard:design-system:approval:1` | `approval.schema.json` | Nothing now; read when the document has no approval, removed by `ds migrate` |
| `components.json` | `protoyard/ds-components`, version 1 | `urn:protoyard:design-system:components:1` | `components.schema.json` | `ds new`, `ds component new` and `approve` |
| `requests/<Name>.json` | `protoyard/ds-component-request`, version 1 | `urn:protoyard:design-system:component-request:1` | `component-request.schema.json` | `ds component request`, `approve-request` |
| `stories/<Name>.json` | `protoyard/ds-story`, version 1 | `urn:protoyard:design-system:story:1` | `story.schema.json` | `ds component new` |
| `releases/<version>.json` | `protoyard/ds-release`, version 1 | `urn:protoyard:design-system:release:1` | `release.schema.json` | `ds approve --release`, `ds release` |
| `<id>-<version>.ds-bundle.json` (any name) | `protoyard/ds-bundle`, version 1 | `urn:protoyard:design-system:bundle:1` | `bundle.schema.json` | `ds export <id> --bundle`; read by `ds import` ([Share between workspaces](#share-between-workspaces)) |

- The `$id`s are URNs: they name a contract and do not point at a hosted URL.
- A release record's `changelog` is at most 4,000 characters and its
  `document` is the Texuli document as approved; the reader also checks that
  the document's hash, id and version match the record.
- The schema files live in the repository. The npm package carries the same
  contracts as the zod schemas in its code, not as separate `.json` files.
- `contentHash` is Texuli's `designSystemContentHash`: the SHA-256 of the
  document's canonical JSON (sorted keys, no whitespace) without its whole
  `approval` section and without each library entry's own `approval`. The CLI
  has no hash of its own. A legacy sidecar hash of a document without a
  library matches it.
- The `allow` section, the library entries and the approval are part of
  Texuli's document schema (spec 0.13.0); Protoyard defines no schema for them.
  `components.json` stays the source of each component's code hash.

The manifest binding is part of the prototype contract in `@protoyard/core`:
`designSystem: { id, version, locked }`, where `id` is the design system's id
(also its theme id), `version` an exact semver and `locked` defaults to
`false`.

## Commands

| Command | What it does |
| --- | --- |
| `ds new <id> [--from-tokens <file>\|--from-css <file>\|--from-logo <file.svg>\|--brief <text\|file\|->] [--allow all\|minimal\|<file>\|none] [--dry-run]` | Create a design system folder (or a flat file with `--out`: a `.json` under `design-systems/`, `artifacts/` or `tmp/`; `--force` replaces only a design-system document) with an allow section; a brand source runs Texuli's generator and reports losses and AA repairs ([Create from your brand](#create-from-your-brand)) |
| `ds list` | Every design system with its approval, lockability, component count and bound prototypes |
| `ds validate <id\|file> [--strict]` | Validate and compile; check `allow` against the catalog; report approval, lockability and component drift; print Texuli's full check as `full` (`--strict` fails on its errors) |
| `ds extensions [--out <dir>] [--force]` | Protoyard's catalog extensions as Texuli extension files, for `texuli ds check <document> --locked --extensions <file>` so Texuli's check accepts the same `protoyard:` allow keys; `--out` is a folder under `design-systems/`, `artifacts/` or `tmp/`, and another file of the same name is replaced only with `--force` |
| `ds approve <id> --by <name> [--release <semver> [--changelog <text>]]` | Approve it in the document (a human, never an MCP tool); `--release` also records the release |
| `ds release <id> [--changelog <text>]` | Record the approved version as `releases/<version>.json` |
| `ds versions <id>` | The releases and where the document stands |
| `ds diff <id> [<from>] [<to>]` | What changed between two versions |
| `ds kit <id> [--slug] [--check] [--dry-run] [--no-install]` | Write or refresh the kit prototype `prototypes/<id>-kit` |
| `ds allow init <id\|file> [--preset …] [--force]` | Add an allow section to a design system without one |
| `ds migrate <id>` | Turn a flat document into a folder; fold a legacy `approval.json` into the document; add `components.json` components to the library |
| `ds export <id\|file> [--format css\|tailwind\|json]` | CSS variables, a Tailwind preset or compiled JSON |
| `ds export <id> --bundle [--out <file>] [--force]` | Pack the folder into one portable bundle (printed, or written to `--out`) |
| `ds import <file> [--id <id>] [--force] [--draft] [--dry-run]` | Check a bundle as untrusted input, then write `design-systems/<id>/` |
| `ds use <slug> <id\|file> [--lock] [--upgrade]` | Apply a design system to a prototype; bind, lock or upgrade it |
| `ds component request\|approve-request\|new\|approve` | Request, approve the request, scaffold and approve a component |
| `check ds [slug…] [--report] [--render]` | The locked-prototype rules; `--render` also checks what each locked prototype paints in Chromium (`--write-baseline` writes a `.json` under `design-systems/`, `artifacts/` or `tmp/`; another kind of file only with `--force`) |

Every command takes `--json`. The MCP server exposes `ds_create`, `ds_list`,
`ds_validate`, `ds_export`, `ds_use`, `ds_component_request` and
`ds_component_new` ([MCP](MCP.md#tools)); `ds_create` takes `allow` (`all`,
`minimal` or `none`) and one brand source (`brief`, `fromTokens`, `fromCss`,
`fromLogo` or `fromTheme`; a `brief` of `-` is refused). Its result is a draft.
There is no approval or release tool, on purpose, and no MCP tool for
`ds versions`, `ds diff` or `ds kit` yet (run the CLI with `--json`).

## Planned

These are not available today:

- **Pinned older versions**: a prototype pinned to an older release still
  compiles the current document. Releases keep every approved document, but
  `ds use` cannot apply a release yet.
- **Generator inputs**: `protoyard generate` and `quick` taking a design
  system so new prototypes start locked.

## Limits

- An approval is a record, not a proof; the reviewed commit is the guarantee.
- Only a folder with an `allow` section can be approved and locked; a flat
  document cannot.
- A component the mapper cannot place ([the mapper](THEMES.md#the-catalog-mapper))
  is `unmapped` and refused in a locked prototype; none of the component tags
  in `templates/` and `prototypes/` is today.
- Non-components are never refused, so a locked design system cannot forbid
  them: Texuli's list includes shells (`AppShell`) and helpers. When Texuli
  catalogs another visual export, the CI test asks for a manifest for every
  `@protoyard/ui` component built on it.
- The allow section holds at most 4,096 keys (Texuli's cap): 251 today (194
  Texuli components and 57 extensions).
- `check ds` is a static, textual scan; see its limits in
  [THEMES](THEMES.md#check-ds). `check ds --render` (done in 1.8.0) checks
  the built prototype in Chromium on every route, light and dark, phone and
  desktop: controls outside allowed catalog roots, painted colors that do not
  follow the design system, contrast, axe, rendered axis values the allow
  section does not enable, and hand-drawn charts; it sees only what a route
  shows at rest ([render mode](THEMES.md#render-mode---render)). The build
  workflow of `protoyard ci` runs it for locked prototypes.
- A workspace's design systems are local files. Nothing is hosted or
  synchronized; a bundle file is how one moves between workspaces, by hand. A
  cloud version is a later step.
- An imported approval, and an imported release record, is a record from
  another workspace, not a proof.
- Imported component sources are code that builds and runs; nothing reviews
  them for you ([Share between workspaces](#share-between-workspaces)).
- The guidance for agents is a nudge, not a control: `ds component new`
  refuses to run from inside a prototype folder (the working folder, or
  `--cwd` when given, so passing another `--cwd` skips it) and checks only
  the prototypes named with `--prototype`. The real gate is the approved request and the reviewed
  commit.
- CI render-checks only prototypes that declare `designSystem.locked: true`;
  protect `prototypes/*/protoyard.json` with CODEOWNERS
  ([3. Approve](#3-approve)).
- A bundle carries at most 64 components (Texuli's cap), 32 history entries
  and 400 files; its file is at most 8 MiB and each folder file at most 1 MiB.
  Texuli's allow manifest inside the bundle keeps at most 256 allow keys and
  32 values per axis (it truncates without a refusal); the document itself
  carries the whole allow section, and that is what import writes.
- The kit page is long (every allowed component with its states, in both
  modes): about 92,000 px for the `all` allow preset in a 1280 px window, and
  a 432 KB `kit.json`. Its production build is one 695 KB chunk plus Texuli's
  component chunks; measured on one design system, not a budget.
- A release keeps the document, not the component sources: `components`
  records their hashes only. `ds diff` and the kit recompile an old document
  with the installed Texuli, so a newer Texuli can compile it differently.
