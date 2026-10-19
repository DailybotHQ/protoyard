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
| [Generator](GENERATOR.md) | Blueprints to prototypes: format, `protoyard generate`, regeneration, migrations and drift checks |
| [Scenarios](SCENARIOS.md) | Scenario axes, generators, personas and permissions, time, environment, snapshots |
| [Themes](THEMES.md) | Style model, palette engine, the 32-theme library, Theme Studio, the `theme` CLI, brand blocks |
| [Shells](SHELLS.md) | Device and host shells (phone, tablet, desktop window, browser, widget host, extension popup, side panel) |
| [SaaS kits](SAAS_KITS.md) | Add simulated SaaS flows, compose scenarios and understand honest boundaries |
| [AI kits](AI_KITS.md) | Simulated assistants, agents, voice and widgets; honest boundaries |
| [Specs](SPECS.md) | The per-prototype spec harness: files, generated regions, rebuild kit, rebuild as a real app |
| [Publishing](PUBLISHING.md) | Static builds, ZIP export, base paths, provider adapters, batch publish, review index, CI/CD templates |

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
`prototypes/*/README.md`. The PLAN_002 packages:

| Package | For |
| --- | --- |
| [blueprint](../packages/blueprint/README.md) | Data-only `blueprint.json`: validation, derived stores, migrations, policy, entity services |
| [crud](../packages/crud/README.md) | `EntityList`, `EntityDetail` and `EntityForm` for blueprint-driven screens |
| [saas](../packages/saas/README.md) | Simulated SaaS engine: tables, schemas, services and integrity (simulation, not security) |
| [saas-ui](../packages/saas-ui/README.md) | SaaS kit screens and `saasRoutes` |
| [ai](../packages/ai/README.md) | Deterministic simulated AI engine: conversations, agents and tools, voice |
| [ai-ui](../packages/ai-ui/README.md) | Assistant workspace, composer, safe rich answers, canvas and widget modes |

Product blueprints for `protoyard generate` live in
[blueprints/](../blueprints/README.md) (`pnpm protoyard list --kind blueprint`).
`helpdesk-demo` (Beacon Help Desk) is the `protoyard generate` flagship:
`blueprint.json` → CRUD + SLA dashboard + ticket workspace
([README](../prototypes/helpdesk-demo/README.md)).
