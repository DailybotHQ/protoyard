# Interaction as data (spec 0.3.0)

A blueprint can carry a whole working screen as JSON: local state, flows,
two-way bindings, a closed action set, drag as data and workflow graphs.
Nothing in it is evaluated. **New in `0.4.0`:** spec 0.3.0, its catalog groups
and the player's interaction ship in the `0.4.0` packages, not in `0.3.0`
(`@texuli/spec@0.3.0` carries spec 0.2.0; `@texuli/spec@0.4.0` carries spec
0.4.0).

Contract in depth: `packages/spec/docs/contract.md`. Validated, painted
examples: `packages/spec/fixtures/golden/` (`app-dashboard`, `mobile-flow`,
`sortable-board`, `workflow-builder`, `lego`).

## A stateful envelope

This envelope validates on `validateBlueprint` and on `validateDraft` at the
untrusted tier (fictional data):

```json
{
  "format": "texuli-blueprint",
  "version": 1,
  "spec": "0.3.0",
  "id": "sprint-board-example",
  "catalog": "6389ff8dfd63e2b2e7cf5986be9f82fd72a3256e9e86fe634d066bbcd640ddd2",
  "status": "draft",
  "createdAt": "2026-10-27T09:00:00Z",
  "updatedAt": "2026-10-27T09:00:00Z",
  "generator": { "kind": "agent", "name": "Harbor assistant" },
  "state": {
    "showDone": { "type": "boolean", "initial": true },
    "todo": {
      "type": "list",
      "maxItems": 20,
      "initial": [
        { "id": "t-copy", "label": "Write launch copy" },
        { "id": "t-legal", "label": "Legal review" }
      ]
    },
    "done": { "type": "list", "initial": [{ "id": "t-beta", "label": "Ship the beta" }] }
  },
  "tree": {
    "id": "layout-page",
    "props": { "title": "Sprint board" },
    "children": [
      { "id": "control-toggle", "props": { "label": "Show done", "state": "showDone" } },
      {
        "id": "layout-split",
        "props": { "ratio": "1:1" },
        "children": [
          {
            "id": "sortable-list",
            "props": {
              "label": "To do",
              "reorder": { "bind": { "$state": "todo" }, "group": "tasks", "locked": ["t-legal"] }
            },
            "on": { "move": [{ "op": "emit", "intent": "card-moved", "values": { "list": "todo" } }] }
          },
          {
            "id": "sortable-list",
            "props": {
              "label": "Done",
              "reorder": { "bind": { "$state": "done" }, "group": "tasks", "accepts": ["tasks"] }
            }
          }
        ]
      }
    ]
  }
}
```

The two lists share the group `tasks`; `Done` also lists it in `accepts`,
so cards move both ways, `t-legal` never moves, and every move from `To do`
emits `card-moved` to the host.

## The parts

| Part | Shape | Rules |
| --- | --- | --- |
| `spec` | `"0.3.0"` | Omitted means 0.2.0; `migrateBlueprint` (`@texuli/spec/migrate`) stamps it, purely |
| `state` | name → `{ type, initial?, … }` | At most 64 variables named like `showDone`. Types: `boolean`, `number` (`min` ≤ `max`), `enum` (`values`), `string` (`maxLength` ≤ 1000), `list` (items `{ id, …scalar fields }`, `maxItems` ≤ 500), `workflow` (a workflow graph). A `source` (host data name) makes a scalar read-only to the blueprint |
| `flow` | `{ views, initial, transitions }` | 1–16 views; transitions `{ from (a view or *), to, on, when? }`; `flow-view` shows only the current view; `flow-action` fires an event |
| Bindings | `{"$state": name}`, `{"$data": name}` | Exactly one key. `$state` reads a declared variable at any depth in props; `$data` reads host data, read-only, only as a whole top-level prop |
| `bind` (node) | prop → `{"$state": name}` | Two-way; only props the component lists as `bindable`, not also set in `props`, to a writable variable that fits |
| `on` (node, the eventMap) | event → 1–8 actions | Events: `press`, `change`, `select`, `submit`, `dismiss`, `move`, and only those the component declares |
| `reorder` (a container prop) | `{ bind, axis?, group?, accepts?, locked?, pull?, disabled? }` | Items are the bound list; `pull` is `move`, `clone` or `none`; a target takes a source's items when it shares or `accepts` its group |
| `workflow-graph` (a node) | `label`, `graph`, `mode` (`view` or `edit`), `flow` (`LR` or `TB`) | `graph` is a spec workflow graph (closed node types and ports, ≤ 500 nodes, ≤ 2,000 edges, a cycle policy); bind `graph` to a `workflow` variable to edit it |

## The closed actions

| `op` | Fields | Does |
| --- | --- | --- |
| `setState` | `state`, `value` or `fromEvent: "value"` | Sets a writable scalar (`fromEvent` only on `change` or `select`) |
| `toggleState` | `state` | Flips a writable boolean |
| `moveItem` | `from`, `item`, `to?`, `index?` | Moves (or, with `pull: "clone"`, copies with a fresh id) between writable lists; refuses locked items and full lists |
| `flowGo` | `event` | Fires a flow transition |
| `emit` | `intent`, `values?` | Proposes a named intent to the host's `onAction` with ≤ 32 scalar or `$state` values; the player sends nothing itself |
| `submit` | none | Submits the enclosing `action-form` |

Anything else (`fetch`, `navigate`, an extra field) is refused.

## A blueprint that validates paints

The spec, `@texuli/catalog`'s `validateDraft` and the Kotlin twin share the
player's state surface rules (`@texuli/spec/surface`):
- `form-field` and `form-submit` sit inside an `action-form`; forms never nest;
- a control (`control-toggle`, `-choice`, `-slider`, `-filter`) or a field
  names a declared variable of the type it writes;
- `flow-view` names a declared view and `flow-action` an event a transition
  handles; neither appears without a `flow`;
- nothing writes a host-bound variable.

List item strings refuse control, bidirectional and invisible formatting
characters (`SPEC_PATTERNS.listText`).

## Validate it

```ts
import { validateBlueprint } from '@texuli/spec';
import { migrateBlueprint } from '@texuli/spec/migrate';
import { validateWorkflowGraph } from '@texuli/spec/workflow';
import { validateDraft } from '@texuli/catalog/validate';

const { blueprint } = migrateBlueprint(input); // 0.2.0 → 0.3.0; never throws
const spec = validateBlueprint(blueprint, {
  blueprintSchema,
  catalog: components,
  workflowSchema, // only needed for workflow graphs
  validateWorkflowGraph,
});
const draft = validateDraft(blueprint, { catalog: renderCatalog, tier: 'untrusted' });
```

The schemas and catalog are `packages/spec/schemas/*.json` and
`packages/spec/catalog/components.json`. Then paint `draft` with
`<Player>` (stage D): it runs the actions in local state, writes `bind`
props back, gives every `sortable-list` one shared drag scope (a drag
offers exactly what `moveItem` accepts) and paints `workflow-graph` with
`@texuli/workflows`.
