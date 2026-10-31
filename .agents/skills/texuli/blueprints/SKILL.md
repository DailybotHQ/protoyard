---
name: texuli-blueprints
description: Validate, wrap, edit, paint and hand off untrusted agent blueprints offline — validateDraft, the envelope and its lifecycle, edit history, the player, the agent service, the spec contract, and spec 0.3.0 interaction as data (state, bindings, closed actions, reorder, workflow-graph, migrations). Agents draft, validation gates, the owner activates.
version: "0.3.4"
documentation_url: https://texuli.com/guides/
user-invocable: true
allowed-tools: Bash, Read, Grep, Glob, Edit, Write
metadata: {"openclaw":{"emoji":"▣","homepage":"https://texuli.com/guides/","requires":{"anyBins":["bash","git"]}}}
---

# Blueprints: drafts an agent writes and a host can trust

Use this sub-skill **inside a Texuli monorepo checkout** when an interface
arrives as data: a catalog tree or a blueprint envelope written by an agent, a
person in the builder, or an import. The rule never changes:

**Agents draft, validation gates, the owner activates.** Nothing in this path
activates, publishes, sends or fetches. A blueprint's own claims (its status,
activation or tier) are never trusted.

Everything here is offline. The agent service runs locally against a fake
replay provider; there is no real model provider and no key.

## When to use

| Intent | Stage |
| --- | --- |
| Check untrusted blueprint JSON before showing it | **A** — validate |
| Add provenance, a catalog binding and a lifecycle | **B** — envelope |
| Let a person or agent edit a draft with undo | **C** — edit |
| Paint a validated draft | **D** — player |
| Run the agent service locally, or read its contract | **E** — service |
| Keep the cross-language contract in step | **F** — spec |
| Send a whole working screen as JSON: state, bindings, actions, drag, workflows | **G** — interaction |
| Write or patch a document (a brief, report or notes) as data | **I** — documents |

Building screens by hand stays in [`../build-ui/SKILL.md`](../build-ui/SKILL.md).
Package entries and layers: [`../router/packages.md`](../router/packages.md).

## Rules (always)

1. **Validate first, paint second.** Every blueprint goes through
   `validateDraft` at the tier the **host** chooses: `untrusted` (the default)
   for agent output, `developer` only for trees a person authored in a trusted
   tool.
2. **The developer tier is the agent-emittable ids**, not the whole catalog.
   App chrome needs `renderCatalogFromBuild(catalog, { developer: 'all' })`.
3. **Status comes from the host.** Activation is the host's own control: it
   compares the blueprint digest with what the owner reviewed. Never add an
   activate button inside a painted draft.
4. **No sinks.** Text stays text; every URL passes the untrusted URL policy
   again at paint time.
5. **Fictional data only** in examples and fixtures (`example.com`).

## A — Validate (`@texuli/catalog/validate`)

```ts
import { safeParseBlock } from '@texuli/blocks/core';
import { renderCatalogFromBuild } from '@texuli/catalog/render/renderer';
import { validateDraft } from '@texuli/catalog/validate';

const result = validateDraft(text, { catalog, catalogHash, checkBlock: safeParseBlock });
if (!result.ok) {
  // result.status: 'invalid' | 'parse' | 'over-limits'; result.diagnostics has stable codes
}
```

