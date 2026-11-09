# Design systems

A design system is a first-class entity in a Protoyard workspace
([ADR-047](DECISIONS.md#adr-047--design-systems-are-first-class-workspace-entities)):
a folder with a Texuli design-system document, an approval record, its own
components and the requests for new ones. A workspace can hold many. Each
prototype names the one it uses, and a **locked** prototype can only draw its
UI with that design system.

This guide covers the whole loop, every file and its schema, and the limits.
How a document compiles and paints, and the full `check ds` rules, are in
[THEMES](THEMES.md#design-systems).

## The loop

| Step | How | Status |
| --- | --- | --- |
| 1. Create | `pnpm protoyard ds new <id>` from a brief, a few inputs or a theme | Works |
| 2. Review in a kit | Open the design system's UI kit and review every component | Planned (kit task); today review the document with `ds validate` and a prototype that uses it |
| 3. Approve | A designer writes `approval.json` and commits it for review | Works as a file; a `ds approve` command is planned |
| 4. Create locked prototypes | `pnpm protoyard ds use <slug> <id> --lock` | Works |
| 5. Request components | `ds component request`, `approve-request`, `new` | Works |
| 6. Upgrade | Approve a new version, then `ds use <slug> <id> --upgrade` | Works |

### 1. Create

```bash
pnpm protoyard ds new harbor --name Harbor --brand '#0f766e' --font Inter --shape rounded --density compact
pnpm protoyard ds validate harbor
```

`ds new` writes the folder `design-systems/harbor/` with a draft approval and
an empty component library. `ds validate` checks the document as untrusted
input, compiles it, reports contrast per mode, the `contentHash`, the approval
status, whether it can be locked, and any drift between `components.json` and
`components/*.svelte`. Every way to create one (`--brief`, `--from-theme`,
`--from-theme-file`) is in [THEMES](THEMES.md#design-systems). A flat
`design-systems/<id>.json` from before the folder layout becomes a folder with
`pnpm protoyard ds migrate <id>`.

### 2. Review

Planned: a generated UI kit prototype per design system, where a designer
reviews every allowed component and the design system's own components with
their stories. Until it lands, review the document itself (`ds validate`, `ds
export --format css`) and a prototype that applies it with `ds use` (without
`--lock`).

### 3. Approve

There is no `ds approve` command yet. A designer approves a version by writing
`design-systems/<id>/approval.json`:

```json
{
  "status": "approved",
  "version": "1.0.0",
  "approvedBy": "Ada Example",
  "approvedAt": "2026-11-09T12:00:00.000Z",
  "contentHash": "<the contentHash that ds validate --json prints>"
}
```

`version` must equal the document's `version`, and `contentHash` must equal
the hash of the document as it is now. Commit it in a change a human reviews.

**An approval is a record, not a proof.** The CLI cannot tell who wrote the
file. The guarantee is the reviewed commit; protect `design-systems/` with
CODEOWNERS so a designer has to approve every change there.

### 4. Create locked prototypes

```bash
pnpm protoyard new harbor-orders --template dashboard
pnpm protoyard ds use harbor-orders harbor --lock
pnpm protoyard validate harbor-orders --build
```

`--lock` writes `"designSystem": { "id": "harbor", "version": "1.0.0",
"locked": true }` into the prototype's `protoyard.json`. It refuses a flat
document, a draft, an approval for another version and a document that changed
after its approval. A locked prototype loads only that design system's theme,
and `check ds` and `validate` fail on raw controls, visual CSS, inline styles,
visual utility classes, other UI libraries and local motion
([Locked design systems](THEMES.md#locked-design-systems),
[check ds](THEMES.md#check-ds)).

### 5. Request components

When no component fits, an agent stops and asks the human; then:

```bash
pnpm protoyard ds component request harbor StatusPill --purpose "Shows a ticket status with its label" --why "Badge has no label layout" --by "Ada Example"
pnpm protoyard ds component approve-request harbor StatusPill --by "Bo Example"
pnpm protoyard ds component new harbor StatusPill
```

Prototypes import it as `@ds/harbor/StatusPill`. The steps, what each writes
and refuses, are in
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

## Folder layout and contracts

```text
design-systems/
  harbor/                  a folder: can be approved and locked
    document.json          the Texuli design-system document
    approval.json          the approval record
    components.json        the design system's own components
    components/*.svelte
    requests/<Name>.json   component requests
    stories/<Name>.json    the kit story of each component
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
| `document.json` | `texuli/design-system` | Texuli's spec | (Texuli) | `ds new`, `ds migrate`, by hand |
| `approval.json` | `{ status, version, approvedBy?, approvedAt?, contentHash? }` | `urn:protoyard:design-system:approval:1` | `approval.schema.json` | `ds new` and `ds migrate` (draft), a designer (approved) |
| `components.json` | `protoyard/ds-components`, version 1 | `urn:protoyard:design-system:components:1` | `components.schema.json` | `ds new`, `ds component new` |
| `requests/<Name>.json` | `protoyard/ds-component-request`, version 1 | `urn:protoyard:design-system:component-request:1` | `component-request.schema.json` | `ds component request`, `approve-request` |
| `stories/<Name>.json` | `protoyard/ds-story`, version 1 | `urn:protoyard:design-system:story:1` | `story.schema.json` | `ds component new` |
| `releases/<version>.json` | `protoyard/ds-release`, version 1 | `urn:protoyard:design-system:release:1` | `release.schema.json` | Planned: nothing writes it yet |
| `bundle.json` in an exported bundle | `protoyard/ds-bundle`, version 1 | `urn:protoyard:design-system:bundle:1` | `bundle.schema.json` | Planned: nothing writes it yet |

- The `$id`s are URNs: they name a contract and do not point at a hosted URL.
- The release record and the bundle manifest are draft contracts for planned
  tasks. They can change until a command writes them.
- The schema files live in the repository. The npm package carries the same
  contracts as the zod schemas in its code, not as separate `.json` files.
- `contentHash` is the SHA-256 of the document's canonical JSON (sorted keys,
  no whitespace) without the approval section or fields, the scheme Texuli
  adopts for its 0.13.0 document spec.
- Planned with Texuli's document spec 0.13.0 (not on npm yet): the allow set,
  the library entries and the approval move into the document itself. The
  schemas sit in one module so that move changes one place.

The manifest binding is part of the prototype contract in `@protoyard/core`:
`designSystem: { id, version, locked }`, where `id` is the design system's id
(also its theme id), `version` an exact semver and `locked` defaults to
`false`.

## Commands

| Command | What it does |
| --- | --- |
| `ds new <id>` | Create a design system folder (or a flat file with `--out`) |
| `ds validate <id\|file>` | Validate and compile; report approval, lockability and component drift |
| `ds migrate <id>` | Turn a flat document into a draft folder |
| `ds export <file>` | CSS variables, a Tailwind preset or compiled JSON |
| `ds use <slug> <id\|file> [--lock] [--upgrade]` | Apply a design system to a prototype; bind, lock or upgrade it |
| `ds component request\|approve-request\|new` | Request, approve and scaffold a component |
| `check ds [slug…] [--report]` | The locked-prototype rules |

Every command takes `--json`. The MCP server exposes `ds_create`,
`ds_validate`, `ds_export`, `ds_use`, `ds_component_request` and
`ds_component_new` ([MCP](MCP.md#tools)); there is no approval tool, on
purpose.

## Planned

These are not available today:

- **UI kit**: a generated kit prototype per design system for review.
- **`ds approve`**: a command that writes `approval.json` with the current
  version and `contentHash`.
- **Versions**: release records (`releases/<version>.json`) so older
  versions stay available to pinned prototypes.
- **Bundle**: an exported, hash-listed design-system bundle (`bundle.json`) to
  share a design system between workspaces.
- **Render check**: rendering every component of a locked prototype against
  the design system in a browser.
- **Generator inputs**: `protoyard generate` and `quick` taking a design
  system so new prototypes start locked.

## Limits

- An approval is a record, not a proof; the reviewed commit is the guarantee.
- Only a folder can be approved and locked; a flat document cannot.
- `check ds` is a static, textual scan; see its limits in
  [THEMES](THEMES.md#check-ds).
- A workspace's design systems are local files. Nothing is hosted, shared or
  synchronized; a cloud version is a later step.
