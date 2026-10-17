# Skills & Agents Catalog

Everything in Protoyard's agent kit, as it exists on disk. Update this file in
the same change whenever a skill, agent or command is added, renamed or
removed (`/skill-create` and `/agent-create` do this through the DWP author
flow). Command invocation forms are in [COMMANDS_REFERENCE.md](COMMANDS_REFERENCE.md).

**Tiers** are abstract: `light` (mechanical), `standard` (most engineering),
`heavy` (architecture, security). Agent files set `model: inherit`; map tiers
to concrete models in your harness, in one place (see [../README.md](../README.md)).

## Agents (`.agents/agents/`)

| Agent | Tier | Writes code | Use for |
| --- | --- | --- | --- |
| [reviewer](../agents/reviewer.md) | standard | no | Review a diff for correctness, determinism, isolation, the service contract and honest docs |
| [architect](../agents/architect.md) | heavy | no | Cross-package design and core-contract changes, checked against the ADRs |
| [executor](../agents/executor.md) | standard | yes | Implement a scoped task with tests and surface gates |
| [debugger](../agents/debugger.md) | standard | yes | Root-cause a failing test, nondeterministic scenario, broken build or CLI error |
| [qa](../agents/qa.md) | standard | tests only | Map behaviors to tests, add missing ones, run the verification ladder |
| [perf-optimizer](../agents/perf-optimizer.md) | standard | yes | Measured work on index time, bundle size, generation and dense-world UI |
| [security-auditor](../agents/security-auditor.md) | heavy | no | Audit CLI paths and processes, control server, snapshots, publishing, hygiene |
| [prototype-builder](../agents/prototype-builder.md) | standard | yes | Product brief → new prototype via the CLI, with domain, scenarios, UI, tests and export |
| [scenario-designer](../agents/scenario-designer.md) | standard | yes | Composable, deterministic scenarios, generator knobs, timelines and integrity rules |
| [ux-polisher](../agents/ux-polisher.md) | standard | yes | Accessibility, responsive/mobile, dark mode, loading/empty/error states with `@protoyard/ui` |

## Repository skills (`.agents/skills/`)

| Skill | Tier | Intent | Use for |
| --- | --- | --- | --- |
| [create-prototype](../skills/create-prototype/SKILL.md) | standard | create | `pnpm protoyard new` → domain → scenarios → UI → tests → validate → export |
| [add-scenario](../skills/add-scenario/SKILL.md) | standard | create | Compose presets and fragments, generator knobs, integrity, determinism test |
| [add-entity](../skills/add-entity/SKILL.md) | standard | create | Table + version/migration, policy, assert → zod → `environment.run` → transaction service, `liveQuery` deps, tests |
| [add-ui-component](../skills/add-ui-component/SKILL.md) | standard | create | Shared component in `packages/ui` (tests, a11y, export) or a prototype-local one |
| [add-theme](../skills/add-theme/SKILL.md) | standard | create | Prototype theme via `defineTheme` or a built-in preset in `BUILTIN_THEMES`, with the contrast test |
| [validate-and-export](../skills/validate-and-export/SKILL.md) | light | validate | `validate --build`, preview, `export` with the isolation check |
| [publish-prototype](../skills/publish-prototype/SKILL.md) | standard | deploy | Dry run first; real Cloudflare (wrangler) or other provider publish only with explicit authorization |
| [fix-lint](../skills/fix-lint/SKILL.md) | light | fix | Biome, tsc / svelte-check errors, erasable-syntax and strict-mode pitfalls |
| [write-e2e](../skills/write-e2e/SKILL.md) | standard | test | Playwright specs in `tests/e2e` against real builds via `PROTOYARD_E2E_PROTOTYPES` |

## Vendored skills (do not edit; upgrade through their own flows)

| Skill | Sub-skills | Use for |
| --- | --- | --- |
| [deepworkplan](../skills/deepworkplan/SKILL.md) (7.8.1) | `deepworkplan-create`, `-execute`, `-refine`, `-resume`, `-status`, `-verify`, `-upgrade`, `-onboard`, `-author` | Deep Work Plans, repository conformance, authoring this kit |
| [ai-diff-reviewer](../skills/ai-diff-reviewer/SKILL.md) (3.3.14) | `ai-diff-reviewer-setup`, `-generate-extension`, `-open-pr`, `-apply-review`, `-address-review` | Local diff review with `.review/extension.md`, PR authoring, CI review follow-up |

## Commands (`.agents/commands/`)

| Command | Routes to |
| --- | --- |
| `/new-prototype` | `create-prototype` skill |
| `/commit` | Commit rules in `AGENTS.md` and `docs/AI_AGENT_COLLAB.md` |
| `/code-review` | `ai-diff-reviewer` skill (local review) |
| `/pr` | `ai-diff-reviewer` → `open-pr` sub-skill |
| `/dwp-create`, `/dwp-execute`, `/dwp-refine`, `/dwp-resume`, `/dwp-status`, `/dwp-verify`, `/dwp-upgrade` | `deepworkplan` sub-skills of the same name |
| `/skill-create`, `/agent-create` | `deepworkplan-author` |

## Which one do I use?

| I want to… | Use |
| --- | --- |
| Build a prototype from an idea | `/new-prototype` (or the `prototype-builder` agent) |
| Add a product state to demo | `add-scenario` (`scenario-designer` for a full set) |
| Add a record type or field | `add-entity` |
| Make a screen accessible and mobile-ready | `ux-polisher` agent, `add-ui-component` |
| Ship a ZIP / put it online | `validate-and-export`, then `publish-prototype` |
| Understand a failure | `debugger` agent |
| Review before a PR | `/code-review`, then the `reviewer` agent |
| Plan multi-step or multi-agent work | `/dwp-create` |
