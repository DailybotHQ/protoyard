---
name: texuli-blueprints
description: Validate, wrap, edit, paint and hand off untrusted agent blueprints offline — validateDraft, the envelope and its lifecycle, edit history, the player, the agent service, the spec contract, and spec 0.3.0 interaction as data (state, bindings, closed actions, reorder, workflow-graph, migrations). Agents draft, validation gates, the owner activates.
version: "0.2.3"
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
  `unsetProp`, `replace`, `replaceAll`) addressed by child-index paths.
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

There is no real provider, no key and no deployment. Choosing a provider and
deploying are developer decisions.

## F — Spec contract (`@texuli/spec`, L0)

- **Source of truth:** the schema-first contract, with a closed JSON Schema
  subset, the catalog vocabulary projected from the built catalog (every
  capability `unknown` until audited), and golden and invalid fixtures.
- **Projections:** deterministic TypeScript and Kotlin, both committed.
- **Validator:** `validateBlueprint` is the target-neutral check. Opt-in
  subpaths: `@texuli/spec/workflow` (`validateWorkflowGraph`),
  `@texuli/spec/migrate` (`migrateBlueprint`) and `@texuli/spec/surface`
  (the state surface rules every validator shares).
- **Goldens:** `fixtures/golden/` holds nine blueprints that must validate
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
