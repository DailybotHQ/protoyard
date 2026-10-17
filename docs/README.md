# Protoyard documentation

These docs describe what works in this repository today. Start with the
[Quickstart](QUICKSTART.md) if you want to use Protoyard, or with
[AGENTS.md](../AGENTS.md) if you are a coding agent.

## Use it

| Guide | For |
| --- | --- |
| [Quickstart](QUICKSTART.md) | Clone, open the gallery, create and export a prototype |
| [Agent guide](AGENT_GUIDE.md) | The build loop and copy-paste prompts for coding agents |
| [Database](DATABASE.md) | Schemas, migrations, services, reactive queries, storage caveats |
| [Scenarios](SCENARIOS.md) | Scenario axes, generators, personas and permissions, time, environment, snapshots |
| [Themes](THEMES.md) | Presets, tokens, light/dark/system, custom themes |
| [Publishing](PUBLISHING.md) | Static builds, ZIP export, base paths, provider adapters |

## Understand it

| Guide | For |
| --- | --- |
| [Product spec](PRODUCT_SPEC.md) | What Protoyard is, who it is for, non-goals |
| [Architecture](ARCHITECTURE.md) | Packages, the prototype contract, runtime lifecycle, isolation, scale |
| [Decisions](DECISIONS.md) | ADRs and trade-offs |
| [Security](SECURITY.md) | Threat model and trust boundaries |
| [Performance](PERFORMANCE.md) | Measured numbers and budgets |

## Contribute

| Guide | For |
| --- | --- |
| [Standards](STANDARDS.md) | Coding rules (TypeScript, Svelte 5, Biome, domain, naming, a11y) |
| [Testing guide](TESTING_GUIDE.md) | Full and scoped commands, source→test map, posture |
| [Development commands](DEVELOPMENT_COMMANDS.md) | Every script and CLI command |
| [AI agent onboarding](AI_AGENT_ONBOARDING.md) | First-session checklist |
| [AI agent collaboration](AI_AGENT_COLLAB.md) | Ownership, lockfile, commits, handoffs |
| [Implementation plan](IMPLEMENTATION_PLAN.md) | What is verified and what is deferred |

Package and app references live next to the code: each `packages/*/README.md`,
`apps/gallery/README.md`, `templates/*/README.md` and
`prototypes/*/README.md`.
