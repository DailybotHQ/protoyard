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

A second run fills the template with three variants and runs the task's own
`protoyard quick … --variants 3 --out analysis_results/prototypes/<slug>`
line, with its plan-relative paths resolved, plus `--screenshot`. It checks:

- the JSON envelope (`ok`, `command: "quick"`) and three distinct,
  deterministic variants (`v1`–`v3`), each with a launcher, and the
  `compare.html` page;
- a rerun of the same command gives the same base hash and the same variant
  ids, labels and hashes;
- a recorded screenshot result. With Chromium available, the real player is
  captured once per blueprint at 1280×800 and the PNGs are listed in
  `quick.json`. Without it, the run still passes and `quick.json` records the
  skip (`playwright-unavailable` or `browser-unavailable`); the browser
  evidence file says which happened;
- every artifact (envelope, exploration, rerun, browser evidence, decision)
  stays under the plan's `analysis_results/prototypes/`.

Run the fixture with:

```bash
pnpm vitest run tests/integration/dwp-loop.test.ts
```

## Isolation

The loop may write only the temporary plan's evidence. A third suite,
[`tests/integration/dwp-loop-isolation.test.ts`](../tests/integration/dwp-loop-isolation.test.ts),
checks each boundary directly instead of relying on convention:

- **The runner keeps the task in scope.** `planQuickArgs` reads the filled
  task's `protoyard quick` line, and `resolvePlanScoped` resolves its paths:
  the output strictly inside `analysis_results/prototypes/`, the input inside
  the plan. Before anything runs, it refuses a `..` traversal, an absolute
  path, the plan root, and a link inside the evidence folder whose real path
  leaves it. A refused task writes nothing.
- **The CLI refuses out-of-scope output on its own.** Even with
  `--allow-external-out`, `quick --out` refuses `prototypes/`, `templates/`,
  the workspace root, a traversal into them, a folder it did not create, and
  a link, with `unsafe_path` (exit 2). An invalid input fails with
  `validation`. In every case the fixture workspace is byte-for-byte unchanged.
- **A successful run writes only evidence.** Every file it creates is under
  `analysis_results/prototypes/<slug>/`. No shared `.protoyard/quick/` zone
  is created (an `--out` exploration is self-contained), `prototypes/` and
  `templates/` stay empty, and no temp or staging files are left.
- **Cleanup on success and failure.** `withDwpLoopFixture` removes the
  temporary workspace after the loop succeeds, after a later step throws, and
  after the task is refused. No fixture folder is left in the OS temp
  directory.
- **The host is unchanged.** The repository's Git status is the same before
  and after the suite.

```bash
pnpm vitest run tests/integration/dwp-loop-isolation.test.ts
```

This is simulated local evidence. It does not measure production behavior,
contact a network service, or promote an exploration into `prototypes/`.
Promotion requires a separate, human-approved Protoyard task.
