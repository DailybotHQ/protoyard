# Exploration task template — Protoyard quick variants in a DWP plan

A reasoning template for one DeepWorkPlan task that answers a product
question with disposable Protoyard explorations: `protoyard quick` makes
deterministic variants of one idea, the task compares them against stated
criteria, and records the chosen variant and its evidence inside the plan.

It follows the addon contract in [`../SPEC.md`](../SPEC.md) and the flow in
[`../SKILL.md`](../SKILL.md). Use it only after the addon was accepted
(`addons.protoyard` in `.dwp/config.json`) and the version probe reported
interface `1`.

## This is not a copy-paste command

Every `{{PLACEHOLDER}}` is a decision about **this** plan and **this**
repository. Fill them from the plan's question, the repository's scratch and
evidence conventions, and the installed CLI. Then delete the guidance
blockquotes. A task that still contains `{{` is not ready: the task's own
validation (step 7 below) checks for it.

Before filling it, check three things:

- **What variants can answer.** `--variants` changes the **shell, not the
  domain**: layout, theme, spacing density and which entity comes first.
  Entities, fields, roles and generated data stay identical, so variants
  compare presentation and navigation like for like. A question about the data
  model needs separate explorations (one blueprint each, separate slugs), not
  `--variants`.
- **How the CLI runs here.** Outside the Protoyard repository it is
  `protoyard …`. Inside it, the same commands run as `pnpm protoyard …`. Check
  `protoyard quick --help` on the installed CLI before trusting a flag below.
- **Where files may go.** The scratch folder is the repository's own
  temporary area (for example a git-ignored `tmp/`), outside the plan folder.
  Only validated evidence is copied into the plan's
  `analysis_results/prototypes/`.

## Placeholders

| Placeholder | Meaning | How to choose it |
| --- | --- | --- |
| `{{TASK_TITLE}}` | The task's title in the plan | A short imperative, such as "Compare navigation for the gym booking idea" |
| `{{IDEA}}` | The product idea in one or two sentences | From the plan's goal; fictional names and data only |
| `{{DECISION_QUESTION}}` | The one question this task answers | It must be answerable by comparing shells, such as "Which layout lets a front-desk user find today's bookings fastest?" |
| `{{INPUT}}` | The bounded input: a brief file or a validated blueprint path | A brief of at most 64 KB, or a blueprint of at most 256 KB that passes `protoyard blueprint validate` |
| `{{SLUG}}` | A stable exploration slug | Lowercase kebab-case; the same slug on every rerun |
| `{{SEED}}` | A whole-number seed | Fixed for the task, so reruns give the same variants and worlds |
| `{{VARIANT_COUNT}}` | How many variants | 2–4 is usually enough to compare; the CLI accepts 1–8 |
| `{{CRITERIA}}` | The comparison criteria | Observable checks tied to the question (a route reached, an action completed, items visible without scrolling), not taste |
| `{{SCRATCH_DIR}}` | The temporary working folder | Under the repository's scratch area, git-ignored, outside the plan folder |
| `{{PRIVATE_PORT}}` | A loopback port for `quick serve` | One the repository reserves for this agent or lane; never a shared dev port |
| `{{EVIDENCE_DIR}}` | The output scope inside the plan | `<plan>/analysis_results/prototypes/{{SLUG}}/`, or the plan's declared equivalent |
| `{{EVIDENCE}}` | The evidence files the decision cites | Paths under `{{EVIDENCE_DIR}}` only |
| `{{CHOSEN_VARIANT}}` | The variant the decision picks | `v1`…`vN` from the envelope, or `none` |
| `{{DECISION}}` | What the plan does next | `adopt`, `iterate` (a new task with a refined input) or `discard` |
| `{{FOLLOW_UP}}` | The next task, if any | A separate, human-approved task; never promotion inside this one |

<!-- exploration-template:start -->

# {{TASK_TITLE}}

## 1. Idea and decision question

- **Idea:** {{IDEA}}
- **Decision question:** {{DECISION_QUESTION}}
- **Why variants answer it:** variants of one idea differ only in layout,
  theme, density and entity emphasis, while the domain and data stay the same,
  so a difference in the criteria comes from the shell.

> Guidance: if the question needs a different data model, stop and plan one
> exploration per model instead.

## 2. Input and determinism

- **Input:** {{INPUT}} (fictional data only; no real names, emails or
  customer records)
- **Slug and seed:** `{{SLUG}}` and `{{SEED}}`. The same input, slug, seed and
  variant count always produce byte-identical variant blueprints.
- **Variants:** {{VARIANT_COUNT}}

## 3. Output scope

