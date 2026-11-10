# Design systems

A Protoyard design system is Texuli's design-system document
(`format: "texuli/design-system"`): brand colors, typography, shape, density,
motion and component tokens in one JSON file. Protoyard validates it with
Texuli as untrusted input, compiles it to `--tx-*` variables for light and
dark, and paints it with Texuli's runtime. The same inputs always give the
same document and the same hash.

## Create one

From a few inputs (each is optional; give at least a brand color or a brief):

```bash
pnpm protoyard ds new harbor --name Harbor --brand '#0f766e' --font Inter --shape rounded --density compact --motion subtle
```

From a brief: prose or a one-liner, a `.txt`/`.md` file, or `-` for stdin
(explicit inputs win over the brief):

```bash
pnpm protoyard ds new atlas --brief "brand #4f46e5, font Geist, heading font Fraunces, sharp, comfortable"
pnpm protoyard ds new nurse-bank --brief "Calm banking for nurses. Deep teal #0f766e brand, Inter font, rounded."
```

From the brand a company already has (one source per run; Texuli's
generator, offline):

```bash
pnpm protoyard ds new acme --from-tokens brand/tokens.json   # W3C DTCG or Tokens Studio JSON
pnpm protoyard ds new acme --from-css brand/site.css         # a site stylesheet's tokens, read as text
pnpm protoyard ds new acme --from-logo brand/logo.svg        # palette from an SVG logo's fill/stroke colors
```

A brief or one of these files prints Texuli's **loss report** (values it
could not keep) and **AA repair report** (values changed to meet AA); with
`--json` both are under `data.generation`, with how each brief clause was
read (`brief.reading`). Show both to the user before they approve. The files
must sit inside the workspace (no symlinks), within size caps (tokens and
CSS 1 MiB, SVG 512 KiB, brief 16 KiB). Raster logos (PNG, JPEG) are refused:
ask for an SVG or the logo's main color for `--brand`. `--from-tokens`,
`--from-css` and `--from-logo` take no brand flags; edit the draft instead.
The result is always a draft, even if the input carried an approval.

From an existing theme (a built-in or any library theme):

```bash
pnpm protoyard ds new ocean-ds --from-theme ocean
```

Each writes the folder `design-systems/<id>/` (the document with an `allow`
section and a draft approval, and the component library) and prints the
contrast result per mode. The `allow` section lists the Texuli catalog
components and values a locked prototype may use, plus `@protoyard/ui`'s own
components under `protoyard:` ids (`protoyard:data-table`; `<DataTable>` from
`@protoyard/ui` needs that key, while a re-export such as `<Button>` or
`<FormField>` needs the Texuli id, `button` or `field`; exports Texuli lists as
non-components, such as `MotionProvider` or `AppShell`, need none): `--allow all` (the default, every id), `minimal` (Texuli's core set
and the `protoyard:` components it covers), a JSON file, or `none` (that design system can never be locked;
`ds allow init <id>` adds one later). `--dry-run` compiles without writing; `--force` replaces the file. An
imported theme lists what it could not keep exactly as notes (most Protoyard
themes get their `input` and dark `borderStrong` colors raised to 3:1).

## See what the workspace has

```bash
pnpm protoyard ds list
pnpm protoyard ds list --json
```

Each design system with its version, status (`draft` or `approved`), whether
`ds use --lock` would accept it, folder or flat layout, component count and
the prototypes bound to it (`slug@version`, locked or not). Run it before you
pick a design system for a prototype; a workspace can have many. The gallery
shows the same list at `/design-systems/`.

## Check, export and apply

```bash
pnpm protoyard ds validate harbor
pnpm protoyard ds export design-systems/harbor/document.json --format css
pnpm protoyard ds use crm-demo harbor --dry-run
pnpm protoyard ds use crm-demo harbor
pnpm protoyard spec crm-demo --write
pnpm protoyard validate crm-demo --build
```

`ds use` writes `src/design-system.ts`, adds the theme to
`definePrototype({ themes })` in `src/prototype.ts`, and sets `defaultTheme`.
It refuses a prototype without a `definePrototype({ … })` call or without the
`@protoyard/runtime` dependency, and another design system without `--force`.

