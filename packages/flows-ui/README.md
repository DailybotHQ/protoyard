# @protoyard/flows-ui

Accessible Svelte 5 workflow editing and simulation panels for
[`@protoyard/flows`](../flows/README.md). The editor updates a serializable
`Flow` through the engine's validated `applyOperations` contract. Test runs
use the deterministic local runtime and show proposed keeps and a masked
outbox; they never contact people, tools or network services.

The step-order canvas and read-only run traces use `WorkflowEditor` and
`WorkflowViewer` from the published `@texuli/workflows` package. The graph
adapter represents the flow's top-level step sequence; branch conditions and
nested steps remain in the original `Flow` data and continue through its strict
schema and operation validator. Dragging or reconnecting the sequence produces
validated `move_step` operations. The run panels keep their Protoyard-specific
result, keeps and masked delivery details around Texuli's graph view.

## Lazy imports

Import only the screen you use so unrelated panels stay out of the initial
chunk:

```ts
const { FlowEditor } = await import('@protoyard/flows-ui/editor');
const { RunPanel } = await import('@protoyard/flows-ui/runs');
const { KeepsPanel } = await import('@protoyard/flows-ui/keeps');
const { OutboxPanel } = await import('@protoyard/flows-ui/outbox');
```

Import `@protoyard/flows-ui/styles.css` after Tailwind and the Protoyard theme
styles so the package's utility classes are included.

## Editor

`FlowEditor` accepts a `flow: Flow` and an `onChange(flow, operations)`
callback. It edits the flow name and status, trigger fields, step labels and
enabled state, common message/reply/approval content, simulated wait duration,
and conditions. Conditions use the bounded, data-only JSON AST from
`@protoyard/flows/model`; edits pass through `applyOperations`, so invalid
changes leave the last valid flow intact and show validation diagnostics.
Trigger removal, including removal of the last required trigger, is also
validated and reported. Every trigger and step also has an advanced JSON editor
validated by the strict `TriggerSchema` or `StepSchema`, so fields outside the
common form controls remain editable without accepting executable expressions
or unknown keys.

```svelte
<FlowEditor {flow} onChange={(next) => (flow = next)} />
```

The callback is the persistence seam. A consuming prototype should put
durable changes behind its own session, schema, environment and transaction
service; the component itself owns no database.

## Runs, keeps and outbox

`RunPanel` runs the flow with `runFlow` by default. Pass `runtimeOptions` for
deterministic sample input, or `onRun` to route execution through an app-owned
service. `onResult` exposes the returned result so the other panels can render
the same snapshot:

```svelte
<RunPanel {flow} runtimeOptions={{ now: '2026-03-15T10:00:00.000Z', seed: 7 }} {onResult} />
<KeepsPanel result={lastResult} />
<OutboxPanel items={lastResult?.outbox ?? []} />
```

The run button disables while an asynchronous callback is pending and reports
callback failures. Runs are simulated; outputs are previews, not durable writes.
`KeepsPanel` shows records and list changes. `OutboxPanel` renders text and
already-masked URLs as inert text, never as links.

## Tests

```bash
pnpm vitest run packages/flows-ui/tests
pnpm --filter @protoyard/flows-ui typecheck
```

The package's individual editor and panel subpaths remain separate for lazy
loading. `pnpm build:packages --filter svelte` includes its distributable ESM,
declarations and Svelte files under `dist/`.
