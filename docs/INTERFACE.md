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
| `mcp` | `protoyard mcp`, the stdio MCP JSON-RPC transport | available |

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

## See also

- [Skill](SKILL.md) for agents that use these commands.
- The doctor command source:
  [`packages/cli/src/commands/doctor.ts`](../packages/cli/src/commands/doctor.ts).
- The full interface stability policy is planned in its own guide section.
  Until then, this page is the contract for interface 1.
