# SPEC.md — Protoyard DWP Addon (Normative)

## Abstract

This document defines the DeepWorkPlan **Protoyard addon**: an optional,
thin integrator that lets a DWP plan use the Protoyard CLI to create,
validate and review disposable browser prototypes. It does not turn
Protoyard into a DWP runtime component and it does not make DWP part of a
Protoyard installation.

The addon is a Protoyard-side packet in
`integrations/deepworkplan/protoyard/` until the upstream DeepWorkPlan
project accepts a contribution. The descriptor is data; the skill owns the
read-only detection, explicit offer, consent boundary, plan-facing flow and
validation guidance.

## Status and pins

| Field | Value |
| --- | --- |
| Addon version | `1.0.0` |
| Status | Protoyard-side draft, ready for upstream handoff |
| Product | `DailybotHQ/protoyard` |
| Product tag | `v1.1.0` |
| Product interface | `1` |
| Registry key | `protoyard` (`addons.protoyard`) |
| Vendored DWP target | `7.8.1` |
| Upstream handoff concern | the upstream `deepworkplan-skill` repository reports `2.17.0` and does not yet carry the v7 descriptor surface |

The product tag is the first lockstep release that ships the machine
interface used here. If the release tag changes before handoff, the
descriptor's `product.tag` and this table MUST change together. The product
interface major is independent of the npm/package version: additive fields
stay within the same major; a breaking machine contract increments it.

## 1. Conventions and scope

RFC 2119 keywords (**MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, **MAY**
and **OPTIONAL**) are normative.

The **product** is the Protoyard CLI and player. The **addon** is this DWP
integration packet. The **plan** is the DWP plan using the addon. Protoyard
commands remain local, offline-first and subject to the repository's normal
trust boundary.

This addon provides:

- a read-only compatibility probe;
- an explicit onboarding offer and consent record;
- a reasoning-shaped exploration flow around `protoyard quick`;
- validation and evidence rules for plan-scoped prototype artifacts; and
- a human-controlled boundary between disposable exploration and a real
  source prototype.

It MUST NOT provide a DWP library import, a runtime service, a network
backend, a delegation transport, or a new Protoyard dependency on DWP.

## 2. Addon contract

The packet follows the v7.8.1 thin-integrator shape:

1. **Normative spec:** this file defines the contract and conformance.
2. **Reasoning/onboarding hook:** `SKILL.md` offers the addon, records the
   decision, and carries the parameterized exploration template. It reasons
   about the target plan and workspace; it does not copy a fixed repository
   layout.
3. **Descriptor:** `addon.json` is the closed DWP descriptor and pins the
   product/interface. It MUST remain data-only.
4. **Validation:** §8 and the checklist in `SKILL.md` validate the descriptor,
   probe, capabilities, exploration evidence and promotion boundary.

The upstream pack may split the reasoning template into its conventional
`templates/INTEGRATION.md` file when this packet is accepted. That migration
MUST preserve the content and decisions in `SKILL.md`; it is an upstream
handoff, not a reason to add a hidden dependency here.

## 3. Never required, opt-in and reconcile

- The addon is **opt-in** and **never required** for DWP conformance,
  Protoyard use, or any Protoyard CLI command. A repository with no addon
  registry entry remains fully conformant.
- `onboard` Phase 7b MAY offer it when Protoyard is detected or the developer
  asks for idea exploration. It MUST show what the addon adds and what it
  writes before asking for acceptance. Trust mode MAY recommend it but MUST
  NOT silently accept it.
- `create`, `execute`, `resume`, `refine`, `status` and `verify` MUST NOT
  require the addon. An execution without it runs the ordinary DWP flow.
- Declining writes nothing and continues. An absent, incompatible or broken
  CLI is a warning about the machine, not a plan failure.
- Existing `.dwp/config.json`, plan state, quick output and repository files
  MUST be reconciled, never clobbered. The addon may add its own registry key
  and plan-scoped evidence only after consent and only within approved paths.
- The addon MUST NOT install a package, alter a lockfile, edit Protoyard source,
  or modify the vendored `.agents/skills/deepworkplan/` pack as part of
  detection or offer.

## 4. Descriptor and product compatibility

`addon.json` MUST remain a closed object valid against the vendored
`addon-descriptor-v1` schema. Its current contract is:

- `key` is `protoyard`, matching this directory and the registry key;
- `product` pins `DailybotHQ/protoyard`, `v1.1.0`, interface `1`;
- `detect.command` is exactly `protoyard --version --json`;
- `detect.interface_from` is `json:interface`;
- `provides_abilities` is empty because this addon is not a transport; and
- `requires_grants` is limited to the grants needed by the plan's local gate
  execution and plan-scope artifact writes.

The addon MUST NOT claim `subagents`, `cancel_children`, `model_routing`,
network access, telemetry or any other host ability. `protoyard mcp` is a
Protoyard interface, not a DWP delegation transport.

## 5. Read-only detection

Detection MUST run without a shell, with no stdin, a bounded timeout and
captured stdout/stderr, as the DWP resource detector does. It MUST NOT run
`install`, `new`, `quick`, `build`, `publish`, or a network command.

### 5.1 Compatibility probe

The detector runs:

```text
protoyard --version --json
```

Compatibility is present only when the process exits `0`, stdout is one
valid JSON object, and its top-level `interface` is integer `1`. The object
also contains the package-derived `version`. Missing binaries, non-zero exit,
malformed output, a missing field or another interface major are reported as
one warning and **not available**. A detector MUST NOT infer compatibility
from the human-readable plain `protoyard --version` output.