- **Scratch (temporary, not evidence):** `{{SCRATCH_DIR}}/{{SLUG}}/`
- **Evidence (the only plan writes):** `{{EVIDENCE_DIR}}`
- **Never written by this task:** `prototypes/`, package manifests,
  lockfiles, the plan's other tasks, the vendored DWP pack, or any path outside
  the two above.

## 4. Create the variants

```bash
protoyard --version --json
protoyard quick --blueprint {{INPUT}} --slug {{SLUG}} --seed {{SEED}} --variants {{VARIANT_COUNT}} --out {{SCRATCH_DIR}}/{{SLUG}} --json
```

> Guidance:
> - **From a brief file:** pipe it on stdin instead of `--blueprint`
>   (`protoyard quick - --slug {{SLUG}} …`).
> - **Outside the workspace:** a scratch folder outside it also needs
>   `--allow-external-out`, and the folder must be new or empty.

Keep the JSON envelope (stdout) as `{{SCRATCH_DIR}}/{{SLUG}}.envelope.json`.
The task reads only these fields:

| Envelope field | Used for |
| --- | --- |
| `ok` | The run succeeded; stop on `false` and record `error.code` |
| `data.variants[].id`, `label`, `dir`, `blueprintSha256` | One row per variant in the decision record |
| `data.compare` | The side-by-side page to open |
| `data.blueprintSha256` | The base blueprint's identity |

## 5. Check determinism

Run the same command a second time into `{{SCRATCH_DIR}}/{{SLUG}}-rerun`,
with `--slug {{SLUG}}-rerun`. Every variant's `blueprintSha256` must match the
first run's, and the base blueprint's too. If one differs, the input or seed
changed: stop and record it.

## 6. Compare against the criteria

```bash
protoyard quick serve {{SCRATCH_DIR}}/{{SLUG}} --port {{PRIVATE_PORT}} --strict-port
```

Open `data.compare` through that server, never from `file://`. For each
variant, check every criterion:

{{CRITERIA}}

- **Browser evidence:** with Playwright available, capture one screenshot per
  variant and an axe result, using the repository's private browser
  configuration.
- **No browser:** without Playwright, record the skip reason
  `playwright-unavailable`. That is a recorded skip, not a passed browser
  check; the decision then rests on the non-browser checks only.
- **Simulated data:** everything here is simulated, fictional data in a local
  prototype. It shows how the shells behave, not what real users would do.

## 7. Collect evidence and validate the task

Copy into `{{EVIDENCE_DIR}}` only:

- `blueprint.json` and `quick.json` from `{{SCRATCH_DIR}}/{{SLUG}}/`;
- each `vN/blueprint.json`, as `vN.blueprint.json`;
- `{{SLUG}}.envelope.json`;
- the screenshots and axe results, or the `playwright-unavailable` record;
- `DECISION.md` (section 8).

Do not copy the player folder or anything outside the list. Then check:

- no file of this task, the task file included, contains `{{`;
- every file the decision cites exists under `{{EVIDENCE_DIR}}`;
- each variant's `blueprintSha256` in the decision record equals the one in
  the copied envelope.

## 8. Decision record (`{{EVIDENCE_DIR}}/DECISION.md`)

| Field | Value |
| --- | --- |
| Question | {{DECISION_QUESTION}} |
| Input | {{INPUT}} (seed {{SEED}}) |
| Chosen variant | {{CHOSEN_VARIANT}} |
| Decision | {{DECISION}} |
| Evidence | {{EVIDENCE}} |
| Browser evidence | screenshots and axe results, or `playwright-unavailable` |
| Follow-up | {{FOLLOW_UP}} |

One row per variant:

| Variant | Label | blueprintSha256 | Result per criterion | Evidence |
| --- | --- | --- | --- | --- |
| v1 | from the envelope | from the envelope | pass or fail, with what was observed | file under `{{EVIDENCE_DIR}}` |

- **Ground every row in evidence.** Each row states what was observed, with
  its evidence file. A choice without evidence for its criteria is `iterate`,
  not `adopt`.
- **Promotion is a separate task.** Turning the chosen variant into a real
  prototype is a separate task that the developer approves. That task, not
  this one, runs
  `protoyard quick promote {{SCRATCH_DIR}}/{{SLUG}} <new-slug> --variant {{CHOSEN_VARIANT}}`
  and owns the new prototype's source, tests and review.

## 9. Clean up

Remove `{{SCRATCH_DIR}}/{{SLUG}}` and `{{SCRATCH_DIR}}/{{SLUG}}-rerun` once
the evidence is collected, if the repository's policy allows. The evidence in
`{{EVIDENCE_DIR}}` changes only through the plan's own review.

<!-- exploration-template:end -->
