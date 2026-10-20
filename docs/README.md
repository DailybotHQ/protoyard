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
| [Generator](GENERATOR.md) | Blueprints to prototypes: format, screens and layouts, `protoyard generate`, regeneration, migrations and drift checks |
| [Brief to prototype](BRIEF_TO_PROTOTYPE.md) | Prose brief → offline blueprint → review → generate → validate → export |
| [Scenarios](SCENARIOS.md) | Scenario axes, generators, personas and permissions, time, environment, snapshots |
| [Themes](THEMES.md) | Style model, palette engine, the 64-theme library, Theme Studio, the `theme` CLI, brand blocks |
| [Layouts](LAYOUTS.md) | Shared layout catalog, manifest setup, responsive fallbacks, shell composition, authoring and tests |
| [Shells](SHELLS.md) | Device and host shells (phone, tablet, desktop window, browser, widget host, extension popup, side panel) |
| [Views](VIEWS.md) | Rich views (board, calendar, timeline, grid, tree, map, editor, activity, files, settings, states, command palette): choosing one, service contracts, keyboard/phone behavior, scenario helpers, bundle sizes, limits |
| [Charts](CHARTS.md) | Every chart: props, data contracts, accessibility, palette, SVG/Canvas, measured sizes and limits |
| [Analytics](ANALYTICS.md) | Analytics engine, generators, views, the `analytics` template and the Pebblestat flagship, with measured numbers and limits |
| [SaaS kits](SAAS_KITS.md) | Add simulated SaaS flows, compose scenarios and understand honest boundaries |
| [AI kits](AI_KITS.md) | Simulated assistants, agents, voice and widgets; honest boundaries |
| [Avatars](AVATARS.md) | 175 fictional portraits: provenance and license, seeded assignment, rendering and URL safety, measured sizes, re-import |
| [Specs](SPECS.md) | The per-prototype spec harness: files, generated regions, rebuild kit, rebuild as a real app. Every prototype ships `AGENTS.md` + `docs/` (SPEC, DATA_MODEL, FLOWS, SCREENS, PERMISSIONS), checked by `pnpm protoyard validate <slug> --strict-spec`. |
| [Publishing](PUBLISHING.md) | Static builds, ZIP export, base paths, provider adapters, batch publish, review index, CI/CD templates, sharing as a private Claude artifact |
| [Review comments](REVIEW_COMMENTS.md) | Opt-in review comments, storage adapters (local, http/cloudflare, the Claude artifact adapter), who sees what, honest limits |

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
`prototypes/*/README.md`. The packages added by PLAN_002 and PLAN_003:

| Package | For |
| --- | --- |
| [blueprint](../packages/blueprint/README.md) | Data-only `blueprint.json`: validation, derived stores, migrations, policy, entity services |
| [crud](../packages/crud/README.md) | `EntityList`, `EntityDetail` and `EntityForm`, plus lazy dashboard, board, calendar, timeline, map, analytics and settings screens for blueprint-driven apps |
| [saas](../packages/saas/README.md) | Simulated SaaS engine: tables, schemas, services and integrity (simulation, not security) |
| [saas-ui](../packages/saas-ui/README.md) | SaaS kit screens and `saasRoutes` |
| [ai](../packages/ai/README.md) | Deterministic simulated AI engine: conversations, agents and tools, voice |
| [ai-ui](../packages/ai-ui/README.md) | Assistant workspace, composer, safe rich answers, canvas and widget modes |
| [charts](../packages/charts/README.md) | Chart math: scales, shapes, downsampling, layouts, theme-token palettes (no Svelte) |
| [charts-ui](../packages/charts-ui/README.md) | Svelte charts, one lazy subpath per family |
| [analytics](../packages/analytics/README.md) | Analytics engine: events, metrics, date ranges, funnels, cohorts, deterministic generators (no Svelte) |
| [analytics-ui](../packages/analytics-ui/README.md) | KPI tiles, date range, filters and segments, drill-down, cohort, funnel and dashboard grid views |
| [views](../packages/views/README.md) | Rich view engines and deterministic scenario fragments (no Svelte) |
| [views-ui](../packages/views-ui/README.md) | Lazy Svelte rich views, one subpath per view |
| [review](../packages/review/README.md) | Review comments engine: anchors, adapter contract, local, http and artifact adapters, server handler |
| [review-ui](../packages/review-ui/README.md) | Lazy review overlay, pins, threads, panel and toolbar |
| [avatars](../packages/avatars/README.md) | 175 fictional portraits as WebP with a verified manifest (data only) |

Product blueprints for `protoyard generate` live in
[blueprints/](../blueprints/README.md): 40 catalog entries
(`pnpm protoyard list --kind blueprint`). `helpdesk-demo` (Beacon Help Desk)
is the first `protoyard generate` flagship: `blueprint.json` → CRUD + SLA
dashboard + ticket workspace ([README](../prototypes/helpdesk-demo/README.md)).
Three more are generated from blueprints with rich screens:
[`harbor-dispatch-demo`](../prototypes/harbor-dispatch-demo/README.md)
(logistics: board, map, timeline, calendar, dashboard),
[`cadence-studio-demo`](../prototypes/cadence-studio-demo/README.md)
(studio bookings: weekly calendar, dashboard) and
[`pulse-revenue-demo`](../prototypes/pulse-revenue-demo/README.md)
(revenue analytics: dashboard, explorer, lifecycle board).
