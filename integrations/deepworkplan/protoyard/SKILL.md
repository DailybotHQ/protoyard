---
name: deepworkplan-addon-protoyard
description: Integrate Protoyard as an optional, offline-first exploration and validation addon for DeepWorkPlan.
version: "7.8.1"
documentation_url: https://protoyard.app/docs/
user-invocable: true
allowed-tools: Bash, Read, Grep, Glob, Edit, Write
---

# DeepWorkPlan — Protoyard Addon

Use Protoyard to turn a bounded product idea or validated blueprint into a
disposable, playable exploration that a DWP plan can inspect. This is a thin
integrator: Protoyard owns the CLI, blueprint validation, player, storage and
static artifacts; DeepWorkPlan owns consent, plan state and evidence
collection.

This addon is **opt-in and never required**. A repository remains fully
AI-first and a Protoyard installation remains fully usable when this addon is
absent, declined, unavailable or incompatible. Do not add a DWP dependency to
Protoyard to make this flow work.

Read [`SPEC.md`](SPEC.md) and [`addon.json`](addon.json) before applying the
flow. The normative contract, pins, interface rules and promotion boundary
are in the spec.

## Pins and ownership

| Surface | Contract |
| --- | --- |
| Product | `DailybotHQ/protoyard` at `v1.1.0` |
| Interface | `1` |
| Registry | `.dwp/config.json` → `addons.protoyard` |
| Detection | `protoyard --version --json` |
| Exploration | `protoyard quick` and its `--json` envelope |
| Plan evidence | `analysis_results/prototypes/` or the plan's declared equivalent |
| DWP target | Vendored `7.8.1`; upstream checkout currently reports `2.17.0` |

The product tag and interface are independent. If either pin changes, update
the descriptor and SPEC together. Do not claim that the checked-out upstream
`2.17.0` accepts this v7 packet unchanged; that is an explicit handoff
concern.

## When this runs

- `onboard` Phase 7b MAY offer the addon when the product is present or when
  the developer asks for disposable product exploration.
- Direct invocation MAY run the detection, offer and validation flow on an
  already-onboarded repository.
- `create`, `execute`, `resume`, `refine`, `status` and `verify` MUST NOT
  require or silently invoke it. A declined offer is complete and safe.

## Trust boundary and writes

Before consent, all work is read-only: inspect the binary, run the version
probe and, only inside a selected workspace, inspect the offline doctor
capabilities. Never install a package, alter a lockfile, run a prototype,
write a plan file or modify the vendored DWP pack merely to detect the addon.

After explicit acceptance, the only normal DWP writes are the reconciled
`addons.protoyard` registry entry and validated, plan-approved evidence. The
quick workspace is temporary and confined. Never overwrite an existing plan,
prototype, package manifest or unrelated registry key. Never send blueprint
text, screenshots or simulated records to a network service.

## Step 0 — Detect, read-only

Run the descriptor command as an argv array with no shell, no stdin, a bounded
timeout and captured output:

```text
protoyard --version --json
```

Treat the product as compatible only when exit status is `0`, stdout is one
JSON object, and the top-level integer `interface` is `1`. Read the
package-derived `version` for display only. Missing binary, non-zero exit,
invalid JSON, a missing interface or an unknown interface is one warning and
`not available`; continue the DWP flow without the addon.

Do not use plain `protoyard --version` for compatibility decisions. Plain
`--version` remains semver text for humans and existing scripts; the JSON form
is the machine interface.

When a compatible CLI is available and the plan has a workspace, optionally
run:

```text
protoyard doctor --json --offline
```

Read the top-level `interface` and `capabilities` strictly, while preserving
the ordinary `ok`, `command` and `data.checks` fields. Stable capability ids
are `quick`, `player`, `generate`, `mcp`, `blueprint-schema` and `import`.
Unknown ids are discovery metadata. Doctor is not the presence probe: exit
`1` means a required check failed and exit `3` means the CLI is outside a
workspace. Never reinterpret either exit as “not installed”.

## Step 1 — Offer and consent

Show the developer:

- the pinned Protoyard release and interface;
- that this adds disposable local exploration and evidence collection;
- that the product remains independent of DWP;
- the exact plan-scoped output location; and
- that promotion from exploration to a source prototype is a separate human
  decision.

Trust mode may recommend the addon but does not accept it. On explicit
acceptance, reconcile the registry with the DWP helper:

```text
python3 <dwp>/shared/config.py enable protoyard --version v1.1.0 --repo <repo>
```

Run this only after the offer is accepted. Preserve unrelated entries and
stop on an unparseable config. On decline, write nothing. If the CLI is not
installed, point the developer to the pinned product release; do not silently
install it or claim that detection succeeded.