`ds validate` also prints `full`: Texuli's full validator
(`checkDesignSystemFull`) over the Texuli catalog with Protoyard's
`protoyard:*` extensions merged (structure, allow, approval hash, contrast,
data-viz palette, tokens). It does not change the exit code unless you pass
`--strict`.

## Share one between workspaces

```bash
pnpm protoyard ds export harbor --bundle --out tmp/harbor.ds-bundle.json
pnpm protoyard ds import tmp/harbor.ds-bundle.json --dry-run
pnpm protoyard ds import tmp/harbor.ds-bundle.json
```

- The bundle is one JSON file: the folder's files with their hashes, and
  Texuli's own bundle (document, component sources, allow manifest, release
  history). The same folder always packs to the same bytes.
- `ds import` treats it as untrusted: it checks everything (schema, Texuli's
  `validateBundle`, a closed list of paths, sizes, every hash, each release
  record against its document and the bundle history) before it writes. The
  import itself executes nothing. It never replaces an existing design
  system without `--force`. `--id <id>` imports under another id (refused
  when the bundle has release records).
- **Component sources are code.** Every `components/<Name>.svelte` it
  imports compiles into the kit (`ds kit`) and into every prototype that
  imports `@ds/<id>/<Name>`, and runs in the viewer's browser; at build time
  it can read workspace files. `ds import` lists them with their sizes
  (`data.components`). Do not run `ds kit`, `dev` or `build` on an imported
  design system until the human has reviewed those sources like a third-party
  dependency; show them the list.
- `--out` (bundle, `ds new`, `--write-baseline`, `ds extensions`) writes only
  `.json` files under `design-systems/`, `artifacts/` or `tmp/`.
- An imported approval (and every imported release record) is kept as it
  was, but it is a record from another workspace, not a proof. Tell the human: the import goes in a commit a
  designer reviews, or they re-approve it (`--draft` resets it to draft).
  Never approve it yourself.

## In the browser

DevTools → Look → **Open studio** → **Design system** creates one from a name,
a brief, a brand color, fonts, shape, density and motion, from the current
theme, or from pasted JSON, then **Save and apply**. It is kept per prototype
and browser; to put it in the repository, download the JSON and run `ds use`.

## Start a prototype locked to a design system

Prefer creating it locked over binding it later:

```bash
pnpm protoyard new my-portal --ds harbor --dry-run             # every check, nothing written
pnpm protoyard new my-portal --ds harbor                       # blank template
pnpm protoyard new my-portal --ds harbor --template <name>      # any lock-clean template
pnpm protoyard generate my-deck --blueprint <file> --ds harbor  # app, deck, page or doc blueprint
```

- Before copying, the design system must be an approved folder at its
  document version, unchanged since approval, and the template must pass the
  `check ds` rules. A template with violations is refused with the counts by
  rule: pick another template; do not restyle the template.
- `--from <prototype>` with `--ds` is refused (it may copy visual code).
- `--unlocked` binds without locking (a draft and any template allowed). Use
  it only when the human asked for an unlocked sketch.
- `generate --ds` ignores the blueprint `brand`; regeneration keeps the
  binding from `protoyard.json`, and `ds use <slug> <id> --upgrade` moves the
  pin of a generated prototype too.
- Read `data.designSystemCheck` in the `--json` envelope: `ok: false` means
  the prototype is locked but does not pass yet (it stays on disk). For
  `generate`, `templateFiles` names template files that are not lock-clean.

## Review it in the kit

```bash
pnpm protoyard ds kit <id>            # writes or refreshes prototypes/<id>-kit
pnpm protoyard ds kit <id> --check    # exit 4 when the kit is missing or stale
```

The kit prototype shows the whole design system on one page (Texuli's
`DesignSystemKit`): foundations, voice, the allowed components with their
values and states, the library components with their stories, the approval
with its hash check, and the changes since the last release. Re-run `ds kit`
after every change to the design system; never edit the files it owns
(`src/` except `main.ts` and `app.css`).

## Releases and versions

A human records an approved version with `pnpm protoyard ds approve <id> --by
"<name>" --release <semver>` or `pnpm protoyard ds release <id>`
(`releases/<version>.json`, never rewritten). Agents may read them:

```bash
pnpm protoyard ds versions <id> --json
pnpm protoyard ds diff <id> --json              # current document vs the last release
pnpm protoyard ds diff <id> 1.0.0 1.1.0 --json
```

## Locked prototypes

A designer approves a design system with `pnpm protoyard ds approve <id> --by
"<name>"` and a reviewed commit of its `document.json`. That is a human step:
never run it yourself, and no MCP tool does it.

`pnpm protoyard ds use <slug> <id> --lock` binds a prototype to an approved
design-system folder with an `allow` section at its exact version (`"designSystem": { "id", "version",
"locked": true }` in `protoyard.json`). Its generated `AGENTS.md` then says so.
In a locked prototype:

- Build UI only from the Texuli components its `allow` section lists (with the
  variant, size, tone and density values it enables) and its own library
  components, imported as `@ds/<id>/<Name>`. Local code composes them with
  layout utility classes (flex, grid, gap, padding, sizes). `ds validate <id>
  --json` shows the allowed ids; `check ds` fails a component that is not
  allowed (`ds-not-allowed`) or a literal value that is not enabled
  (`ds-disabled-value`).
- Never style controls locally: no raw `<button>`/`<input>`, no visual CSS,
  no inline `style`, no visual utility classes, no other UI library, no local
  motion. `pnpm protoyard check ds <slug>` and `validate` fail on each one.

### When no component fits: stop and ask

Do not invent a component, and do not work around the rules. Stop and ask the
human three things:

1. the component's name (PascalCase, e.g. `StatusPill`);
2. its purpose, in one line;
3. why the existing components do not fit.

Only after they approve, record the request, let a human approve it, then
scaffold it:

```bash
pnpm protoyard ds component request harbor StatusPill --purpose "Shows a ticket status with its label" --why "Badge has no label layout" --by "Ada Example"
pnpm protoyard ds component approve-request harbor StatusPill --by "Bo Example"   # a human runs this
pnpm protoyard ds component new harbor StatusPill
pnpm protoyard ds validate harbor
```

- `request` writes `design-systems/<id>/requests/<Name>.json` (status `open`)
  and no code. It refuses an existing component, a second open request with
  the same name, a flat or unknown design system, and text with control
  characters (`--purpose` at most 280 characters, `--why` at most 1000).
- `approve-request` is for a human. It is a record, not a proof: the CLI
  cannot tell who ran it; the reviewed commit is the guarantee. There is no
  MCP tool for it.
- `new` needs the approved request. It writes `components/<Name>.svelte`
  (Svelte 5 runes, typed props, Texuli components and layout classes only, so
  it passes `check ds`), a draft `components.json` entry with the file's
  sha256, its entry in the document's library, and a kit story stub
  `stories/<Name>.json`. A human approves the reviewed component with
  `ds component approve <id> <Name> --by "<name>"`. It refuses to run from
  inside a prototype folder, for a locked `--prototype <slug>`, and when the
  component already exists.

### Optional: run check ds after each edit

A coding-agent hook can run the check after every edit. This is a
copy-paste example for a host whose hooks file is JSON (for example Claude
Code's `.claude/settings.json`); replace `my-locked-app` with the slug, and
adapt the shape to your host. Protoyard does not install it.

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [{ "type": "command", "command": "pnpm protoyard check ds my-locked-app" }]
      }
    ]
  }
}
```

## Over MCP

`protoyard mcp` has `ds_create`, `ds_list`, `ds_validate`, `ds_export` and `ds_use`, the
same commands with the same checks, plus `ds_component_request`,
`ds_component_new` and `new_from_design_system` (`new --ds`, without
`pnpm install`). Their descriptions repeat the stop-and-ask rule; approving
a request has no tool.

## Limits

- Component defaults (`components.<name>.defaults`) are compiled but not
  applied; tokens are.
- Level-1 player blueprints (decks, pages, docs, apps played without a build)
  do not carry a design system yet; generate the prototype and run `ds use`.
- Remote and `data:` URLs (logos, fonts) are refused: design systems are
  validated as untrusted.
