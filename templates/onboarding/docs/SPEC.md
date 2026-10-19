# Onboarding Wizard: spec

## Problem

TODO: the product problem in two or three sentences.

The `onboarding` template you started from: A multi-step onboarding starter: profile, workspace, teammate invites and preferences with per-step validation, progress saved to IndexedDB after every step, skippable optional steps, a summary and a post-onboarding home.

## Users

TODO: who uses it, mapped to the roles in [PERMISSIONS.md](PERMISSIONS.md).

## Capabilities

TODO: what a user can do, one line each, linked to [FLOWS.md](FLOWS.md).

## Non-goals

TODO: what this prototype deliberately does not do.

## Scenarios

<!-- protoyard:generated:scenarios -->
| Scenario | Name | Group | Density | Seed | Generator knobs | Description |
| --- | --- | --- | --- | --- | --- | --- |
| `completed` | Completed | Lifecycle | sparse | 33 | — | Onboarding finished a week ago: shows the post-onboarding home with the summary and pending invitations. |
| `half-complete` | Half complete | Lifecycle | sparse | 22 | — | Profile and workspace are done (progress 0.5); the owner resumes at step 3, Invite teammates. |
| `not-started` | Not started | Lifecycle | empty | 11 | — | The owner signed up a minute ago and lands on step 1 of the wizard. |
| `viewer` | Viewer joins | Roles | normal | 44 | — | A viewer invited to an existing workspace. Their wizard is at the Workspace step, which they can review but not change; inviting is blocked. |
<!-- /protoyard:generated:scenarios -->

## Honest boundaries

TODO: name every simulated part plainly (data in the visitor's browser, personas instead of authentication, simulated permissions, payments, network and time). See [docs/SPECS.md](../../../docs/SPECS.md#honest-boundaries).

## Rebuild as a real app

TODO: for each prototype piece (schema, services, policy, personas, environment failures, scenarios, screens), the real counterpart to design. See [docs/SPECS.md](../../../docs/SPECS.md#rebuild-as-a-real-app).

## Manifest facts

<!-- protoyard:generated:manifest -->
| Field | Value |
| --- | --- |
| id | `template.onboarding` |
| slug | `onboarding` |
| name | Onboarding Wizard |
| version | 0.1.0 |
| platform | responsive |
| category | starter |
| default scenario | `half-complete` |
| default theme | `violet` |
| storage namespace | `template-onboarding` |
| schema version | 1 |
| generator version | 2 |
| timeline | no |
| themes | built-in presets only |
<!-- /protoyard:generated:manifest -->
