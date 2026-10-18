# Agent Console

A simulated agent platform: define agents (instructions, tools, model), try them in a
playground with a live step trace and approvals, browse run history, evaluate agents
against pass/fail datasets and watch usage and estimated cost.

**Everything is simulated.** Plans, tool calls and answers come from the deterministic
runner in `@protoyard/ai` and its fictional tools (`search`, `calendar.lookup`,
`crm.lookup`, `code.run`, which never executes code). No model provider is called, and
token counts and costs are estimates, not billing.

```bash
pnpm protoyard new my-agents --template agent-console
pnpm protoyard dev my-agents
```

## Screens

| Route | What it does |
| --- | --- |
| `#/` | Agents as cards: model, tools (and which need approval), run count, last evaluation |
| `#/agents/:id` | Definition, edit/delete, and the playground: prompt → live step timeline → approve / reject / cancel → rich answer with usage |
| `#/runs` | Every playground and evaluation run, filterable by agent, status and source |
| `#/runs/:id` | The full step trace (plan, tool calls, approvals, results, failures, answer) with inputs/outputs and usage |
| `#/evaluations` | Datasets with the latest pass rate |
| `#/datasets/:id` | Cases (prompt + expected tool and/or text), add/remove, run an evaluation, per-case verdicts with reasons and links to traces |
| `#/usage` | Runs, tokens, cost and eval pass rate; runs per day; usage by agent and by model |

## How it works

- `src/domain/agents.ts` is the engine shared by the playground, evaluations and the
  generator: `startAgentRun` (enabled tools only, approval wrappers), `runUnattended`,
  `usageFor` (integer micro-dollars from the model price), `composeAnswer` and the pure
  `judgeCase`.
- `src/domain/services.ts` holds every mutation (policy → zod → `environment.run` →
  transaction): agents, playground runs, datasets and evaluations. Deleting an agent removes
  its runs, datasets and evaluations atomically.
- **Determinism.** Evaluation case runs use the id `eval:<dataset>:<case>`, so running a
  dataset again with the same agent and environment reproduces the same traces and verdicts.
  Seeded history is produced by the same runner during scenario generation.
- **Environment.** Starting a run goes through `environment.run('agents.run')`, so offline
  mode fails before anything starts. Each tool call goes through
  `environment.run('ai.agent.tool.<name>')`, so DevTools failures (for example
  `failureScope: ['ai.agent.tool.']`) appear as failed steps in the trace.
- Answers render with `RichAnswer` from `@protoyard/ai-ui` (a safe markdown AST, never
  `{@html}`).

## Scenarios

| Id | Situation |
| --- | --- |
| `empty` | Fresh workspace, no agents: every empty state |
| `active` | Three agents, a month of runs, datasets and evaluations (owner) |
| `member` | A builder: can create and run agents and evaluate, cannot delete agents |
| `viewer` | Read-only stakeholder: traces and dashboards only |
| `tool-outage` | Healthy history, but every new tool call fails |

Roles are a simulation for UX, not security.

## Tests

```bash
pnpm vitest run templates/agent-console
pnpm --filter @protoyard-template/agent-console typecheck
pnpm protoyard validate agent-console --build
```

Generator determinism and integrity for every scenario; traces; the judge and usage math;
and services on the real runtime (persistence across reload, validation, playground
approve/reject/cancel, viewer and builder permissions, offline and tool outages,
deterministic evaluations, cascading deletes).