Plain `--version` remains semver text for people and existing scripts;
`--version --json` is the machine form. The CLI's package version may change
without changing the interface major.

### 5.2 Capability probe

After compatibility is established, a plan working inside a workspace MAY
run `protoyard doctor --json --offline` to inspect capabilities. The doctor
envelope exposes `interface` and `capabilities` at the top level, beside its
ordinary `ok`, `command` and `data` fields. Stable capability identifiers are:

```text
quick, player, generate, mcp, blueprint-schema, import
```

The addon MUST treat other capability strings as discovery metadata, not a
compatibility promise. It MUST read the doctor `ok` and capability values
strictly and preserve the existing checks in `data`.

Doctor exit codes are not a detection protocol: exit `1` means a required
check failed, and exit `3` means the process is outside a workspace. Therefore
the addon MUST use `protoyard --version --json` for presence/interface
detection, and MUST NOT treat either doctor exit code as “not installed”.

## 6. Consent, registry and independence

The offer MUST state that the addon is optional, names the pinned product and
interface, explains that exploration evidence is written only to an approved
plan scope, and says that promotion is a separate human decision.

Only after explicit acceptance MAY the DWP side record:

```text
python3 <dwp>/shared/config.py enable protoyard --version v1.1.0 --repo <repo>
```

The registry writer MUST reconcile `.dwp/config.json`, preserve unrelated
addon entries, and refuse an unparseable file. A decline MUST leave the file
unchanged. Detection can be recorded as available/absent/incompatible, but
availability is not acceptance.

Protoyard itself MUST remain installable and runnable with no DWP files,
environment variables, Python modules or registry. This packet MUST NOT be
copied into Protoyard runtime bundles, player assets or published package
dependencies. The DWP side invokes the public CLI as an external local
process and treats its JSON envelope as untrusted input.

## 7. Exploration and promotion boundary

The preferred plan flow is:

1. Create a temporary working directory under the plan-approved scratch
   location; never use a home directory or an arbitrary output path.
2. Run `protoyard quick` from a brief or a validated blueprint with a stable
   slug and seed. Use `--variants N` only when comparison is part of the
   question. The CLI writes the marker, blueprint, quick record, launcher and
   optional variants; the player path is resolved by the CLI.
3. Run the plan's validation predicates against the local artifact and, when
   available, serve it on a private loopback port. Browser screenshots and
   accessibility evidence are optional only when Playwright is unavailable;
   the report MUST record the explicit skip reason `playwright-unavailable`.
4. Copy only the validated, plan-approved evidence into
   `analysis_results/prototypes/` (or the plan's declared equivalent). Keep
   temporary work outside the plan scope and remove it after collection when
   policy permits.
5. Record observed behavior, decision, and follow-up separately. A quick
   artifact is simulated local evidence, not production research.

Promotion is an explicit boundary. The addon MUST NOT automatically turn a
quick folder into a source prototype, modify `prototypes/`, rewrite package
manifests, or commit generated code. A developer may separately choose the
normal Protoyard `new`, blueprint `generate`, or hand-authored source flow;
that promotion is reviewed and validated as product work, not treated as an
addon side effect. Re-running an exploration MUST remain disposable and
deterministic for the same brief/blueprint and seed.

## 8. Validation contract

An applied addon is conformant only when all applicable checks pass or have a
recorded, non-blocking skip:

1. `addon.json`, `SPEC.md` and `SKILL.md` exist; the descriptor validates
   against the vendored schema and its key matches `protoyard`.
2. `protoyard --version --json` is executed read-only and reports interface
   `1`, or the result is recorded as absent/incompatible without blocking.
3. `doctor --json --offline`, when run in a workspace, preserves its checks
   and exposes the documented top-level interface/capability fields.
4. The quick run uses a bounded brief/blueprint, confined output, a stable
   seed, and a real JSON envelope; no shell interpolation or runtime network
   access is introduced.
5. The exploration's validation result, browser result or
   `playwright-unavailable` skip, and decision are recorded under the plan's
   approved analysis scope.
6. No automatic promotion, source mutation, lockfile change or DWP runtime
   dependency occurred.
7. The addon sync conformance test loads this packet's descriptor explicitly
   without registering it in the vendored addon set. It covers compatible,
   missing CLI, missing interface field, malformed JSON and mismatched
   `protoyard --version --json` results, checks the sync action for each
   state, and confirms planning leaves the repository file inventory and
   `.dwp/config.json` unchanged. Detection may invoke only the descriptor's
   version probe; it never installs Protoyard.

The packet MUST remain usable when Protoyard is absent, when its interface is
unknown, when doctor reports failed checks, when a developer declines, or
when a browser is unavailable. Those states are findings, not DWP
conformance failures.

## 9. Upstream handoff

The checked-out open-source upstream repository currently reports DWP
`2.17.0`, while this repository vendors and targets DWP `7.8.1`. It lacks the
current descriptor surface used by `addon.json`, including top-level product
interface detection and the addon sync/registry contract. Before proposing
this packet upstream, the maintainer MUST either target an upstream release
that contains the v7 descriptor contract or port the equivalent descriptor,
consent and validation mechanism with an explicit upstream review. This
packet MUST NOT claim that upstream `2.17.0` accepts it unchanged.

## 10. Rollback

Disabling the registry entry is sufficient to stop addon use. Removing the
packet does not remove Protoyard, plan state or validated evidence. Product
artifacts are rolled back through the ordinary Protoyard/project review flow;
the addon never deletes them implicitly.
