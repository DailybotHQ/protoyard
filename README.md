<div align="center">

<img src="assets/logo.png" alt="Protoyard logo" width="520">

# Protoyard

### Build prototypes that feel real.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js 24.20+](https://img.shields.io/badge/node-%E2%89%A524.20-339933.svg)](package.json)
[![pnpm 11](https://img.shields.io/badge/pnpm-11-F69220.svg)](package.json)

**Real behavior. Fake infrastructure.** Protoyard is an open-source,
browser-first workspace where people and coding agents build many
independent prototypes that behave like real products: a persistent database
in the browser, deterministic scenarios, personas and permissions, simulated
time and network, themes, layouts and device shells, and one-command static
export. There is no backend to run, deploy or secure.

[Quickstart](docs/QUICKSTART.md) ·
[What you can build](#what-you-can-build) ·
[Showcase](#the-showcase) ·
[Built for agents](#built-for-agents) ·
[Docs](#documentation) ·
[Honest boundaries](#honest-boundaries)

![The Protoyard gallery](docs/assets/screenshots/gallery.png)

</div>

## Why

Mockups can't show what your product looks like **for a brand-new user, for
an admin six months in, with a thousand records, offline, or after the trial
expires**. A real app can, but it needs a backend, authentication and a
deployment before the idea is even validated.

Protoyard sits in between. Each prototype is a small Vite + Svelte 5 app on a
shared runtime. Click anything and it does something real: records persist,
permissions are enforced in services, failures show real error states. Load a
scenario and the same seed rebuilds the same world every time. When it is
ready, export it as a static site that runs on any host.

## 60-second start

You need Node.js 24.20 or newer and pnpm 11 (through Corepack).

```bash
git clone https://github.com/DailybotHQ/protoyard
cd protoyard
corepack enable && pnpm install
pnpm dev                                          # gallery + local control server → http://localhost:4321/
```

Open **Pipeline CRM**, start it, and press **Ctrl/⌘ + .** inside the app to
open DevTools. Load a scenario, switch to the viewer persona, go offline, save
a snapshot. Then build your own:

```bash
pnpm protoyard new my-idea --template dashboard   # any of the 27 templates
pnpm protoyard dev my-idea                        # only that app, with HMR
pnpm protoyard validate my-idea --build           # contract, scenarios, types, production build
pnpm protoyard export my-idea                     # → artifacts/my-idea/my-idea.zip (+ sha256)
pnpm protoyard showcase --serve                   # every prototype and template as ONE site → http://127.0.0.1:4500/
```

The full walkthrough is in [docs/QUICKSTART.md](docs/QUICKSTART.md).

## What you can build

Every capability below runs in the browser, with fictional data.

### The core of every prototype

| Capability | What you get | Read |
| --- | --- | --- |
| **Persistent worlds** | IndexedDB through Dexie: typed tables, migrations, transactions and live queries. Changes survive reloads, and each prototype has its own namespace. | [Database](docs/DATABASE.md) |
| **Deterministic scenarios** | Compose actor, organization age, tenure, data density, activity and subscription. Same seed, same world. | [Scenarios](docs/SCENARIOS.md) |
| **Personas and permissions** | Switch owner, admin, member, viewer or custom roles without losing data. Policies are enforced in services, not just hidden in the UI. | [Scenarios](docs/SCENARIOS.md#personas-roles-and-policy) |
| **Simulated time** | Preview any date, or commit simulated days of activity. 7 × 1 day equals 1 × 7 days. | [Scenarios](docs/SCENARIOS.md#time) |
| **Simulated environment** | Offline, latency, reproducible 403/429/500 and timeouts, partial outages, feature flags, an optional `fetch`-compatible mock HTTP layer. | [Scenarios](docs/SCENARIOS.md#environment), [http](packages/http/README.md) |
| **Snapshots** | Save the exact world after your edits, restore it, export it to a file and import it with validation. | [Scenarios](docs/SCENARIOS.md#snapshots) |
| **DevTools** | A floating control center for scenario, personas, time, data, environment, appearance, snapshots and share links. Left out of public builds by default. | [devtools](packages/devtools/README.md) |

### Look and feel

| Capability | What you get | Read |
| --- | --- | --- |
| **Themes** | Six AA-checked presets plus a 64-theme library in six collections (including high-contrast AAA and colorblind-safe), palettes from one brand color, a live **Theme Studio** and the `protoyard theme` CLI. No flash on load. | [Themes](docs/THEMES.md) |
| **Layouts** | Twelve shared page layouts (sidebar, rail, top nav, master-detail, dashboard grid, docs, wizard, mobile tabs…), switchable live or with `?layout=`. | [Layouts](docs/LAYOUTS.md) |
| **Shells** | The same app as a phone, tablet, desktop window, browser tab, widget on a fictional site, extension popup or side panel. They simulate a device; they do not emulate one. | [Shells](docs/SHELLS.md) |
| **UI kit** | Svelte 5 + Bits UI + Tailwind 4 components and product patterns, all in one live catalog (`ui-kit`). | [ui](packages/ui/README.md) |

### Kits beyond CRUD

| Kit | What you get | Read |
| --- | --- | --- |
| **Rich views** | Board with WIP limits, calendar with recurrence, Gantt timeline with dependencies, a virtualized data grid, trees, an offline fictional map, a Markdown editor, activity, files and a command palette. Each loads lazily. | [Views](docs/VIEWS.md) |
| **Charts** | Protoyard's own chart kit (no third-party chart library): cartesian, part-whole, matrix, compact, Canvas and geo families with keyboard access and table fallbacks. | [Charts](docs/CHARTS.md) |
| **Analytics** | KPIs, date ranges, filters and segments, funnels, cohorts and an editable dashboard grid over deterministic simulated events. | [Analytics](docs/ANALYTICS.md) |
| **SaaS kits** | Simulated sign-up and sign-in, SSO with a fake OAuth round trip, magic links, MFA, invitations, workspaces, onboarding, plans, checkout and invoices, with an in-app inbox for the "emails". | [SaaS kits](docs/SAAS_KITS.md) |
| **AI kits** | Scripted, deterministic assistants: streaming answers, agents with tool calls and approvals, safe rich answers, a canvas, voice mode and an embeddable widget. No model API. | [AI kits](docs/AI_KITS.md) |
| **Avatars** | 175 portraits of fictional people, assigned deterministically by generators, with initials as the fallback. | [Avatars](docs/AVATARS.md) |

### From idea to shared link

| Capability | What you get | Read |
| --- | --- | --- |
| **Blueprint generator** | Describe a product as a data-only `blueprint.json` and `protoyard generate` builds a working prototype: list, detail and form screens plus dashboard, board, calendar, timeline, map, analytics and settings screens. Edit the blueprint and regenerate. | [Generator](docs/GENERATOR.md) |
| **Brief to prototype** | `protoyard blueprint new --from-brief` turns a prose brief into a validated blueprint offline, with no model call, ready to review and generate. | [Brief to prototype](docs/BRIEF_TO_PROTOTYPE.md) |
| **Specs** | Every prototype carries an `AGENTS.md` and `docs/` spec whose generated regions stay in sync with the code, plus a rebuild kit for turning it into a real app. | [Specs](docs/SPECS.md) |
| **Review comments** | Opt-in comments pinned to screens of a built prototype, stored locally, on Cloudflare Pages, on your own endpoint or in a Claude artifact. `comments pull` turns them into a `REVIEW.md` an agent can plan from. | [Review comments](docs/REVIEW_COMMENTS.md) |
| **Static export** | A relocatable `dist/`, a ZIP and a build manifest with checksums, plus an isolation check that no other prototype leaked in. Hash routing, so any static host works. | [Publishing](docs/PUBLISHING.md#export-and-the-zip) |
| **Publishing** | Cloudflare Pages with a true `--dry-run`; one, many or `--all` prototypes; a deploy ledger, a team review page and CI templates. Netlify and Vercel adapters are experimental. | [Publishing](docs/PUBLISHING.md#publish-adapters) |
| **Private Claude artifact** | `export --target artifact` packs one prototype for a private claude.ai artifact and checks every artifact rule; the `share-as-artifact` skill publishes it after your approval. | [Publishing](docs/PUBLISHING.md#sharing-as-a-claude-artifact) |

## The showcase

15 prototypes live in `prototypes/`, all with fictional data. Each has its
own README, `AGENTS.md` and `docs/` spec.

| | Prototype | Demonstrates |
| --- | --- | --- |
| <img src="prototypes/crm-demo/public/thumbnail.png" alt="Pipeline CRM" width="240"> | **Pipeline CRM** · `crm-demo` | Desktop SaaS: companies, contacts, an accessible kanban pipeline, owner/admin/rep/viewer roles with per-record rules, a v1→v2 migration, 9 scenarios up to an enterprise-scale world |
| <img src="prototypes/mobile-banking-demo/public/thumbnail.png" alt="Lumen Bank" width="240"> | **Lumen Bank** · `mobile-banking-demo` | Mobile-first banking: an integer-cent ledger, atomic transfers that roll back on failure, locked and dormant accounts, transfer caps, offline |
| <img src="prototypes/ai-chat-demo/public/thumbnail.png" alt="Relay" width="240"> | **Relay** · `ai-chat-demo` | Team chat with scripted AI agents: streamed replies, cancel and retry, partial outages, a 600-message thread |
| <img src="prototypes/ui-kit/public/thumbnail.png" alt="Protoyard UI Kit" width="240"> | **Protoyard UI Kit** · `ui-kit` | Every component in every state, plus a theme lab with live tokens and contrast |
| <img src="prototypes/lattice-saas-demo/public/thumbnail.png" alt="Lattice" width="240"> | **Lattice** · `lattice-saas-demo` | A B2B SaaS journey: sign-up, magic links, MFA, onboarding, workspaces, invitations, an inbox and billing |
| <img src="prototypes/nova-assistant-demo/public/thumbnail.png" alt="Nova Assistant" width="240"> | **Nova Assistant** · `nova-assistant-demo` | An AI assistant with voice, agent tools and approvals, a canvas, a widget and a 5,000-message history |
| <img src="prototypes/relay-chat-demo/public/thumbnail.png" alt="Relay Chat" width="240"> | **Relay Chat** · `relay-chat-demo` | Slack-like team chat with an AI teammate and huddles; review comments through the artifact adapter |
| <img src="prototypes/support-widget-demo/public/thumbnail.png" alt="Northwind Help" width="240"> | **Northwind Help** · `support-widget-demo` | A support widget on a fictional customer site (the widget-host shell) |
| <img src="prototypes/keel-projects-demo/public/thumbnail.png" alt="Keel Projects" width="240"> | **Keel Projects** · `keel-projects-demo` | Project management: board, calendar, a critical-path timeline, a 10,000-task grid, review comments |
| <img src="prototypes/pebblestat-analytics-demo/public/thumbnail.png" alt="Pebblestat Analytics" width="240"> | **Pebblestat Analytics** · `pebblestat-analytics-demo` | Product analytics: dashboards, insights, funnels, retention, alerts, review comments |
| <img src="prototypes/atlas-workspace-demo/public/thumbnail.png" alt="Atlas Workspace" width="240"> | **Atlas Workspace** · `atlas-workspace-demo` | The shared layout system: a layout gallery, a docs-style playbook and a workspace tour |
| <img src="prototypes/helpdesk-demo/public/thumbnail.png" alt="Beacon Help Desk" width="240"> | **Beacon Help Desk** · `helpdesk-demo` | Generated from a blueprint: CRUD plus an owned SLA dashboard and ticket workspace |
| <img src="prototypes/harbor-dispatch-demo/public/thumbnail.png" alt="Harborlight Dispatch" width="240"> | **Harborlight Dispatch** · `harbor-dispatch-demo` | Generated from a blueprint: logistics board, map, timeline, calendar and dashboard |
| <img src="prototypes/cadence-studio-demo/public/thumbnail.png" alt="Cadence Studio" width="240"> | **Cadence Studio** · `cadence-studio-demo` | Generated from a blueprint: studio bookings on a weekly calendar |
| <img src="prototypes/pulse-revenue-demo/public/thumbnail.png" alt="Pulse Revenue" width="240"> | **Pulse Revenue** · `pulse-revenue-demo` | Generated from a blueprint: revenue dashboard, explorer and lifecycle board |

`pnpm build:showcase` builds the gallery, the marketplace and a live demo of
every prototype and template as one static site in `artifacts/showcase/`,
with no server needed. `pnpm preview:showcase` serves it, and a manual GitHub
Pages workflow can host it ([Publishing](docs/PUBLISHING.md#the-showcase-gallery--live-demos-as-one-site)).

### Templates and blueprints

**27 templates** in `templates/`. Each is a working app with a database,
roles, scenarios, tests and a spec, and runs as a live demo with
`pnpm protoyard dev <template>`:

| Templates | Start here for |
| --- | --- |
| `blank`, `dashboard`, `mobile-app`, `onboarding`, `task-manager`, `ecommerce`, `chat` | Notes, a SaaS admin, a mobile app, a wizard, a board, a storefront, a chat with a scripted assistant |
| `crud-app` | Blueprint-driven CRUD (the base of `protoyard generate`) |
| `b2b-saas`, `marketplace`, `admin-console` | Sign-in, SSO, workspaces and billing; a two-sided marketplace; an internal admin |
| `desktop-app`, `chat-widget`, `plugin-panel` | Products in a shell: a desktop window, a widget on a fictional site, a side panel |
| `ai-assistant`, `team-chat`, `agent-console` | An assistant workspace, team chat with AI bots, an agent playground |
| `analytics`, `fintech-dashboard`, `iot-monitoring` | Product analytics, personal finance, device monitoring on an offline map |
| `project-management`, `booking-calendar`, `logistics-map`, `clinic` | Sprints, bookings, routes with simulated ETAs, a clinic front desk |
| `docs-wiki`, `social-feed`, `course-lms` | A wiki with safe Markdown, a social feed, courses with quizzes |

<details>
<summary><strong>See all 27 templates</strong></summary>
<br>
<table>
<tr><td align="center"><img src="templates/admin-console/public/thumbnail.png" alt="admin-console template" width="260"><br><code>admin-console</code></td><td align="center"><img src="templates/agent-console/public/thumbnail.png" alt="agent-console template" width="260"><br><code>agent-console</code></td><td align="center"><img src="templates/ai-assistant/public/thumbnail.png" alt="ai-assistant template" width="260"><br><code>ai-assistant</code></td></tr>
<tr><td align="center"><img src="templates/analytics/public/thumbnail.png" alt="analytics template" width="260"><br><code>analytics</code></td><td align="center"><img src="templates/b2b-saas/public/thumbnail.png" alt="b2b-saas template" width="260"><br><code>b2b-saas</code></td><td align="center"><img src="templates/blank/public/thumbnail.png" alt="blank template" width="260"><br><code>blank</code></td></tr>
<tr><td align="center"><img src="templates/booking-calendar/public/thumbnail.png" alt="booking-calendar template" width="260"><br><code>booking-calendar</code></td><td align="center"><img src="templates/chat/public/thumbnail.png" alt="chat template" width="260"><br><code>chat</code></td><td align="center"><img src="templates/chat-widget/public/thumbnail.png" alt="chat-widget template" width="260"><br><code>chat-widget</code></td></tr>
<tr><td align="center"><img src="templates/clinic/public/thumbnail.png" alt="clinic template" width="260"><br><code>clinic</code></td><td align="center"><img src="templates/course-lms/public/thumbnail.png" alt="course-lms template" width="260"><br><code>course-lms</code></td><td align="center"><img src="templates/crud-app/public/thumbnail.png" alt="crud-app template" width="260"><br><code>crud-app</code></td></tr>
<tr><td align="center"><img src="templates/dashboard/public/thumbnail.png" alt="dashboard template" width="260"><br><code>dashboard</code></td><td align="center"><img src="templates/desktop-app/public/thumbnail.png" alt="desktop-app template" width="260"><br><code>desktop-app</code></td><td align="center"><img src="templates/docs-wiki/public/thumbnail.png" alt="docs-wiki template" width="260"><br><code>docs-wiki</code></td></tr>
<tr><td align="center"><img src="templates/ecommerce/public/thumbnail.png" alt="ecommerce template" width="260"><br><code>ecommerce</code></td><td align="center"><img src="templates/fintech-dashboard/public/thumbnail.png" alt="fintech-dashboard template" width="260"><br><code>fintech-dashboard</code></td><td align="center"><img src="templates/iot-monitoring/public/thumbnail.png" alt="iot-monitoring template" width="260"><br><code>iot-monitoring</code></td></tr>
<tr><td align="center"><img src="templates/logistics-map/public/thumbnail.png" alt="logistics-map template" width="260"><br><code>logistics-map</code></td><td align="center"><img src="templates/marketplace/public/thumbnail.png" alt="marketplace template" width="260"><br><code>marketplace</code></td><td align="center"><img src="templates/mobile-app/public/thumbnail.png" alt="mobile-app template" width="260"><br><code>mobile-app</code></td></tr>
<tr><td align="center"><img src="templates/onboarding/public/thumbnail.png" alt="onboarding template" width="260"><br><code>onboarding</code></td><td align="center"><img src="templates/plugin-panel/public/thumbnail.png" alt="plugin-panel template" width="260"><br><code>plugin-panel</code></td><td align="center"><img src="templates/project-management/public/thumbnail.png" alt="project-management template" width="260"><br><code>project-management</code></td></tr>
<tr><td align="center"><img src="templates/social-feed/public/thumbnail.png" alt="social-feed template" width="260"><br><code>social-feed</code></td><td align="center"><img src="templates/task-manager/public/thumbnail.png" alt="task-manager template" width="260"><br><code>task-manager</code></td><td align="center"><img src="templates/team-chat/public/thumbnail.png" alt="team-chat template" width="260"><br><code>team-chat</code></td></tr>
</table>
</details>

**40 product blueprints** in [`blueprints/`](blueprints/README.md), from CRM
and inventory to veterinary clinics and utility outages, each one command away
from a working prototype. The gallery's Marketplace (`/marketplace/`) lists
every prototype, template and blueprint.

```bash
pnpm protoyard list --kind template                              # every template
pnpm protoyard new my-bank --from mobile-banking-demo            # remix any prototype (fresh id and storage)
pnpm protoyard generate my-crm --blueprint blueprints/crm.json   # an app from a blueprint
```

## Built for agents

Protoyard was designed to be built by coding agents as much as by people.

- **[AGENTS.md](AGENTS.md)** is the single entry point for Claude Code, Codex,
  Cursor, Gemini, Copilot and others (`CLAUDE.md` links to it). It holds the
  rules, the doc index and verified commands.
- **A CLI made for scripts.** Every `protoyard` command takes `--json`, prints
  one envelope and returns documented exit codes, and every decision has a
  flag.
- **Skills and agents** in `.agents/` (linked as `.claude/` and `.cursor/`):
  skills such as `create-prototype`, `brief-to-prototype`, `add-entity`,
  `add-scenario`, `add-dashboard`, `validate-and-export` and
  `share-as-artifact`, slash commands such as `/new-prototype`,
  `/new-from-brief` and `/share-artifact`, and role agents such as
  `prototype-builder` and `qa` ([catalog](.agents/docs/skills_agents_catalog.md)).
- **Every prototype has a spec** that agents read first and keep current
  (`pnpm protoyard spec <slug> --write`).

The brief → blueprint → prototype loop
([BRIEF_TO_PROTOTYPE.md](docs/BRIEF_TO_PROTOTYPE.md)):

```bash
echo "A salon that books appointments" | pnpm protoyard blueprint new tmp/salon.json --from-brief -   # 1. brief → blueprint, offline
pnpm protoyard blueprint validate tmp/salon.json                                                      # 2. review and validate it
pnpm protoyard generate salon-demo --blueprint tmp/salon.json                                         # 3. blueprint → prototype
pnpm protoyard validate salon-demo --build && pnpm protoyard export salon-demo                        # 4. prove it, ship it
```

Or just ask:

> Create a new Protoyard prototype called `clinic-scheduler` from the
> dashboard template: patients, practitioners and appointments with conflict
> checks; receptionist, practitioner and viewer roles; scenarios for a new
> clinic, a busy month and a fully booked week. Make every action persistent,
> add generator and service tests, then validate and export it. Don't touch
> other prototypes.

More prompts and the full loop: [docs/AGENT_GUIDE.md](docs/AGENT_GUIDE.md).

## Architecture at a glance

```text
packages/core ─ contracts (zod)            prototypes/<slug>/  ← independent Vite + Svelte 5 apps
packages/database ─ Dexie/IndexedDB          protoyard.json      data-only manifest (indexed, never executed)
packages/scenarios ─ seeded generators       src/prototype.ts    schema + policy + scenarios + generator
packages/runtime ─ the engine                src/domain/         services: assert → validate → simulate → transact
packages/renderer-svelte ─ mount + Vite      src/screens/        UI with @protoyard/ui
packages/ui · devtools · themes            apps/gallery ─ Astro, reads only the metadata registry
packages/blueprint · crud ─ generator      blueprints/ ─ data-only product blueprints
packages/views · views-ui ─ rich views     packages/charts · charts-ui ─ charts
packages/analytics · analytics-ui          packages/saas · saas-ui · ai · ai-ui ─ simulated kits
packages/review · review-ui ─ comments     packages/avatars ─ fictional portraits
packages/http · offline ─ optional         packages/cli ─ the `protoyard` command
```

The gallery never compiles prototypes; it reads a metadata index. Target
commands work on one slug at a time, and every build contains only that
prototype's code, which the export isolation check verifies. Engine packages
never import Svelte, and rich views, charts and review comments load through
lazy subpaths. Details:
[ARCHITECTURE.md](docs/ARCHITECTURE.md) and [DECISIONS.md](docs/DECISIONS.md).

### Measured, not estimated

All from [docs/PERFORMANCE.md](docs/PERFORMANCE.md), with method, machine and
date (Apple M1 Max, 2026-10-17 to 2026-10-19):

| What | Measured |
| --- | --- |
| Cold metadata index of 1,000 manifests | 40.6 ms median |
| Loading a 16,075-row `crm-demo` world in Chromium | 628 ms, 0 long tasks |
| Data grid with 100,000 rows: first render | 94 ms median, at most 17 DOM rows, 0 dropped frames in a 5 s scroll |
| Initial JS budget per prototype | 250 KB gzip, checked by `pnpm protoyard budget --all` |

## Honest boundaries

- **No backend.** Data lives in your browser, per origin. It does not sync
  between devices, and the browser may clear it, so export snapshots of
  anything worth keeping.
- **Simulated auth is not security.** Personas, roles, sign-in, SSO, MFA and
  billing simulate product behavior. Prototypes on one origin can read each
  other's storage; untrusted prototypes need separate origins.
- **No real services.** Demo data is fictional, nothing connects to real
  banks, payments or AI providers, and the AI kits are scripted.
- **Review comments are not authentication.** Reviewer names are
  self-declared, and a review key only keeps casual visitors out.
- **Claude artifacts have limits.** An artifact is private by default and
  each viewer gets their own prototype data. One artifact version holds at
  most 511 files, so share one prototype per artifact; the full showcase never
  fits in one. Boot, routing and DevTools inside the claude.ai viewer have
  not been verified yet ([details](docs/PUBLISHING.md#verified-and-not-verified)).
- **Experimental adapters.** Netlify and Vercel publishing is untested against
  the live services. Real deploys need your own credentials.
- **Browser, not native.** Mobile prototypes run in the mobile browser, and
  shells simulate devices rather than emulate them.

## Commands

```bash
pnpm dev | dev:create | build | preview | lint | typecheck | test | test:e2e | check
pnpm build:showcase | preview:showcase | visual:sweep | thumbnails | bench:index | hygiene
pnpm protoyard help | doctor | list | index | new | generate | dev | validate | spec | build | budget
pnpm protoyard export | preview | publish | review-index | showcase | ci | affected | theme | scenario
pnpm protoyard blueprint | artifact | comments | snapshot | gallery | control-server
```

`pnpm protoyard help <command>` prints any command's flags. The full
reference is [docs/DEVELOPMENT_COMMANDS.md](docs/DEVELOPMENT_COMMANDS.md).

## Documentation

| Start | Build | Ship | Understand and contribute |
| --- | --- | --- | --- |
| [Quickstart](docs/QUICKSTART.md) | [Database](docs/DATABASE.md) | [Publishing](docs/PUBLISHING.md) | [Product spec](docs/PRODUCT_SPEC.md) |
| [Agent guide](docs/AGENT_GUIDE.md) | [Scenarios](docs/SCENARIOS.md) | [Review comments](docs/REVIEW_COMMENTS.md) | [Architecture](docs/ARCHITECTURE.md) |
| [AI agent onboarding](docs/AI_AGENT_ONBOARDING.md) | [Generator](docs/GENERATOR.md) | [Specs](docs/SPECS.md) | [Decisions](docs/DECISIONS.md) |
| [Development commands](docs/DEVELOPMENT_COMMANDS.md) | [Brief to prototype](docs/BRIEF_TO_PROTOTYPE.md) | [Performance](docs/PERFORMANCE.md) | [Security](docs/SECURITY.md) |
| | [Themes](docs/THEMES.md) | | [Standards](docs/STANDARDS.md) |
| | [Layouts](docs/LAYOUTS.md) · [Shells](docs/SHELLS.md) | | [Testing guide](docs/TESTING_GUIDE.md) |
| | [Views](docs/VIEWS.md) · [Charts](docs/CHARTS.md) | | [AI agent collaboration](docs/AI_AGENT_COLLAB.md) |
| | [Analytics](docs/ANALYTICS.md) · [Avatars](docs/AVATARS.md) | | [Implementation plan](docs/IMPLEMENTATION_PLAN.md) |
| | [SaaS kits](docs/SAAS_KITS.md) · [AI kits](docs/AI_KITS.md) | | |

The full index is [docs/README.md](docs/README.md). Every package, template
and prototype also has its own `README.md`.

## Quality

- 4,400+ unit and integration tests (4,454 in 410 files at the last full run,
  recorded in [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md)), most
  of them on the real runtime with an in-memory IndexedDB.
- Playwright E2E with axe checks on real static builds, on desktop and a
  Pixel 7 viewport.
- Biome, strict erasable TypeScript, `svelte-check` and `astro check`.
- Every theme is AA-contrast tested, and the high-contrast collection AAA.
- Bundle budgets per prototype and generated specs that must stay current
  (`pnpm protoyard spec --all --check`).
- A public-hygiene check for secrets and stray files, and an internal security
  review of the CLI, the local control server, snapshot import and publishing,
  with regression tests for the fixed findings
  ([threat model](docs/SECURITY.md)).

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md),
[AGENTS.md](AGENTS.md) and the [Code of Conduct](CODE_OF_CONDUCT.md), and
report vulnerabilities privately ([SECURITY.md](SECURITY.md)). Before a pull
request:

```bash
pnpm check                                  # lint + typecheck + unit and integration tests
pnpm test:e2e                               # Playwright on real builds (pnpm test:e2e:install once)
pnpm protoyard validate <slug> --build      # for each prototype you touched
pnpm hygiene                                # no secrets or stray files
```

Scoped commands and the source-to-test map are in
[docs/TESTING_GUIDE.md](docs/TESTING_GUIDE.md). Commits follow Conventional
Commits (`type(scope): summary`). Long work runs as
[Deep Work Plans](https://deepworkplan.com) in `.dwp/`.

## License

[MIT](LICENSE) © Dailybot, Inc.
