# @protoyard/flows

The framework-agnostic workflow engine for Protoyard
([ADR-041](../../docs/DECISIONS.md)). A flow is plain, serializable data: how
a run starts, the steps it takes and what it keeps. Conditions are a closed,
data-only rule AST. No flow can hold executable JavaScript, a URL, headers or
a credential, so a flow can never run code or reach a network on its own.

> **Status:** the model (`@protoyard/flows/model`) and the deterministic mock
> runtime (`@protoyard/flows/runtime`) are available. The Svelte editor and
> run panels are in [`@protoyard/flows-ui`](../flows-ui/README.md).

## The model

```ts
import { applyOperations, findRecipe, parseFlow } from '@protoyard/flows';

const flow = findRecipe('approval-request')!.build({ id: 'expense-approvals' });
const parsed = parseFlow(JSON.parse(untrustedJson)); // { ok, flow?, diagnostics }
const edited = applyOperations(flow, [{ op: 'set_status', status: 'active' }]);
```

| Part | What it holds |
| --- | --- |
| `Flow` | `{ formatVersion: 1, id, name, description?, status, triggers, steps, collections?, lists?, labels? }` |
| Triggers | `schedule` (days, `HH:MM`, zone, every N weeks), `manual` (label, who, surfaces, command), `event` (name, source, filter condition), `webhook` (event type and a sample payload; never a secret) |
| Steps | `ask`, `approval`, `group_people`, `wait`, `wait_until`, `branch` (`when` / `then` / `otherwise`), `message`, `reply`, `assistant`, `save_record`, `get_records`, `set_state`, `pick_from_list`, `update_list`, `call_tool` (a tool id the prototype registers with its service adapter), `start_flow`. Every step can carry `label`, `enabled`, an `only` condition and `delayMinutes`. `STEP_KINDS` lists each type's label, category, output and whether it produces an effect. |
| References | `DataRef`: `{ from: 'trigger' \| 'record', path? }` or `{ from: 'step', stepId, path? }`. A path is a list of plain segments, and only own properties are read. Text is a string or parts mixing strings and `{ ref }`. |
| Conditions | `compare` (`eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `contains`, `not_contains`, `starts_with`, `ends_with`, `in`, `not_in`), `test` (`exists`, `missing`, `empty`, `not_empty`, `true`, `false`), `all` / `any` / `not`, and `judge` (a phrase decided by an injected `FlowJudge`) |
| Operations | `update_flow`, `set_status`, `add_trigger`, `replace_trigger`, `remove_trigger`, `add_step`, `update_step`, `remove_step`, `move_step`, `duplicate_step`, `add_question`, `remove_question`, `upsert_collection`, `remove_collection`, `upsert_list`, `remove_list` |
| Recipes | `daily-check-in`, `approval-request`, `incoming-triage`, `weekly-digest`, `rotating-host` (`FLOW_RECIPES`, `findRecipe`) |

### Evaluating conditions

`evaluateCondition(condition, { trigger, outputs, record }, { judge? })` is
pure. It returns `pass`, `fail` or `needs_judgment` with the undecided
phrases. The logic is three-valued: `all` fails on any failure and `any`
passes on any pass, whatever the undecided parts say. Numbers and numeric
strings compare as numbers, and text compares case-insensitively unless
`caseSensitive` is set. `describeCondition` reads a condition as plain English.

### Validation

`parseFlow(input)` runs three stages:

1. `inspectPlainData` walks the input without recursion. It rejects functions,
   symbols, class instances, accessors, non-finite numbers and
   `__proto__` / `constructor` / `prototype` keys, along with anything over the
   size caps.
2. The strict zod schema runs next, and unknown keys fail.
3. `validateFlow` reports what a schema cannot express. Each diagnostic has a
   severity, a code, a path such as `steps[1].then[0].text` and a step id. The
   checks:
   - duplicate ids;
   - references to unknown steps, or to steps that have not certainly run yet
     (a step inside a branch arm is not available after the branch);
   - unknown collections, states and lists;
   - choice questions with fewer than two options;
   - `wait_until` with no time or event.

   Warnings cover empty branches, a flow that starts itself, record reads with
   no collection, and an active flow with nothing enabled.

`applyOperations` is atomic. It validates the operations as untrusted input,
applies them to a copy, and keeps the result only if the result parses. On
failure it returns the original flow, the diagnostics and the failing
operation index. Copies get deterministic ids (`step-copy`, `step-copy-2`, …).

### Limits (`FLOW_LIMITS`)

| Limit | Value |
| --- | --- |
| Steps (nested included) | 200 |
| Branch depth | 8 |
| Triggers | 8 |
| Condition depth / parts | 6 / 64 |
| Questions / choices | 30 / 20 |
| Audience entries | 50 |
| Collections / states / lists / list items | 10 / 20 / 10 / 200 |
| Path segments | 8 |
| Operations per batch | 200 |
| Raw depth / values / string length | 48 / 50,000 / 4,000 |

## Mock runtime

```ts
import { findRecipe, runFlow } from '@protoyard/flows';
// or: import { runFlow } from '@protoyard/flows/runtime';

const flow = findRecipe('approval-request')!.build({ id: 'expense-approvals' });
const result = runFlow(flow, {
  now: '2026-03-15T10:00:00.000Z',
  seed: 1,
  trigger: { summary: 'Laptop for Ada Example' },
  decisions: { approve: 'approved' },
});
// result.run.status === 'done'
// result.effects  → proposed writes for a service adapter
// result.outbox   → masked delivery log (no network)
// result.keeps    → records + lists the run produced
// result.signals  → waiting / approval / failed attention items
```

| Piece | Role |
| --- | --- |
| `runFlow(flow, options)` | One-shot execution; pure w.r.t. inputs (same flow + options → identical result) |
| `createFlowRuntime(defaults)` | Binds people, tools, seed; each `.run` still takes overrides |
| `now` / `seed` | Injected clock and deterministic picks (no `Date.now` / `Math.random`) |
| `answers` / `decisions` | Mock people replies for `ask` / `approval`; missing values leave `waiting` |
| `tools` | Local handlers only — never `fetch` |
| `maskUrl` | Host kept; deep path segments and query values become `••••` |
| `attentionOf` | Open signals ordered for a runs/attention UI |

`wait` advances the mock clock; `wait_until` (except `time`) leaves the run
waiting. Branch arms use `evaluateCondition`. Assistant steps return scripted
local results from the task + seed. Nothing is sent to a network.

## Honest limits

- Every trigger and effect is a simulation. A schedule fires from the simulated
  clock, and `message`, `assistant` and `call_tool` steps become proposed
  effects for a service adapter. Nothing is sent anywhere.
- `judge` conditions are never decided by the model itself. Without an
  injected judge they stay `needs_judgment`.
- The runtime does not persist rows. A prototype service carries `effects` and
  `keeps` through `session.assert` → zod → `environment.run` → `db.transaction`.

## Tests

```bash
pnpm vitest run packages/flows/tests/model.test.ts
pnpm vitest run packages/flows/tests/runtime.test.ts
pnpm --filter @protoyard/flows typecheck
```
