# DeepWorkPlan integration

Protoyard's DeepWorkPlan integration is an optional, local-only addon packet
under [`integrations/deepworkplan/protoyard/`](../integrations/deepworkplan/protoyard/).
Protoyard remains independent of DeepWorkPlan: the addon invokes the public CLI
as a separate process and does not add a runtime or package dependency.

## Exploration loop

The integration loop creates a disposable plan workspace, applies the
[exploration task template](../integrations/deepworkplan/protoyard/templates/EXPLORATION_TASK.md),
and runs `protoyard quick` with a bounded input, stable seed, and optional
variants. Generated blueprints, variant folders, browser evidence, metrics,
and reports stay below the plan's `analysis_results/prototypes/` directory.
The temporary workspace is removed after the integration fixture completes.

The fixture at
[`tests/integration/fixtures/dwp-loop-plan.ts`](../tests/integration/fixtures/dwp-loop-plan.ts)
provides the plan and a small local player asset set. Its runner
([`tests/integration/dwp-loop.test.ts`](../tests/integration/dwp-loop.test.ts))
proves that:

- the task template is filled without unresolved placeholders;
- repeated generation with the same blueprint, seed, and variant count has
  identical blueprint hashes and variant order;
- validation metrics produce the local `report.json` and `REPORT.md` outputs;
- unavailable browser evidence is recorded explicitly as
  `playwright-unavailable`, not treated as a successful screenshot check; and
- the repository source tree has the same Git status before and after the loop.

Run the fixture with:

```bash
pnpm vitest run tests/integration/dwp-loop.test.ts
```

This is simulated local evidence. It does not measure production behavior,
contact a network service, or promote an exploration into `prototypes/`.
Promotion requires a separate, human-approved Protoyard task.
