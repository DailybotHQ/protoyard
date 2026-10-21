# SPEC.md — Protoyard Addon (Normative)

## Abstract

This is the normative specification of the DeepWorkPlan **protoyard addon**,
an opt-in thin integrator of **Protoyard** (`DailybotHQ/protoyard`, MIT, its
own release cycle). Plans use it to turn an idea into disposable, runnable
prototype explorations (`protoyard quick`) and to validate them.

Protoyard is a separate product. This folder defines only the DWP-side
contract: the descriptor, detection and the pin. It is a Protoyard-side packet
until the upstream DeepWorkPlan pack accepts it. Nothing here modifies the
vendored pack under `.agents/skills/deepworkplan/`.

## Status of This Document

| Field | Value |
|-------|-------|
| **Version** | 0.1.0 |
| **Status** | Draft: the descriptor is in place. The offer, install and exploration flow are specified with the addon skill. |
| **Product pin** | `DailybotHQ/protoyard` `v1.1.0`, interface `1` |
| **Companions** | `addon.json`, [`docs/INTERFACE.md`](../../../docs/INTERFACE.md), `.agents/skills/deepworkplan/spec/ADDONS.md` §7, `.agents/skills/deepworkplan/spec/V7_ABILITIES.md` |

## 1. Conventions

The RFC 2119 keywords apply: **MUST**, **MUST NOT**, **SHOULD** and **MAY**.
**The CLI** is the `protoyard` command, and **the addon** is this folder.

## 2. The descriptor (`addon.json`)

`addon.json` is a closed object that validates against
`addon-descriptor-v1.schema.json` and the pack's runtime check
(`shared/config.py` `descriptor_errors`). Its `key` is `protoyard`, which
equals this directory's name.

| Field | Value | Why |
| --- | --- | --- |
| `product` | `DailybotHQ/protoyard`, `v1.1.0`, interface `1` | The pin is the first release tag that ships interface 1. `v1.0.0` predates the interface and has no `--version --json`. |
| `detect.command` | `protoyard --version --json` | It is read-only, needs no workspace and no network, and exits 0 wherever the CLI is installed. |
| `detect.interface_from` | `json:interface` | stdout is one JSON object, `{"version","interface"}`, with `interface` at the top level. |
| `provides_abilities` | none | Protoyard contributes no host ability (no delegation, metering or routing). |
| `requires_grants` | `gate_command_exec`, `fs_write_plan_scope` | Using the addon runs CLI commands as gates, and copies validated exploration artifacts into the plan's `analysis_results/`. |
| `transport` | absent | The addon is not a delegation transport. |

The descriptor **MUST NOT** claim an ability or grant beyond these. If a later
release needs more, for example `network_access` for a publish step, that is
a descriptor change with its own review.

## 3. Detection

Detection **MUST** be read-only. The pack runs
`protoyard --version --json` without a shell, with no stdin, and within its
timeout. It then reads the top-level `interface` integer.

- **Present:** exit 0, and `interface` equals `1`.
- **Not installed:** the binary is missing.
- **Not available:** a non-zero exit, unreadable output, or any other
  interface value. Each gives one warning and is never an error. A detector
  **MUST NOT** fall back to `protoyard doctor`'s exit code, which is 1 on a
  failed required check and 3 outside a workspace.
- **Capabilities:** a tool that needs specific capabilities (`quick`,
  `player`…) reads them from `protoyard doctor --json --offline`, inside the
  workspace it works on. It **MUST** read them strictly, as
  [`docs/INTERFACE.md`](../../../docs/INTERFACE.md) ("Reading a probe")
  defines.

## 4. Versioning

The interface major is versioned apart from the CLI's package version. A new
Protoyard release that keeps interface 1 needs only a new `product.tag`. A
breaking interface change bumps the major. The addon then updates
`product.interface` and its detection rule in the same change, and a CLI on
the old major reads as "not available".

## 5. Verification

`pnpm vitest run packages/cli/tests/dwp-addon.test.ts` checks three things:
- the descriptor validates against the vendored schema and the runtime check;
- the key matches the directory;
- the detect command run through the pack's own interface reader reports
  interface 1 from the real CLI.

When the pinned tag exists in the repository, the test also checks that the
tag ships the `--version --json` interface.
