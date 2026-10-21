# DeepWorkPlan integration

Protoyard can serve as an optional validation step inside a
[DeepWorkPlan](https://github.com/DailybotHQ/deepworkplan-skill) (DWP) plan: a
task turns an idea into disposable, playable explorations, compares them, and
records a decision with its evidence in the plan. The integration is an addon
packet under
[`integrations/deepworkplan/protoyard/`](../integrations/deepworkplan/protoyard/).

- **Independent.** Protoyard does not install DeepWorkPlan, and DeepWorkPlan is
  not a dependency of any Protoyard package. The addon calls the public CLI as a
  separate local process and reads its JSON envelope as untrusted input.
- **Optional.** A plan without the addon runs the ordinary DWP flow, and
  Protoyard works without any DWP file. A missing or incompatible CLI is a
  warning, never a plan failure.
- **Packet contents.** [`SPEC.md`](../integrations/deepworkplan/protoyard/SPEC.md)
  is the normative contract, [`SKILL.md`](../integrations/deepworkplan/protoyard/SKILL.md)
  the onboarding and reasoning flow, and
  [`addon.json`](../integrations/deepworkplan/protoyard/addon.json) the descriptor.
  The [`templates/`](../integrations/deepworkplan/protoyard/templates/) folder
  holds the task, the gates, screenshot evidence and the decision report.

The packet targets the DWP `7.8.1` pack vendored in this repository. The
descriptor pins `DailybotHQ/protoyard` at `v1.1.0` with machine interface `1`
([INTERFACE](INTERFACE.md)). Commands below are written as `protoyard …`;
inside the Protoyard repository run them as `pnpm protoyard …`.

## 1. Opt in

1. **Detect, read-only.** The DWP side runs the descriptor's probe with no
   shell, no stdin and a timeout:

   ```bash
   protoyard --version --json
   ```

   It is compatible only when the command exits 0 and prints one JSON object
   whose integer `interface` is `1`. Anything else is reported once as "not
   available", and the plan continues without the addon. Inside a workspace,
   `protoyard doctor --json --offline` lists the capabilities (`quick`,
   `player`, …), but its exit code is never the presence test.
2. **Offer and consent.** Onboarding offers the addon and shows the pinned
   release, what it writes (the registry entry and plan-scoped evidence), and
   that promotion is a separate decision. Only after the developer explicitly
   accepts does it record the entry:

   ```bash
   python3 <dwp>/shared/config.py enable protoyard --version v1.1.0 --repo <repo>
   ```

   Declining writes nothing. Detection never installs a package, changes a
   lockfile or edits Protoyard.

## 2. Plan the exploration task

Write one plan task from the
[exploration task template](../integrations/deepworkplan/protoyard/templates/EXPLORATION_TASK.md).
Fill every placeholder from the plan, not by copy-paste:

- the idea and the one decision question;
- the input, either a bounded brief or a blueprint that passes
  `protoyard blueprint validate`;
- a stable slug and seed;
- the variant count (1–8);
- the criteria;
- a scratch folder under the repository's ignored `tmp/`;
- the evidence folder `<plan>/analysis_results/prototypes/<slug>/`.

Variants change the shell (layout, theme, density, first entity), never the
domain, so ask a presentation or navigation question. A data-model question
needs one exploration per model.

## 3. Run the gates, in order

The [gates template](../integrations/deepworkplan/protoyard/templates/EXPLORATION_GATES.md)
holds the exact approved commands. Gates 1–6 are required, in this order, and a
failed one stops the task: nothing is copied into the evidence folder and the
decision cannot be `adopt`.

| Gate | What it does | Command at its core |
| --- | --- | --- |
| 1. Validate the input | A blueprint must validate; a brief is `not applicable` here, since Gate 3 validates it | `protoyard blueprint validate <file> --json` |
| 2. Snapshot source state | Records `git status` and `git diff` outside the scratch and evidence folders | `git status --porcelain=v1 --untracked-files=all` |
| 3. Run quick | Generates the variants into the scratch folder and checks the envelope (`ok`, hashes, variant count) | `protoyard quick --blueprint <file> --slug <slug> --seed <n> --variants <n> --out <scratch>/<slug> --json` |
| 4. Repeat | The same command into `<slug>-rerun` must give the same base and per-variant hashes, in the same order | the Gate 3 command with `<slug>-rerun` |
| 5. Check confinement | Every output and variant stays inside its quick folder, and the evidence path stays under `analysis_results/prototypes/` | a Node check of both quick folders |
| 6. Confirm no source changes | The Gate 2 snapshots must be unchanged; only then is evidence copied | `diff -u` of before and after |
| 7. Screenshots (optional) | See below | `protoyard quick shot <scratch>/<slug>` |

For every gate the plan records:
- the filled command;
- its exit code;
- the output or snapshot paths;
- `pass`, `fail`, or `not applicable` with a reason.

To open the variants side by side while reviewing, serve the scratch
exploration on a private loopback port:

```bash
protoyard quick serve <scratch>/<slug> --port <port> --strict-port
```

## 4. Optional screenshots

```bash
protoyard quick shot <scratch>/<slug>             # 1280×800 per page
protoyard quick shot <scratch>/<slug> --phone     # also 390×844
```

You can also add `--screenshot` to the Gate 3 command.

- **What it captures.** One PNG per exploration and variant, recorded in the
  exploration's `quick.json`.
- **No browser.** Without Playwright or its Chromium, the run records the skip
  (`playwright-unavailable` or `browser-unavailable`) and exits 0. That skip is
  never a visual pass. A page that does not boot is recorded as
  `capture-failed`.
- **Recording it.** Use the
  [screenshot evidence template](../integrations/deepworkplan/protoyard/templates/SCREENSHOT_EVIDENCE.md).

## 5. Record the decision

Copy only the allow-listed evidence into
`<plan>/analysis_results/prototypes/<slug>/`:
- `blueprint.json`, `quick.json` and each `vN.blueprint.json`;
- the envelopes;
- the screenshots or the skip record.

Then write the
[decision report](../integrations/deepworkplan/protoyard/templates/DECISION_REPORT.md):
- the question, input and seed;
- the selected variant (`v1`…`vN`, or `none`);
- the decision (`adopt`, `iterate` or `discard`);
- one row per variant grounded in a copied evidence file.

A choice without evidence for its criteria is `iterate`, not `adopt`. Remove
the scratch folder afterwards when the repository's policy allows.

## 6. Promote only after a decision

The addon never promotes. A quick exploration is a disposable record, not a
source prototype. Once the decision is `adopt` and the developer approves a
separate task, that task runs the normal Protoyard path and owns the new
prototype's source, tests, build budget and review:

```bash
protoyard quick promote <scratch>/<slug> <new-slug> --variant v2
protoyard validate <new-slug> --build
```

Nothing in the exploration task writes `prototypes/`, package manifests or
lockfiles.

## Evidence boundary

Everything an exploration shows is simulated, local evidence:
- fictional data in a browser prototype;
- deterministic variants;
- a local server on `127.0.0.1`.

It shows how the shells behave, not what real users would do, and it is not
production research, a usability study or a deployment. Explorations run
offline, contact no network service, and are never published by the addon.

## Upstream contribution needs a GO

The packet lives in this repository until the upstream
`DailybotHQ/deepworkplan-skill` project accepts it.
[`UPSTREAM.md`](../integrations/deepworkplan/protoyard/UPSTREAM.md) records the
handoff:
- the exact contract differences (upstream reports DWP `2.17.0`, which does
  not accept this v7 packet unchanged);
- the port routes;
- a no-network validation recipe.

Preparing or opening an upstream pull request requires a separate, explicit
developer **GO**. Nothing in this repository does it automatically.

## The loop, tested

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
