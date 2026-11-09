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

From a one-line brief (explicit inputs win over the brief):

```bash
pnpm protoyard ds new atlas --brief "brand #4f46e5, font Geist, heading font Fraunces, sharp, comfortable"
```

From an existing theme (a built-in or any library theme):

```bash
pnpm protoyard ds new ocean-ds --from-theme ocean
```

Each writes the folder `design-systems/<id>/` (document, draft approval, component library) and prints the contrast result per
mode. `--dry-run` compiles without writing; `--force` replaces the file. An
imported theme lists what it could not keep exactly as notes (most Protoyard
themes get their `input` and dark `borderStrong` colors raised to 3:1).

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

## In the browser

DevTools → Look → **Open studio** → **Design system** creates one from a name,
a brief, a brand color, fonts, shape, density and motion, from the current
theme, or from pasted JSON, then **Save and apply**. It is kept per prototype
and browser; to put it in the repository, download the JSON and run `ds use`.

## Locked prototypes

`pnpm protoyard ds use <slug> <id> --lock` binds a prototype to an approved
design-system folder at its exact version (`"designSystem": { "id", "version",
"locked": true }` in `protoyard.json`). Its generated `AGENTS.md` then says so.
In a locked prototype:

- Build UI only from the design system's allowed Texuli components and its
  own components, imported as `@ds/<id>/<Name>`. Local code composes them with
  layout utility classes (flex, grid, gap, padding, sizes).
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
  sha256, and a kit story stub `stories/<Name>.json`. It refuses to run from
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

`protoyard mcp` has `ds_create`, `ds_validate`, `ds_export` and `ds_use`, the
same commands with the same checks, plus `ds_component_request` and
`ds_component_new`. Their descriptions repeat the stop-and-ask rule; approving
a request has no tool.

## Limits

- Component defaults (`components.<name>.defaults`) are compiled but not
  applied; tokens are.
- Level-1 player blueprints (decks, pages, docs, apps played without a build)
  do not carry a design system yet; generate the prototype and run `ds use`.
- Remote and `data:` URLs (logos, fonts) are refused: design systems are
  validated as untrusted.
