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

## Recipes stay runnable

Every `protoyard` command and flag in this guide and in the addon packet
(`SKILL.md`, `SPEC.md`, `UPSTREAM.md` and every template, the gates included)
is checked against the real CLI. No file under `integrations/` may name an
absolute local path.

```bash
pnpm exec tsx scripts/validate-integrations.ts
```

When a CLI change removes a command or flag a recipe uses, the check fails
with that recipe's file and line.

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
provides the plan and a small local player asset set. The end-to-end runner
that filled the template, generated variants twice to compare hashes, wrote
the reports and recorded browser evidence (`tests/integration/dwp-loop.test.ts`)
was removed in PLAN_009 because it took about 15 s and the addon loop is
optional. Nothing exercises the full loop automatically today; the isolation
cases below still run in `pnpm test`.

## Isolation

The loop may write only the temporary plan's evidence.
[`tests/integration/dwp-loop-isolation.test.ts`](../tests/integration/dwp-loop-isolation.test.ts)
checks the boundaries directly instead of relying on convention (four cases
since PLAN_009):

- **A link cannot lead out of the evidence folder.** A symbolic link inside
  it whose real path leaves the folder is refused.
- **The CLI refuses out-of-scope output on its own.** `quick --out` refuses a
  folder it did not create and a symlinked output, without touching them.
- **No partial output.** An invalid input fails and leaves nothing behind.
- **A successful run writes only evidence.** Every file it creates is under
  `analysis_results/prototypes/<slug>/` and nowhere else.

The traversal, absolute-path and plan-root refusals of `resolvePlanScoped`,
the cleanup checks of `withDwpLoopFixture` and the Git-status check were cut
in PLAN_009; the code is unchanged, but those rules are no longer asserted.

```bash
pnpm vitest run tests/integration/dwp-loop-isolation.test.ts
```

This is simulated local evidence. It does not measure production behavior,
contact a network service, or promote an exploration into `prototypes/`.
Promotion requires a separate, human-approved Protoyard task.