The checks run in order:
- input: a byte cap before `JSON.parse`;
- envelope: when the input is one (a 0.2.0 envelope is migrated to 0.3.0
  first, then the host's `checkSpec`, if passed, runs);
- structure: prototype keys, depth bombs, unknown node fields;
- interaction: bindings, `bind`, `on` and the closed actions, list item
  text, and the state surface rules (stage G);
- the raw sink scan;
- tree limits;
- the sink-free renderer: ids, tiers, prop schemas and the block family check;
- block schemas;
- composition grammar;
- the frame root.

`result.checks` says what passed, failed or was skipped, for a receipt. Doc:
`packages/catalog/docs/validate.md`.

## B — Envelope (`@texuli/catalog/envelope`)

The versioned envelope (`format: "texuli-blueprint"`, version 1) wraps one tree
with:
- the catalog hash it was written for;
- the generator, `asOf`, `sources`, `trigger` and `meetingRef`;
- a status;
- an edit provenance chain.

`validateDraft` reads envelopes strictly and returns the status validation
**earned**: `validated` when it passes, otherwise `draft`. A declared status,
activation or tier only produces a warning.

The lifecycle is `draft → validated → active → superseded`:
- `activateEnvelope` is for the host's owner flow only. It needs a validated
  envelope and the digest the owner reviewed.
- Any edit makes the envelope a draft again.
- The `portable` profile fails closed until ids are audited portable.

Doc: `packages/catalog/docs/envelope.md`.

## C — Edit (`@texuli/catalog/edit`)

- **Ops:** a closed op set (`insert`, `remove`, `move`, `setProp`,
  `unsetProp`, `replace`, `replaceAll`) addressed by child-index paths, and
  from spec 0.7.0 `patchDocument` (stage I), addressed by path or node `key`.
- **Guarantees:** ops apply all or none, copy-on-write, with exact inverse ops.
- **History:** `createEditHistory` adds undo and redo.
- **Gate:** pass `draftCommitGate` from `@texuli/catalog/validate` so an edit
  that would leave the draft invalid is refused.
- **Provenance:** `recordProvenance` (envelope) writes the steps into the
  envelope's provenance.

Doc: `packages/catalog/docs/edit.md`.

## D — Paint

- **Framework-free core** (`@texuli/catalog/player`):
  - `createPlayer` validates, plans the paint with the untrusted URL policy,
    loads components lazily per id, and turns a failing node into a visible
    placeholder;
  - it holds the closed intent queue: `navigate`, `open-artifact`, `copy`,
    `export` and `request-fullscreen`, which the host confirms;
  - it has no activate method.

  Doc: `packages/catalog/docs/player.md`.
- **Svelte** (`@texuli/player`, L7):

```svelte
<script lang="ts">
  import { Player } from '@texuli/player';
  let { draft } = $props();
</script>

<Player blueprint={draft} tier="untrusted" status="draft" label="Draft preview" />
```

Invalid drafts are refused by default. `invalidPolicy="preview"` shows
placeholders behind a warning, and still offers no activation. Every
agent-emittable id has a painter, including data views, `sortable-list`
and `workflow-graph`; the player runs spec 0.3.0 actions in local state and
reports state and intents through `onStateChange` and `onAction` (stage G). The deck frame
and intent controls are later phases. Doc: `packages/player/README.md`.

On texuli.com (deployed from `main` to Cloudflare Pages), `/builder/`
composes and edits a draft with this player. `/agent-chat/` talks to the
agent service only when a build configures one; the agent service is not
deployed, so run it locally.

## E — Agent service (`apps/agent`, `@texuli/agent`)

A stateless worker that turns a prompt into a validated draft. Detail:
[`references/service.md`](references/service.md).

```bash
pnpm --filter @texuli/agent dev
pnpm --filter @texuli/agent typecheck
```

Its tests run with the app's own Vitest config: from `apps/agent`, run
`pnpm exec vitest run` (the root config does not collect app tests yet).

From `0.6.0` the service has a provider interface with fetch-based
Anthropic Messages and OpenAI-compatible adapters (every setting, the key
included, comes from constructor options) and can stream validated drafts
over server-sent events (`stream: true`). The adapters are tested only
against recorded bytes: no key is configured, no adapter has called a
provider, and nothing is deployed. Choosing a provider and deploying are
developer decisions.

## F — Spec contract (`@texuli/spec`, L0)

- **Source of truth:** the schema-first contract, with a closed JSON Schema
  subset, the catalog vocabulary projected from the built catalog (every
  capability `unknown` until audited), and golden and invalid fixtures.
- **Projections:** deterministic TypeScript and Kotlin, both committed.
- **Validator:** `validateBlueprint` is the target-neutral check. Opt-in
  subpaths: `@texuli/spec/workflow` (`validateWorkflowGraph`),
  `@texuli/spec/migrate` (`migrateBlueprint`) and `@texuli/spec/surface`
  (the state surface rules every validator shares).
- **Goldens:** `fixtures/golden/` holds ten blueprints that must validate
  and paint; a new golden moves the spec digest, so it needs a
  `versions.json` pin and refreshed native traces.

**Coupling:** a catalog manifest change must refresh the spec, or the parity
test fails:

```bash
pnpm exec tsx packages/spec/scripts/bootstrap-catalog.ts
pnpm exec tsx packages/spec/scripts/generate.ts
pnpm vitest run packages/spec
```

Doc: `packages/spec/README.md`. The native Kotlin Multiplatform build in
`native/` consumes the generated Kotlin (in development; its Gradle `check`
is recorded passing in `native/README.md`, and nothing is on Maven Central).

## G — Interaction as data (spec 0.3.0)

New in the `0.4.0` packages; `0.3.0` predates it. Detail and a
validated example: [`references/interaction.md`](references/interaction.md).

- **State and flow** live in the envelope (`state`, `flow`); props read them
  with `{"$state": name}`, and host data with `{"$data": name}` (read-only).
- **Actions are closed:** a node's `on` maps an event the component declares
  to `setState`, `toggleState`, `moveItem`, `flowGo`, `emit` or `submit`.
  `emit` proposes an intent to the host; nothing fetches or navigates.
- **Drag as data:** a `sortable-list` (or `data-board` with `bind.items`)
  binds a list variable; `reorder` sets `group`, `accepts`, `locked` and
  `pull`, and the UI drag offers exactly the moves `moveItem` accepts.
- **Workflows:** a `workflow-graph` node carries a spec workflow graph;
  `mode: "edit"` with `bind.graph` to a `workflow` variable makes it editable.
- **A blueprint that validates paints:** form nodes inside an
  `action-form`, controls bound to declared variables of their type, flow
  nodes matching the flow, no writes to host-bound variables.

```bash
pnpm vitest run packages/player/tests/golden.test.ts
pnpm vitest run packages/player/tests/lego.test.ts
```

## H — Motion and streaming (spec 0.6.0)

New in the `0.6.0` packages; `0.5.0` predates it.

- **Motion is data, never CSS.** A node may carry `motion` with `enter` and
  `exit` presets (`fade`, `rise`, `scale`, `slide-start`, `slide-end`),
  `layout: true`, `stagger` (`none`, `fast`, `base`) and `duration`
  (`fast`, `base`, `slow`); the envelope may set `motion.level` (`full`,
  `subtle`, `none`). Raw CSS, keyframes, milliseconds and unknown names are
  refused (`invalid-motion`); the node still paints, without motion. The
  player plays it through `@texuli/core/motion`, never on the server or on
  hydration, instant under reduced motion; a host caps it with
  `motionLevel`.
- **Streams add speed, not trust.** `<Player stream={source}>` paints each
  node once its shell (everything but `children`) has arrived and passed
  `validateStreamNode`; actions stay disarmed until `validateDraft`
  accepts the complete draft, which stays the only verdict. Write streamed
  nodes with `children` last (`STREAM_NODE_ORDER` in `@texuli/spec/stream`).

```bash
pnpm vitest run packages/catalog/tests/validate-motion.test.ts
pnpm vitest run packages/player/tests/streaming.test.ts
```

## I — Documents (spec 0.7.0)

New in the `0.7.0` packages, the first release of `@texuli/document` and
`@texuli/pages`; `0.6.0` predates it. Detail and the commands:
[`references/documents.md`](references/documents.md).

- **A document is one node.** The root `{"key": "brief", "id": "document",
  "props": {"doc": …}}` carries a Texuli document (`format:
  "texuli-document"`, `formatVersion: 1`, `meta.title`, `blocks`). Its
  blocks reuse the catalog: a `block` wraps a `@texuli/blocks` block
  (`family`, `block`, `props`), checked as `blocks-<family>`; an `embed` of
  kind `component` holds one catalog node (`inline: {id, props}`), checked
  as that id at the same tier. A document never embeds a document.
- **No validator, no document.** `validateDraft` refuses every `document`
  node unless the host passes `checkDocument` (`document-unchecked`);
  `checkDocumentDraft` from `@texuli/pages/host` is the one to pass. The
  player paints a document only through `documentHost`
  (`createDocumentPlayerHost()` from `@texuli/pages/host`).
- **Edit with patches, not rewrites.** `patchDocument` carries at most
  1,000 RFC 6902 operations for the node's `doc`, addressed by `key`; put a
  `test` first so a stale patch fails instead of overwriting.
- **Keys** (`^[A-Za-z0-9._:-]{1,64}$`) are unique in the tree
  (`duplicate-key`); streaming and patches address nodes by them.

```bash
pnpm vitest run packages/catalog/tests/validate-document.test.ts
pnpm vitest run packages/catalog/tests/edit-document.test.ts
pnpm vitest run packages/tools/tests/document.test.ts
```

## J — Forms, canvases, sheets, dashboards and data sources (spec 0.8.0)

New in the `0.8.0` packages, the first release of `@texuli/forms`,
`@texuli/canvas` and `@texuli/sheets`; `0.7.0` predates it. Each shape is
documented in its package (`packages/forms/docs/`, `packages/canvas/docs/`,
`packages/sheets/docs/`, `packages/data/docs/data-dashboard.md`,
`packages/spec/docs/source.md`).

- **One node each.** A `schema-form` node's `schema` is a closed form
  schema (named formats only, never a pattern; conditions and rules are
  `@texuli/core/expression` trees); a `canvas` node's `canvas` prop and a
  `spreadsheet` node's `sheet` prop carry their package's format (the id is
  `spreadsheet`: `sheet` is the texuli drawer); a `data-dashboard` holds
  `data-dashboard-widget` children only (unique `widgetId`, at most 200).
- **No validator, no node.** `validateDraft` refuses `schema-form`,
  `canvas` and `spreadsheet` nodes unless the host passes `checkForm`,
  `checkCanvas` and `checkSheet` (`form-unchecked`, `canvas-unchecked`,
  `sheet-unchecked`); the player paints them only through `formHost`,
  `canvasHost` and `sheetHost` (`createFormPlayerHost()`,
  `createCanvasPlayerHost()`, `createSheetPlayerHost()`).
- **Data is named, never fetched.** A sourceable prop may read
  `{"$source": name, "query": {...}}` from a source the host registered;
  without the host's sources every binding is refused (`source`,
  `unknown-source`). Never put a URL or code in a blueprint.

```bash
pnpm vitest run packages/catalog/tests/validate-form.test.ts
pnpm vitest run packages/catalog/tests/validate-canvas.test.ts
pnpm vitest run packages/catalog/tests/validate-sheet.test.ts
pnpm vitest run packages/catalog/tests/validate-dashboard.test.ts
pnpm vitest run packages/catalog/tests/validate-source.test.ts
```
