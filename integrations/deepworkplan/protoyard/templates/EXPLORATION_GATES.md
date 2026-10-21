# Deterministic exploration gates

Use these gates with the [exploration task template](EXPLORATION_TASK.md).
Fill its placeholders first and run the commands from the repository root.
Keep `{{SCRATCH_DIR}}` under the repository's ignored `tmp/` area, and set
`{{EVIDENCE_DIR}}` to the approved plan directory, normally
`<plan>/analysis_results/prototypes/<slug>/`. Use a new scratch folder for
each task. Do not put generated files in source directories.

The parent plan records each approved command, exit status, captured output,
and the artifact paths below as observed evidence. A failed required gate
stops the exploration: do not copy its output into the evidence directory or
mark the decision `adopt`.

| Placeholder | Required value |
| --- | --- |
| `{{INPUT_KIND}}` | `blueprint` or `brief`, matching the selected input |
| `{{INPUT}}` | The validated blueprint path or bounded brief file |
| `{{PLAN_DIR}}` | The current plan's root directory |
| `{{SLUG}}` | The stable slug from the exploration task |
| `{{SEED}}` | The fixed whole-number seed from the exploration task |
| `{{VARIANT_COUNT}}` | The selected whole-number variant count |
| `{{SCRATCH_DIR}}` | A repository-local ignored directory under `tmp/` |
| `{{EVIDENCE_DIR}}` | A task-specific directory under `analysis_results/prototypes/` |

Outside the Protoyard checkout, invoke `protoyard` directly. Inside it, use
`pnpm protoyard quick ...` and `pnpm protoyard blueprint validate ...` in the
approved commands below.

## Gate 1 — Validate the input

For a blueprint input, record the CLI's validation result before generating
variants. The command exits nonzero for invalid blueprints.

**Approved command** (blueprint input only):

```bash
protoyard blueprint validate "{{INPUT}}" --json
```

For a brief input, record this gate as `not applicable — brief input`; the
bounded brief is validated by the generation command in Gate 3. Do not label
an unrun blueprint validator as a pass.

## Gate 2 — Snapshot source state

Run this before the first generation command. It records the repository state
outside the approved scratch and evidence directories, including pre-existing
work so the final comparison detects only changes made during the exploration.

**Approved command:**

```bash
mkdir -p "{{SCRATCH_DIR}}"
git status --porcelain=v1 --untracked-files=all -- . \
  ':(exclude){{SCRATCH_DIR}}/**' ':(exclude){{EVIDENCE_DIR}}/**' \
  > "{{SCRATCH_DIR}}/source-status.before"
git diff --no-ext-diff --binary -- . \
  ':(exclude){{SCRATCH_DIR}}/**' ':(exclude){{EVIDENCE_DIR}}/**' \
  > "{{SCRATCH_DIR}}/source-diff.before"
```

Keep both snapshot files until Gate 6 completes.

## Gate 3 — Run quick and check the envelope

Use the same input, slug, seed and variant count selected in the task. The
conditional below supports either a validated blueprint or a bounded brief.
It captures the machine envelope separately from the generated artifact.

**Approved command:**

```bash
set -eu
if [ "{{INPUT_KIND}}" = blueprint ]; then
  protoyard quick --blueprint "{{INPUT}}" --slug "{{SLUG}}" --seed "{{SEED}}" \
    --variants "{{VARIANT_COUNT}}" --out "{{SCRATCH_DIR}}/{{SLUG}}" --json \
    > "{{SCRATCH_DIR}}/{{SLUG}}.envelope.json"
elif [ "{{INPUT_KIND}}" = brief ]; then
  protoyard quick - --slug "{{SLUG}}" --seed "{{SEED}}" \
    --variants "{{VARIANT_COUNT}}" --out "{{SCRATCH_DIR}}/{{SLUG}}" --json \
    < "{{INPUT}}" > "{{SCRATCH_DIR}}/{{SLUG}}.envelope.json"
else
  echo "INPUT_KIND must be blueprint or brief" >&2
  exit 2
fi
node -e '
  const fs = require("node:fs");
  const e = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  const count = Number(process.argv[2]);
  const hash = /^[0-9a-f]{64}$/;
  if (e.ok !== true || !hash.test(e.data?.blueprintSha256 ?? "") ||
      !Array.isArray(e.data?.variants) || e.data.variants.length !== count ||
      e.data.variants.some((v) => !/^v[1-8]$/.test(v.id) || !hash.test(v.blueprintSha256 ?? ""))) {
    console.error("quick envelope failed or has an unexpected variant count/shape");
    process.exit(1);
  }
' "{{SCRATCH_DIR}}/{{SLUG}}.envelope.json" "{{VARIANT_COUNT}}"
```

Record the command exit status and keep the envelope. A nonzero CLI exit, a
false `ok`, a missing hash, or a different variant count fails this gate.

## Gate 4 — Repeat and compare deterministic hashes

Repeat Gate 3 with the same input, seed and count, changing only the slug and
output path to `{{SLUG}}-rerun`. Save the envelope as
`{{SCRATCH_DIR}}/{{SLUG}}-rerun.envelope.json`, then compare the base and
per-variant blueprint hashes and variant order:

**Approved command — rerun** (use the same `INPUT_KIND` branch as Gate 3):

