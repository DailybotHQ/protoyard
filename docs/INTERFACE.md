# Protoyard machine interface

Tools that drive Protoyard, such as a DeepWorkPlan addon, an MCP client or a
CI script, need one stable answer to two questions:

- Is Protoyard installed?
- Which contract does it speak?

Two commands answer them:
- `protoyard --version --json` works anywhere and needs no workspace.
- `protoyard doctor --json` adds the capability list and the health checks.

## `--version`

```bash
protoyard --version          # 1.0.0              (plain semver, unchanged)
protoyard --version --json   # {"version":"1.0.0","interface":1}
```

- **Plain form:** `--version` (or `-v`) prints the package version alone, for
  people and scripts.
- **JSON form:** with `--json` it prints exactly one JSON object with two keys:
  - `version`, read from the CLI's package.json;
  - `interface`, the same major `doctor --json` reports.
- **It always exits 0**, inside or outside a workspace, so it is the probe for
  detection. Both flags must be global options, before any command word, in
  any order (`protoyard --json -v` works too).

## `doctor --json`

```bash
protoyard doctor --json --offline
```

```json
{
  "ok": true,
  "command": "doctor",
  "data": { "ok": true, "checks": [ … ] },
  "interface": 1,
  "capabilities": ["blueprint-schema", "generate", "mcp", "player", "quick"]
}
```

## The fields

| Field | Meaning |
| --- | --- |
| `interface` | The interface major, an integer. It is **1** today. |
| `capabilities` | The sorted ids of what this CLI implements, from the table below. |

