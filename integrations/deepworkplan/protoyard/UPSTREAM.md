# Protoyard DWP addon — upstream handoff

Status: handoff packet only. This file does not open or authorize an upstream
pull request. A maintainer must provide a separate developer **GO** before any
contribution is prepared in the upstream repository.

## Target and compatibility

- Product: `DailybotHQ/protoyard`, addon interface `1`, product tag `v1.1.0`.
- Protoyard's vendored DeepWorkPlan target: `7.8.1`.
- Upstream target: `DailybotHQ/deepworkplan-skill`, currently reporting
  DeepWorkPlan `2.17.0`.
- These surfaces are not wire-compatible. Upstream `2.17.0` does not accept
  this packet unchanged; copying the packet into an upstream checkout is not a
  supported integration procedure.

## Exact differences

| Contract surface | Protoyard packet and vendored 7.8.1 | Upstream 2.17.0 | Port needed |
| --- | --- | --- | --- |
| Addon contents | `SPEC.md`, `SKILL.md`, a descriptor, templates, and conformance fixtures | Addons provide `SPEC.md`, `SKILL.md`, and templates; there is no addon descriptor file | Add the descriptor contract or target an upstream release that already contains it; then adapt the packet to the accepted layout |
| Descriptor schema | Closed `addon-descriptor-v1` object with `key`, product repo/tag/interface, `protoyard --version --json` detection, abilities, and grants | No `addon-descriptor-v1` schema or descriptor loader is present | Port the schema, validation, and read-only detector as an explicit upstream change; preserve interface negotiation and grant limits |
| Registry and sync | v7 `config.py`, `addon_sync.py`, and `resources.py` reconcile `.dwp/config.json`, addon versions, descriptors, and installed resources | No corresponding v7 registry/sync/resource modules are present | Port the registry, sync planner, resource status checks, and non-clobbering writer, or define an upstream-native equivalent with the same consent semantics |
| Onboarding | Phase 7b offers the addon and records an accepted version in the registry; detection and validation are explicit | The 2.17.0 onboarding flow offers addons and runs their hooks, but has no v7 descriptor/registry integration point | Add a v7-compatible hook at the upstream onboarding boundary and keep offer, decline, acceptance, and validation separate |
| Version contract | The packet targets DWP `7.8.1` and validates the Protoyard interface from `protoyard --version --json` | The upstream skill identifies as `2.17.0` and its addon contract predates the v7 packet | Choose a released upstream target containing the contract, or explicitly review and port the versioned contract before rebasing this packet |

The compatibility conclusion is based on the upstream `2.17.0` tree: its
addon folders and onboarding documents exist, while the v7 descriptor schema,
descriptor files, and shared registry/sync/resource modules do not.

## Contribution boundary after GO

The proposed upstream contribution is limited to the addon packet and its
conformance checks:

1. The Protoyard addon spec, skill/onboarding reasoning, and exploration-task
   template, adapted to the upstream addon layout.
2. The `protoyard` descriptor and its fixture-based validation, once the
   upstream descriptor contract exists or is accepted as part of the port.
3. Tests proving read-only detection, explicit consent, registry reconciliation,
   the exploration gates, and the no-network validation recipe.

It does not include Protoyard runtime or CLI changes, a DeepWorkPlan runtime
dependency, generated artifacts, lockfiles, or unrelated upstream addon edits.
The maintainer should confirm the final destination (expected to be
`skills/deepworkplan/addons/protoyard/`, with any mirrored agent-pack files
updated by the upstream release process) during the GO review.

## Port plan

Before proposing a PR, the maintainer must choose one of these reversible
routes:

- **Preferred:** target an upstream release that contains the v7 descriptor,
  registry, sync, resource, and onboarding contracts, then adapt this packet to
  that release's canonical paths.
- **Fallback:** contribute the minimal v7 contract port first: the closed
  descriptor schema and loader, versioned registry/sync/resource reconciliation,
  the Phase 7b hook, and validation fixtures. Keep the Protoyard packet opt-in,
  preserve unrelated configuration, and make the port independently reviewable.

In either route, retain `protoyard --version --json` as the detector. It must be
read-only, exit successfully wherever the CLI is installed, and expose the
integer interface used by the descriptor. Do not substitute `doctor` exit codes
for this probe.

## No-network local validation

These checks validate the packet from a Protoyard checkout without contacting
the network or modifying the upstream repository:

```sh
python3 -m json.tool integrations/deepworkplan/protoyard/addon.json >/dev/null
python3 -B - <<'PY'
import json
from pathlib import Path

descriptor = json.loads(Path("integrations/deepworkplan/protoyard/addon.json").read_text())
assert descriptor["key"] == "protoyard"
assert descriptor["product"]["interface"] == 1
assert descriptor["detect"]["command"] == "protoyard --version --json"
assert descriptor["detect"]["interface_from"] == "json:interface"
assert descriptor["requires_grants"] == ["gate_command_exec", "fs_write_plan_scope"]
print("descriptor ok")
PY
test -s integrations/deepworkplan/protoyard/SPEC.md
test -s integrations/deepworkplan/protoyard/SKILL.md
test -s integrations/deepworkplan/protoyard/templates/EXPLORATION_TASK.md
```

Run the packet's repository-scoped addon tests and public-hygiene check as
available. Any upstream checkout test or PR preparation remains a separate,
GO-gated action.