```bash
set -eu
if [ "{{INPUT_KIND}}" = blueprint ]; then
  protoyard quick --blueprint "{{INPUT}}" --slug "{{SLUG}}-rerun" --seed "{{SEED}}" \
    --variants "{{VARIANT_COUNT}}" --out "{{SCRATCH_DIR}}/{{SLUG}}-rerun" --json \
    > "{{SCRATCH_DIR}}/{{SLUG}}-rerun.envelope.json"
elif [ "{{INPUT_KIND}}" = brief ]; then
  protoyard quick - --slug "{{SLUG}}-rerun" --seed "{{SEED}}" \
    --variants "{{VARIANT_COUNT}}" --out "{{SCRATCH_DIR}}/{{SLUG}}-rerun" --json \
    < "{{INPUT}}" > "{{SCRATCH_DIR}}/{{SLUG}}-rerun.envelope.json"
else
  echo "INPUT_KIND must be blueprint or brief" >&2
  exit 2
fi
```

**Approved command — compare hashes:**

```bash
node -e '
  const fs = require("node:fs");
  const first = JSON.parse(fs.readFileSync(process.argv[1], "utf8")).data;
  const again = JSON.parse(fs.readFileSync(process.argv[2], "utf8")).data;
  const hashes = (data) => data.variants.map((v) => [v.id, v.blueprintSha256]);
  if (first.blueprintSha256 !== again.blueprintSha256 ||
      JSON.stringify(hashes(first)) !== JSON.stringify(hashes(again))) {
    console.error("rerun hashes or variant order differ");
    process.exit(1);
  }
' "{{SCRATCH_DIR}}/{{SLUG}}.envelope.json" \
  "{{SCRATCH_DIR}}/{{SLUG}}-rerun.envelope.json"
```

Record both envelope paths and the command result. A changed input or seed is
not a passing repeat.

## Gate 5 — Check output confinement

Check both quick folders, their marker and metadata, each variant blueprint,
and the evidence destination. Resolved variant paths must stay inside their
corresponding quick folder; the evidence path must stay below this plan's
`analysis_results/prototypes/` directory.

**Approved command:**

```bash
node -e '
  const fs = require("node:fs");
  const path = require("node:path");
  const [scratchArg, slug, planArg, evidenceArg, firstArg, againArg] = process.argv.slice(1);
  const inside = (base, candidate) => {
    const rel = path.relative(base, candidate);
    return rel === "" || (!rel.startsWith(".." + path.sep) && rel !== ".." && !path.isAbsolute(rel));
  };
  const repoScratch = fs.realpathSync("tmp");
  const scratch = fs.realpathSync(path.resolve(scratchArg));
  if (!inside(repoScratch, scratch)) throw new Error("scratch directory escapes repository tmp/");
  const checkQuick = (name, envelopePath) => {
    const root = fs.realpathSync(path.resolve(scratch, name));
    if (!inside(scratch, root)) throw new Error(`${name} escapes scratch directory`);
    for (const file of [".protoyard-quick", "quick.json", "blueprint.json"])
      if (!fs.statSync(path.join(root, file)).isFile()) throw new Error(`${name}/${file} missing`);
    const data = JSON.parse(fs.readFileSync(envelopePath, "utf8")).data;
    for (const variant of data.variants) {
      const dir = fs.realpathSync(path.resolve(process.cwd(), variant.dir));
      if (!inside(root, dir) || !fs.statSync(path.join(dir, "blueprint.json")).isFile())
        throw new Error(`${variant.id} escapes ${name} or has no blueprint`);
    }
  };
  const plan = path.resolve(planArg);
  const evidence = path.resolve(evidenceArg);
  const parts = evidence.split(path.sep);
  const marker = parts.lastIndexOf("analysis_results");
  if (!inside(plan, evidence) || marker < 0 || parts[marker + 1] !== "prototypes" || marker + 2 >= parts.length)
    throw new Error("evidence destination must be inside analysis_results/prototypes/<slug>");
  checkQuick(slug, firstArg);
  checkQuick(`${slug}-rerun`, againArg);
' "{{SCRATCH_DIR}}" "{{SLUG}}" "{{PLAN_DIR}}" "{{EVIDENCE_DIR}}" \
  "{{SCRATCH_DIR}}/{{SLUG}}.envelope.json" \
  "{{SCRATCH_DIR}}/{{SLUG}}-rerun.envelope.json"
```

If this check fails, stop and do not copy any artifact into the plan.

## Gate 6 — Confirm no source changes

Run after generation and validation, before copying the approved evidence.
These snapshots exclude only the two approved output destinations.

**Approved command:**

```bash
git status --porcelain=v1 --untracked-files=all -- . \
  ':(exclude){{SCRATCH_DIR}}/**' ':(exclude){{EVIDENCE_DIR}}/**' \
  > "{{SCRATCH_DIR}}/source-status.after"
git diff --no-ext-diff --binary -- . \
  ':(exclude){{SCRATCH_DIR}}/**' ':(exclude){{EVIDENCE_DIR}}/**' \
  > "{{SCRATCH_DIR}}/source-diff.after"
diff -u "{{SCRATCH_DIR}}/source-status.before" "{{SCRATCH_DIR}}/source-status.after"
diff -u "{{SCRATCH_DIR}}/source-diff.before" "{{SCRATCH_DIR}}/source-diff.after"
```

Both comparisons must exit `0`. A newly changed or untracked source path fails
the gate; only then may the task copy its allow-listed evidence files into
`{{EVIDENCE_DIR}}`.

## Record the gate result

For every gate, record its exact filled command, exit code, stdout/stderr or
snapshot paths, and `pass`, `fail`, or `not applicable` with a reason. Missing
Playwright remains an explicit `playwright-unavailable` skip as described in
the exploration task template; it never changes the result of these required
functional gates.