**Placement.** Both fields sit at the top level of the envelope, beside `ok`,
`command` and `data`. A detector that reads one top-level JSON field (for
example DeepWorkPlan's `interface_from: "json:interface"`) needs nothing else.
`data` keeps exactly its earlier shape (`ok` and `checks`).

**Always present.** Both fields are added to every `doctor --json` envelope:
- when every check passes (exit 0);
- when a required check fails (`ok: false`, exit 1, with the checks in `data`);
- when there is no Protoyard workspace (`ok: false`, `error.code: "not_found"`,
  exit 3).

**Static.** The values come from the CLI itself, never from the machine, the
workspace or a check result, so every run of one CLI version answers the same.
No other command adds them to its envelope.

**Separate from the package version.** The interface major is versioned apart
from the package version (`protoyard --version`). It changes only when a
breaking change reaches what tools rely on: these two fields, the envelope
shape (`ok`, `command`, `data`, `error`), exit codes and the documented command
contracts. Additions, such as a new capability id or a new field, keep the
major.

## Capability ids

These ids are stable: an id never changes meaning. A tool checks for the ids it
needs and treats a missing id as "not available in this CLI".

| Id | Means | In this CLI |
| --- | --- | --- |
| `quick` | `protoyard quick`: disposable explorations from a brief or blueprint, with no build | yes |
| `player` | The prebuilt player that `quick` uses, matching the CLI version | yes |
| `generate` | `protoyard generate` and `blueprint new --generate`: full prototypes from a blueprint | yes |
| `blueprint-schema` | `protoyard blueprint validate` and the published blueprint JSON Schema (`@protoyard/blueprint/schema.json`) | yes |
| `import` | Importing a data shape (CSV, JSON, a SQLite schema) into a blueprint from the CLI | not yet |
| `mcp` | `protoyard mcp`, the stdio MCP JSON-RPC transport ([MCP](MCP.md)) | yes |

A capability is listed only once its command or contract ships, and a test
keeps the list honest (`packages/cli/tests/interface.test.ts`).

## Detecting Protoyard

Use `--version --json`: it exits 0 wherever the CLI is installed and reads
nothing else.

```json
{
  "detect": {
    "command": "protoyard --version --json",
    "interface_from": "json:interface"
  }
}
```

Use `doctor --json --offline` when a tool also needs the capabilities or the
health checks, with two cautions:
- **A non-zero exit can still mean "installed".** `doctor` keeps its exit
  codes: 1 when a required check fails, and 3 when it runs outside a Protoyard
  workspace. A detector that treats only exit 0 as "present" reports an
  installed CLI as absent in those cases, even though the envelope still
  carries `interface`. Run it inside the workspace the tool works on.
- **`--offline`** keeps `doctor` from contacting provider CLIs, so it never
  needs the network.

## Reading a probe

A tool reads the probe strictly and never assumes compatibility from a partial
answer. Protoyard ships the reference reader as `readInterfaceProbe(stdout,
{ interface?, capabilities? })` in
[`packages/cli/src/commands/doctor.ts`](../packages/cli/src/commands/doctor.ts).

It returns:
- `compatible`, which is true only when there is no error;
- `status`: `compatible`, `degraded` (compatible with warnings) or
  `incompatible`;
- the `interface` it read;
- the known `capabilities`, `unknownCapabilities` and `missingCapabilities`;
- the `issues`, each with a `code`, a `severity` and a `message`.

| Probe output | Severity | Issue code |
| --- | --- | --- |
| Not one JSON object (empty, plain semver, truncated, an array, `null`) | error | `unreadable` |
| No top-level `interface` (nested under `data` does not count) | error | `interface-missing` |
| `interface` is not a positive integer (`"1"`, `1.5`, `0`, `null`…); nothing is coerced | error | `interface-malformed` |
| `interface` is another major, older or newer | error | `interface-mismatch` |
| `capabilities` is present but not an array | error | `capabilities-malformed` |
| A required capability is not listed. `--version --json` lists none, so a capability requirement needs `doctor --json`. | error | `capability-missing` |
| A required id is not a defined id: no probe can satisfy it | error | `capability-unknown` |
| An unknown capability id is listed: it is ignored and never counts | warning | `capability-unknown` |
| A capability entry is not a string: it is dropped | warning | `capabilities-malformed` |
| A doctor envelope reports `ok: false`, for example a failed check (exit 1) or no workspace (exit 3): installed, but not healthy there | warning | `probe-not-ok` |

Ids are compared exactly (`Quick` is not `quick`), and duplicates collapse.
The reader does not change `doctor`'s exit codes: a failed required check
still exits 1, and a run outside a workspace still exits 3.
`packages/cli/tests/interface-compat.test.ts` covers every row against
fixtures and the real `--version --json` and `doctor --json` output.

## Stability policy

This section is the contract for interface 1: what a tool may rely on, what
can change without notice, and how a breaking change is announced.

### Who owns the major

`@protoyard/cli` owns the interface major. It has one source,
`INTERFACE_MAJOR` in
[`packages/cli/src/lib/workspace.ts`](../packages/cli/src/lib/workspace.ts).
`--version --json`, `doctor --json` and `readInterfaceProbe` all read it, so
they cannot disagree. No other package publishes an interface number:
`@protoyard/player` and the other packages are covered through the CLI that
ships them. A change to the major lands together with this guide, an ADR in
[DECISIONS](DECISIONS.md) and the interface tests.

### What interface 1 covers

A tool may rely on these, and only these:

| Surface | Contract | Documented in |
| --- | --- | --- |
| `protoyard --version --json` | One JSON object with `version` (the package semver) and `interface` (an integer); always exits 0 | [`--version`](#--version) |
| `protoyard doctor --json` top level | `interface` and `capabilities` beside `ok`, `command` and `data`, on every outcome | [`doctor --json`](#doctor---json) |
| The envelope | With `--json`, stdout is exactly one `{ ok, command, data?, error? }` object; `error` is `{ code, message, hint? }` | [CLI README](../packages/cli/README.md#json-output-and-exit-codes), [DEVELOPMENT_COMMANDS](DEVELOPMENT_COMMANDS.md) |
| Exit codes and `error.code` | The table in [Exit codes and errors](#exit-codes-and-errors) | [CLI README](../packages/cli/README.md#json-output-and-exit-codes), [DEVELOPMENT_COMMANDS](DEVELOPMENT_COMMANDS.md) |
| Capability ids | The ids and meanings in [Capability ids](#capability-ids) | this page |
| Command contracts | The commands, flags and envelope `data` fields that [DEVELOPMENT_COMMANDS](DEVELOPMENT_COMMANDS.md) documents, for every capability the CLI lists | [DEVELOPMENT_COMMANDS](DEVELOPMENT_COMMANDS.md) |

Not covered, and free to change in any release:
- human-readable output, colors and layout;
- the wording of `message` and `hint`;
- key order in JSON;
- envelope `data` fields that no guide documents;
- the ids, labels and details of `doctor`'s individual `checks`;
- timing and performance.

Plain `--version` output stays plain semver, but a tool reads the JSON form.

### Additive changes keep the major

These ship in any release, interface 1 included:
- **A new capability id.** It is first defined in the capability table, then
  listed in `capabilities` only when its command or contract ships (`import`
  is defined today but not listed).
- **A new field** in `--version --json`, at the top level of `doctor --json`,
  or in a command's `data`.
- **A new command or flag**, or a new command contract behind a new
  capability.
- **A new `error.code` value** that maps to an existing exit code.

A reader that follows this policy ignores what it does not know: unknown
fields, and unknown capability ids, which `readInterfaceProbe` reports as a
warning and never counts.

### Breaking changes bump the major

Each of these increments the interface major by exactly one:
- **Envelope or probe fields:** removing or renaming a field of
  `--version --json`, of `doctor --json`'s top level or of the envelope, or
  changing its type or meaning (`interface` stays a JSON integer).
- **Capability ids:** removing an id from `capabilities` once a release has
  listed it, or changing what it means. An id is never reused for something
  else, even after it is retired.
- **Exit codes and errors:** changing the exit code of an existing
  `error.code`, removing an `error.code`, or adding an exit code outside 0–5.
- **Documented commands:** removing or renaming a documented field, command
  or flag covered by a listed capability, or changing its behavior so that a
  documented use fails.
- **The probe:** `--version --json` no longer exiting 0.

A bump ships in one release that updates `INTERFACE_MAJOR`, this guide, an
ADR, the interface tests and the changelog together. A CLI speaks exactly one
major: interface 1 has no negotiation, and `readInterfaceProbe` treats every
other major, older or newer, as `interface-mismatch`.

### Package version and interface major

| | Package version (`protoyard --version`) | Interface major (`interface`) |
| --- | --- | --- |
| Form | semver, `MAJOR.MINOR.PATCH` | one positive integer |
| Changes | every release | only on a breaking interface change |
| Read by | people, package managers, release notes | detectors and tools |

- **An interface bump is a breaking change for tools**, so it ships in a new
  package major.
- **A package major does not imply an interface bump.** For example, a new
  Node requirement or a removed template changes the package major and keeps
  the interface.
- **`v1.0.0` predates the interface.** Its `--version --json` prints plain
  semver, which a strict reader reports as `unreadable`, so no compatible
  interface is detected. Interface 1 starts with the first release after
  `v1.0.0` that ships these commands. No such release is tagged yet.

### Detection

- **Probe with `--version --json`.** It needs no workspace, contacts nothing
  and always exits 0 on a CLI that speaks an interface (see
  [Detecting Protoyard](#detecting-protoyard)).
- **Use `doctor --json --offline` for capabilities.** It can exit 1 or 3 while
  still reporting `interface`.
- **Read strictly:**
  - a missing, malformed or other major means "not compatible";
  - an `ok: false` doctor envelope means "installed, not healthy here";
  - nothing is inferred from a partial answer
  ([Reading a probe](#reading-a-probe)).

### Exit codes and errors

The same table is in the [CLI README](../packages/cli/README.md#json-output-and-exit-codes),
and the exit-code summary is at the top of
[DEVELOPMENT_COMMANDS](DEVELOPMENT_COMMANDS.md). Interface 1 fixes it:

| Exit | Meaning | `error.code` |
| --- | --- | --- |
| 0 | ok | — |
| 1 | failure | `failure`, `conflict` |
| 2 | usage | `usage`, `unsafe_path` |
| 3 | not found | `not_found` |
| 4 | validation | `validation` |
| 5 | provider or auth | `provider`, `auth` |

- **Failing checks keep their data.** Commands that complete with failing
  checks return `ok: false` and keep the full `data`; their exit code still
  follows the table.
- **Switch on the exit code first.** A tool switches on the exit code, and on
  `error.code` only for finer handling. An `error.code` it does not know is
  handled by its exit code.
- **MCP tool errors stay tool results.** Through `protoyard mcp`, a failed
  command is a tool result with `isError: true` that carries this same
  envelope, and the MCP transport itself succeeds ([MCP](MCP.md)).

### A DeepWorkPlan addon descriptor

A DeepWorkPlan addon pins Protoyard by repository, release tag and interface
major, and detects it with a read-only command. This example follows DWP's
addon-descriptor v1 schema:

<!-- interface-policy:descriptor -->
```json
{
  "schema": "https://deepworkplan.com/schema/addon-descriptor/v1.json",
  "key": "protoyard",
  "product": { "repo": "DailybotHQ/protoyard", "tag": "vX.Y.Z", "interface": 1 },
  "detect": { "command": "protoyard --version --json", "interface_from": "json:interface" },
  "provides_abilities": [],
  "requires_grants": []
}
```

- **`tag`** is a placeholder: pin the first release tag that ships
  interface 1 (none is tagged yet, see above), never a branch.
- **`detect.command`** uses `--version --json` and not `doctor --json`. DWP
  runs it without a shell and treats only exit 0 as present, and `doctor`
  exits 1 or 3 on an unhealthy or missing workspace.
- **`requires_grants`** and the rest of the addon (its `SKILL.md`, `SPEC.md`
  and exploration templates) belong to the addon packet (ADR-035). This
  example shows only the pin and the detection.
- **Mismatches:** DWP treats a product whose interface major differs from the
  descriptor's as not available, with one warning.

### Not a security boundary

The interface is a compatibility contract, not a security mechanism:
- **It is self-reported.** `interface` and `capabilities` are what the binary
  found on `PATH` says about itself. Anything can print
  `{"version":"1.0.0","interface":1}`.
- **It proves nothing about the binary:**
  - the probe does not authenticate the binary or prove where it came from;
  - it does not check the binary's integrity;
  - it grants no permission.
- **Check provenance separately.** Pin the release tag and verify how the CLI
  was installed.
- **Simulated features stay simulated.** Roles, sign-in and other simulated
  behavior inside prototypes are never security, whatever the interface
  reports.

## See also

- [DEVELOPMENT_COMMANDS](DEVELOPMENT_COMMANDS.md): every command, its flags and
  its envelope `data`.
- [CLI README](../packages/cli/README.md#json-output-and-exit-codes): the JSON
  envelope and exit codes.
- [MCP](MCP.md): the stdio MCP server over the same envelopes.
- [Skill](SKILL.md) for agents that use these commands.
- The doctor command source:
  [`packages/cli/src/commands/doctor.ts`](../packages/cli/src/commands/doctor.ts).