## Step 2 — Reason about the exploration

Fill this template from the actual plan and repository. These are decisions,
not a copy-paste project scaffold:

Start with the [exploration task template](templates/EXPLORATION_TASK.md) and
its [deterministic gate checklist](templates/EXPLORATION_GATES.md); fill every
placeholder from the plan and use the commands as observed gates.

```text
Question: <what decision will this exploration answer?>
Input: <bounded brief | validated blueprint path>
Slug/seed: <stable slug> / <integer seed>
Capabilities: <required ids from doctor, or none>
Variants: <none | count and comparison axis>
Scratch root: <plan-approved temporary directory>
Validation: <real route/behavior checks and predicates>
Browser evidence: <screenshots + a11y | playwright-unavailable + reason>
Evidence destination: <analysis_results/prototypes/<slug>/...>
Promotion: <discard | repeat | explicit source-prototype follow-up>
Consent: <accepted | declined | unavailable>
```

Reason from the plan's question: choose the smallest useful brief or
blueprint, a deterministic seed, and only the capabilities and variants that
answer it. Keep fictional data and simulated infrastructure explicit. Do not
invent a production claim from a local prototype.

## Step 3 — Create and validate a disposable exploration

Use a plan-approved temporary directory and a bounded input. For a brief:

```text
protoyard quick <brief> --slug <slug> --seed <n> --json
```

For a blueprint, use `--blueprint <file>` instead of a brief. Add
`--variants <n>` only when comparison is part of the question. The command
must return a successful JSON envelope and a confined quick marker, blueprint,
quick record and launcher. The player app is resolved through the CLI's
published asset contract (`packages/player/dist/app/` in this repository);
the embed client under `dist/embed/` is not the exploration app.

Validate the actual artifact, not just the command result. Run the plan's
strict predicates against its generated routes and simulated interactions.
Serve it only on a private loopback port. If Playwright is available, use the
plan's private config and capture the required browser/a11y evidence. If it is
not available, record `playwright-unavailable` and the reason as a passing
skip; do not present missing screenshots as a successful browser check.

Copy only validated evidence into the plan's approved
`analysis_results/prototypes/` area. Keep the source brief or blueprint
subject to the plan's input policy, and do not copy values that resemble real
personal data.

## Step 4 — Promotion boundary

The addon never promotes automatically. A quick folder is a disposable
exploration and may be discarded, repeated or compared. It is not a source
prototype, a production deployment or a research backend.

If the developer chooses promotion, stop this addon flow and use the ordinary
Protoyard product path (`new`, blueprint `generate`, or hand-authored source)
as a separately reviewed task. That task owns source files, package manifests,
tests, build budgets and commits. This addon MUST NOT write `prototypes/`,
rewrite dependencies, commit generated source or turn plan evidence into
production code by implication.

## Failure modes

- Missing or incompatible CLI: warn, record the state and continue without the
  addon.
- Doctor outside a workspace or with failed checks: preserve its result and
  report the capability limitation; do not use its exit code as detection.
- Declined consent: leave the registry and plan unchanged.
- Invalid brief/blueprint, unsafe output or failed validation: keep the
  failure visible; do not copy the artifact as evidence.
- Playwright unavailable: record `playwright-unavailable`; continue only when
  the non-browser validation gates pass.
- Any install/auth/network request: defer to the developer and the product's
  documented release process; this addon does not invent credentials or
  install flows.

All failures are non-blocking for ordinary DWP work unless the developer
explicitly made the exploration a plan acceptance gate. Even then, the gate
must report a failure honestly rather than treating the addon as required.

## Validation checklist

1. `SPEC.md`, `SKILL.md` and `addon.json` exist; frontmatter and descriptor
   validation pass.
2. The read-only version probe reports interface `1`, or one unavailable/
   incompatible warning is recorded.
3. Doctor capabilities, when used, are read from the top-level interface and
   capability fields and its checks remain visible.
4. A bounded quick run returns a JSON envelope, stays inside the approved
   scratch root and uses a stable seed.
5. Artifact validation and browser evidence (or the explicit
   `playwright-unavailable` skip) are recorded under plan scope.
6. Registry writes occur only after explicit acceptance; no unrelated config
   is clobbered.
7. No Protoyard package or runtime source imports DWP, and no automatic
   promotion occurs.

## Upstream handoff

This packet targets the vendored DWP `7.8.1` contract. The checked-out
upstream DeepWorkPlan repository reports `2.17.0` and lacks the descriptor
surface used here. Before upstream contribution, port the descriptor,
registry/consent hook and validation shape to the accepted upstream contract;
do not claim compatibility merely because the filenames match.
