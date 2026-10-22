# AGENTS.md — Protoyard

**Purpose:** the single entry point for every AI coding agent (Claude Code,
Codex, Cursor, Gemini, Copilot, Cline, OpenCode…) and human contributor.
`CLAUDE.md` is a symlink to this file. Keep it lean; the details live in the
linked docs.

DWP standard: 7.0.0 (onboarded 2026-10-17; skill 7.8.1)

## What this repository is

**Protoyard — Build prototypes that feel real.** An open-source (MIT,
Dailybot, Inc.) browser-first workspace where people and agents build many
**independent, functional prototypes**. Each one is a Vite + Svelte 5 app with
a persistent IndexedDB fake database, deterministic scenarios, personas and
permissions, simulated time and environment, themes, snapshots, an in-browser
DevTools panel, and one-command static export and publishing. *Real behavior.
Fake infrastructure.* No backend. See [docs/PRODUCT_SPEC.md](docs/PRODUCT_SPEC.md).

## Documentation index

| Area | Doc | What it covers |
| --- | --- | --- |
| Product | [PRODUCT_SPEC](docs/PRODUCT_SPEC.md) | Problem, users, capabilities, non-goals, honest boundaries |
| Architecture | [ARCHITECTURE](docs/ARCHITECTURE.md) | Package graph, prototype contract, runtime lifecycle, isolation, scale |
| Decisions | [DECISIONS](docs/DECISIONS.md) | ADRs (Astro + Vite split, data-only manifests, Dexie, determinism…) |
| Quickstart | [QUICKSTART](docs/QUICKSTART.md) | Clone → gallery → new prototype → export |
| Agents | [AGENT_GUIDE](docs/AGENT_GUIDE.md) | The build loop for a new prototype, prompts, troubleshooting |
| Database | [DATABASE](docs/DATABASE.md) | Schemas, migrations, services, `liveQuery`, storage caveats |
| Scenarios | [SCENARIOS](docs/SCENARIOS.md) | Axes, presets, generators, personas/policy, time, environment, snapshots |
| Kinds | [KINDS](docs/KINDS.md) | App, deck, page and doc blueprints: the two levels (player JSON, generated prototype), authoring, packages, catalog, limits |
| Decks | [DECKS](docs/DECKS.md) | Slide decks: deck JSON, 21 layouts, steps, presenter, print, style and Deck Studio, lint, sharing, limits |
| Pages | [PAGES](docs/PAGES.md) | Landing pages and documents: hosts, sections, forms and responses, reading layout, print |
| Blocks | [BLOCKS](docs/BLOCKS.md) | Shared content blocks for decks, pages and docs: schemas, limits, lazy families, interactive state, embedded apps |
| Generator | [GENERATOR](docs/GENERATOR.md) | Blueprints → app, deck, page and doc prototypes: format, screens, layouts, generate/regenerate, ownership, migrations, drift |
| Brief to prototype | [BRIEF_TO_PROTOTYPE](docs/BRIEF_TO_PROTOTYPE.md) | Prose brief → offline blueprint → review → generate → validate → export |
| Quick CLI | [QUICK](docs/QUICK.md) | Disposable `protoyard quick` explorations, variants, loopback serving, report and feedback scope |
| Player | [PLAYER](docs/PLAYER.md) | No-install player for app, deck, page and doc blueprints: per-kind entries, hosted `/play/`, share links, storage, worlds, parity, browser limits |
| Themes | [THEMES](docs/THEMES.md) | Style model, palette engine, 64-theme library, Theme Studio, `theme` CLI, brand blocks, measured bundle impact |
| Layouts | [LAYOUTS](docs/LAYOUTS.md) | Shared layout catalog, manifest setup, responsive fallbacks, shell composition, authoring and tests |
| Shells | [SHELLS](docs/SHELLS.md) | Device and host shells, manifest preview fields, `?shell=`, layout inside frames |
| Views | [VIEWS](docs/VIEWS.md) | Choose a rich view, service callbacks, keyboard and phone behavior, scenario fragments, bundle measurements and limits |
| Charts | [CHARTS](docs/CHARTS.md) | Every chart: props, data contracts, accessibility, palette, SVG/Canvas, measured sizes and limits |
| Analytics | [ANALYTICS](docs/ANALYTICS.md) | Analytics engine, generators, views, template and the Pebblestat flagship, with measured numbers and limits |
| SaaS kits | [SAAS_KITS](docs/SAAS_KITS.md) | Simulated auth, OAuth, MFA, onboarding, workspaces, billing, scenario fragments, honest limits |
| AI kits | [AI_KITS](docs/AI_KITS.md) | Simulated assistants, agents and tools, voice, widgets, safe rich answers, honest limits |
| Avatars | [AVATARS](docs/AVATARS.md) | 175 fictional portraits: provenance and MIT license, never real people, seeded assignment, rendering and URL safety, measured sizes, re-import |
| Publishing | [PUBLISHING](docs/PUBLISHING.md) | Build, export, preview, base paths, Cloudflare and other adapters, batch publish, review index, CI templates, the showcase site, sharing as a private Claude artifact (one prototype per artifact) |
| Review comments | [REVIEW_COMMENTS](docs/REVIEW_COMMENTS.md) | Opt-in review comments, adapters (local, http/cloudflare, artifact), who sees what, honest limits |
| Packages | [PACKAGES](docs/PACKAGES.md) | npm package families and exports, release status (not on npm yet), versions, packed output |
| Skill | [SKILL](docs/SKILL.md) | Distributable `protoyard` agent skill: hosts, pinned installation, `setup.sh`, trust and consent, checksums, upgrades |
| Interface | [INTERFACE](docs/INTERFACE.md) | `--version --json` and `doctor --json` machine interface: interface major, capability ids, detection, stability |
| MCP | [MCP](docs/MCP.md) | Local stdio MCP server (`protoyard mcp`): protocol revisions, tools, envelopes, trust boundary |
| DeepWorkPlan | [DWP](docs/DWP.md) | Optional DWP addon loop: exploration gates, evidence, decisions ([addon packet](integrations/deepworkplan/protoyard/SPEC.md)) |
| Specs | [SPECS](docs/SPECS.md) | Per-prototype AGENTS.md + docs/ spec harness, generated regions, rebuild kit |
| Standards | [STANDARDS](docs/STANDARDS.md) | TypeScript, Svelte 5, Biome, domain rules, naming, a11y |
| Testing | [TESTING_GUIDE](docs/TESTING_GUIDE.md) | Full and scoped commands, source→test map, blind spots, posture |
| Commands | [DEVELOPMENT_COMMANDS](docs/DEVELOPMENT_COMMANDS.md) | Every script and CLI command |
| Security | [SECURITY](docs/SECURITY.md) | Threat model, trust boundaries, rules |
| Accessibility | [ACCESSIBILITY](docs/ACCESSIBILITY.md) | WCAG 2.1 A/AA checks: content-kind axe in light and dark, phone and desktop, what is asserted, fixes, honest limits |
| Performance | [PERFORMANCE](docs/PERFORMANCE.md) | Measured index and bundle numbers, budgets |
| Onboarding | [AI_AGENT_ONBOARDING](docs/AI_AGENT_ONBOARDING.md) | First-session checklist |
| Collaboration | [AI_AGENT_COLLAB](docs/AI_AGENT_COLLAB.md) | Path ownership, lockfile, commits in a shared checkout, handoffs |
| Plan log | [IMPLEMENTATION_PLAN](docs/IMPLEMENTATION_PLAN.md) | What is verified vs deferred |
| Kit | [.agents catalog](.agents/docs/skills_agents_catalog.md), [commands](.agents/docs/COMMANDS_REFERENCE.md) | Skills, agents, slash commands |
| Index | [docs/README](docs/README.md) | All docs |

## Repository structure

```text
protoyard/
├── packages/
│   ├── core/              contracts: zod schemas, interfaces, rng, clock, environment, policy     (README)
│   ├── database/          Dexie: per-prototype data + control DBs, world I/O, storage errors       (README)
│   ├── scenarios/         generator SDK, presets, integrity, timeline, series/schedule/event/geo helpers (README)
│   ├── runtime/           createPrototypeRuntime() — composes the engine                          (README)
│   ├── themes/            6 built-ins + 64-theme library (lazy), palette engine, style presets, fonts, no-flash (README)
│   ├── ui/                Svelte 5 components (Bits UI + Tailwind 4 + Lucide), shell frames, LayoutHost + 12 lazy layouts (README)
│   ├── devtools/          in-browser control center (shell and layout pickers, theme browser, Theme Studio) (README)
│   ├── renderer-svelte/   Vite config factory, mountPrototype, ShellHost, bindings, hash router    (README)
│   ├── http/              optional mock HTTP layer (fetch-compatible, no service worker)           (README)
│   ├── offline/           optional service worker for exported prototypes (opt-in)                (README)
│   ├── blueprint/         data-only blueprints: schema, archetypes, app model, screens, aggregates, default scenarios, brief synthesizer, share links, variants, patches, entity services (no Svelte) (README)
│   ├── crud/              blueprint EntityList/Detail/Form + typed lazy screen registry, lazy @protoyard/crud/app shell, dashboard, board, calendar, timeline, map, analytics, settings screens (README)
│   ├── saas/              simulated SaaS engine: auth, OAuth, MFA, inbox, onboarding, workspaces, billing (README)
│   ├── saas-ui/           Svelte SaaS kit screens + saasRoutes/guards (simulation UX)              (README)
│   ├── ai/                simulated AI engine: streaming, agents and tools, voice, safe markdown, chart answers (README)
│   ├── ai-ui/             Svelte assistant workspace, safe rich answers, canvas, widget modes      (README)
│   ├── charts/            chart math: scales, shapes, downsampling, layouts, theme-token palette (no Svelte) (README)
│   ├── charts-ui/         Svelte charts, one lazy subpath per family (cartesian, part-whole, matrix, compact, canvas, geo) (README)
│   ├── analytics/         analytics engine: events, metrics, date ranges, funnels, cohorts, deterministic generators (no Svelte) (README)
│   ├── analytics-ui/      Svelte analytics kit: KPI tiles, date range, filters/segments, drill-down, cohort, funnel, dashboard grid (README)
│   ├── views/             rich view engines: board, calendar, timeline, grid, tree, geo, activity, files, scenario fragments (no Svelte) (README)
│   ├── views-ui/          Svelte rich views, one lazy subpath per view (never in the ui barrel)     (README)
│   ├── review/            review comments engine: anchors, adapter contract, local/http/artifact adapters, server handler (no Svelte) (README)
│   ├── review-ui/         Svelte review UI: comment mode and pins, threads, panel, toolbar, lazy mount (README)
│   ├── avatars/           175 fictional portraits (WebP 64/128 px) + verified manifest, data only   (README)
│   ├── blocks/            content block engine: schemas, limits, untrusted-input guard, closed formula AST, text helpers (no Svelte) (README)
│   ├── blocks-ui/         Svelte block renderers, one lazy subpath per family (text, media, data, structure, code, diagram, interactive, map, embed) (README)
│   ├── decks/             slide deck engine: schema, 21-layout catalog, navigation, steps, style, quality checks (no Svelte) (README)
│   ├── decks-ui/          Svelte DeckApp, presenter, overview, print and Deck Studio, each on its own lazy chunk (README)
│   ├── pages/             page and doc engine: schemas, limits, TOC helpers, form-response services (no Svelte) (README)
│   ├── pages-ui/          Svelte PageApp and DocApp hosts, forms and responses UI, print CSS (README)
│   ├── flows/             workflow engine: serializable flows, triggers, steps, data-only conditions, simulated runs (no Svelte) (README)
│   ├── flows-ui/          Svelte workflow editor and simulated run panels (README)
│   ├── gamification/      points ledger, levels, badges, missions and streaks (no Svelte) (README)
│   ├── gamification-ui/   Svelte level, points and streak chips, badges and mission panels (README)
│   ├── player/            prebuilt static player for app, deck, page and doc blueprints, per-kind entries, no build or install (level 1) (README)
│   ├── templates/         @protoyard/templates: packs templates/* for npm; listTemplates()/templateDir()  (README)
│   ├── protoyard/         unscoped `protoyard` npm package: bin that runs @protoyard/cli in-process, same version (README)
│   ├── create-protoyard/  `npm create protoyard` scaffolder for a consumer workspace (not on npm yet)   (README)
│   └── cli/               `protoyard` CLI: new/generate/quick/blueprint/dev/validate/build/export/publish/artifact/comments/spec/ci/mcp… (README)
├── apps/gallery/          Astro static gallery + /marketplace/ (reads the registry only)           (README)
├── templates/<name>/      admin-console, agent-console, ai-assistant, analytics, b2b-saas, blank,
│                          booking-calendar, chat, chat-widget, clinic, course-lms, crud-app,
│                          dashboard, deck, design-kit, desktop-app, doc, docs-wiki, ecommerce, fintech-dashboard,
│                          iot-monitoring, logistics-map, marketplace, mobile-app, onboarding,
│                          page, plugin-panel, project-management, social-feed, task-manager, team-chat
├── prototypes/<slug>/     ai-chat-demo, atlas-workspace-demo, cadence-studio-demo*, create-anything-deck*, crm-demo,
│                          harbor-dispatch-demo*, helpdesk-demo*, keel-projects-demo,
│                          lattice-saas-demo, mobile-banking-demo, nova-assistant-demo,
│                          pebblestat-analytics-demo, pulse-revenue-demo*, relay-chat-demo,
│                          support-widget-demo, ui-kit, …yours   (* generated from a blueprint)
├── blueprints/            40 app blueprints + deck, page and doc examples (decks/, pages/, docs/) for the player and `protoyard generate` (README)
├── integrations/deepworkplan/protoyard/  DWP addon packet: addon.json, SPEC.md, SKILL.md, UPSTREAM.md, templates/
├── skills/protoyard/      the distributable agent skill: SKILL.md router, sub-skills, setup.sh   (docs/SKILL.md)
├── tests/                 support/ (runtime + generator harness), e2e/ (Playwright + axe), setup/
├── scripts/               bench-index.ts, bench-cold-start.ts, bench-charts.ts, bench-grid.ts, bench-idea.ts,
│                          bench-player.ts, bench-integrations.ts, bench-blocks.ts, bench-brief-kinds.ts,
│                          visual-sweep.ts (+ lib/), sweep-deck.ts, blocks-reference.ts, generate-thumbnails.ts,
│                          import-avatars.ts, {build,check,verify,version}-packages.ts, skill and integration checks,
│                          check-public-hygiene.sh, check-public-docs.ts, changelog-section.sh
├── docs/                  the guides above
├── .agents/               skills, agents, commands (.claude and .cursor symlink here)
├── .review/extension.md   repo rules for the AI Diff Reviewer local review
├── .dwp/                  Deep Work Plans (git-ignored, except config.json)
└── tmp/                   scratch space (git-ignored)
```

## Quick Commands

| Task | Full | Scoped |
| --- | --- | --- |
| Install | `pnpm install` | — |
| Gallery (dev) | `pnpm dev` (`pnpm dev:create` enables the marketplace create flow) | — |
| Run one prototype | — | `pnpm protoyard dev <slug>` |
| Lint + format | `pnpm lint` | `npx biome check <path>` |
| Type check | `pnpm typecheck` | `pnpm --filter <package> typecheck` |
| Unit + integration | `pnpm test` | `pnpm vitest run <path>` · `pnpm vitest run -t "<name>"` |
| E2E | `pnpm test:e2e` (`pnpm test:e2e:install` once) | `PROTOYARD_E2E_PROTOTYPES=<slug> pnpm test:e2e` |
| Turn a brief into a blueprint | — | `echo "<brief>" \| pnpm protoyard blueprint new <file> --from-brief - [--generate <slug>] [--dry-run]` |
| Generate from a blueprint | — | `pnpm protoyard blueprint validate <file>` · `pnpm protoyard generate <slug> --blueprint <file> [--dry-run]` (app, deck, page or doc) |
| Make a slide deck | — | `pnpm protoyard quick "<topic>" --kind deck` · `pnpm protoyard generate my-deck --blueprint blueprints/decks/protoyard-create-anything.json` |
| Find or apply a theme | — | `pnpm protoyard theme list --search <query>` · `pnpm protoyard theme use <slug> <theme-id> --dry-run` |
| Quick exploration (no build) | — | `pnpm protoyard quick "<brief>" [--variants <1-8>]` · `pnpm protoyard quick serve <slug> --open` |
| Validate a prototype | — | `pnpm protoyard validate <slug> --build` |
| Visual QA sweep | `pnpm visual:sweep` | `pnpm visual:sweep --only <slug> [--themes all]` |
| Spec drift check | `pnpm protoyard spec --all --check` | `pnpm protoyard spec <slug> --check` |
| Bundle budgets | `pnpm protoyard budget --all` | `pnpm protoyard budget <slug>` |
| Affected prototypes | — | `pnpm protoyard affected --since HEAD~1 --format csv` |
| Build / export | `pnpm protoyard build --all` | `pnpm protoyard build <slug>` · `pnpm protoyard export <slug>` |
| Preview a build | — | `pnpm protoyard preview <slug>` |
| Publish (needs authorization) | — | `pnpm protoyard publish <slug> --provider cloudflare --dry-run` |
| Share as a Claude artifact (needs authorization) | — | `pnpm protoyard export <slug> --target artifact --dry-run` · `/share-artifact <slug>` |
| Pull review comments | — | `pnpm protoyard comments pull <slug> --file <json> --format md` |
| Build the player | — | `pnpm --filter @protoyard/player build` |
| npm packages | `pnpm build:packages && pnpm check:packages --require-all` · `pnpm verify:packages` | `pnpm check:packages --filter <name>` |
| Skill and integrations | `pnpm check:skill` · `pnpm check:integrations` | — |
| Version a release | — | `pnpm changeset` · `pnpm version-packages [--check]` |
| Everything before a PR | `pnpm check` | — |

Scoped patterns are verified (selection counts in
[TESTING_GUIDE](docs/TESTING_GUIDE.md)). Every CLI command takes `--json`.
Nothing requires Docker or CI-only tooling.

## Mandatory rules

1. **English only** in code, comments, UI copy, docs and commits.
2. **Conventional Commits**: `type(scope): summary`. Scopes: `core`,
   `database`, `scenarios`, `runtime`, `themes`, `ui`, `devtools`, `renderer`,
   `cli`, `gallery`, `http`, `offline`, `blueprint`, `crud`, `saas`,
   `saas-ui`, `ai`, `ai-ui`, `charts`, `charts-ui`, `analytics`,
   `analytics-ui`, `views`, `views-ui`, `review`, `review-ui`, `avatars`,
   `templates`, `player`, `blocks`, `blocks-ui`, `decks`, `decks-ui`, `pages`,
   `pages-ui`, `flows`, `flows-ui`, `gamification`, `gamification-ui`,
   `<prototype-slug>`,
   `docs`, `ci`, `deps`, `dwp`, `e2e`, `scripts`. Integration merges use
   `merge(<branch or task>): …`. **Stage exact paths**, never `git add -A`.
3. **Validation follows the touched surface.** Pick gates from the
   source→test map in [TESTING_GUIDE](docs/TESTING_GUIDE.md). Core or root
   config changes run the full `pnpm check`. When unsure, run the full suite.
   A behavior change ships with a test.
4. **Prototype isolation.** Touch only the prototype or package the task names.
   Never edit another prototype's folder unless asked. Build variants as new
   slugs (`pnpm protoyard new`).
5. **Real behavior.** No dead buttons, fake success or placeholder screens.
   Mutations go **UI → service → `session.assert` → zod → `environment.run`
   → `db.transaction`**. Components never write tables directly. Every async
   action shows pending feedback: wire it to a `@protoyard/ui` `Button` whose
   `onclick` returns the promise (`onclick={() => runService(…)}`, or pass
   `loading`), never `() => void work()`. The renderer's global bar already
   covers runtime operations (`environment.run`, scenario loads, persona
   switches).
6. **Determinism.** Generators and timelines use only `ctx.rng`, `ctx.faker`,
   `ctx.ids` and `ctx.time`, never `Math.random()` or `Date.now()`. Timeline
   events depend only on the day and stable ids. Bump `generatorVersion` when
   output can change.
7. **Data.** Fictional data only (`.example` / `example.com`). Never real
   PII, secrets or tokens. Money is integer cents. Snapshots are untrusted
   input; never `{@html}`, `eval` or `new Function` on data.
8. **TypeScript and Svelte.** Strict and **erasable** TypeScript (no
   parameter properties or enums). Relative imports keep `.ts`. Svelte 5 runes
   only. `liveQuery(querier, { initial, deps })` with every reactive input in
   `deps`.
9. **Shared files have one owner:** `package.json`, `pnpm-lock.yaml`,
   `pnpm-workspace.yaml`, `biome.json`, `tsconfig.base.json`,
   `vitest.config.ts`. Ask before changing them, and only the owner runs
   `pnpm install` ([AI_AGENT_COLLAB](docs/AI_AGENT_COLLAB.md)).
10. **Honesty.** Docs describe what works today. Never invent deploy URLs,
    benchmarks or check results. Simulated roles, sign-in, SSO and MFA are
    never described as security.
11. **Scratch work** goes in `tmp/`. Plan artifacts go in
    `.dwp/plans/<plan>/analysis_results/`, never the repository root.
12. **Progress reporting** (when a reporting tool is available) is
    best-effort and never blocks work.

## Working principles

Work with autonomy, ownership and sound judgment. Pursue correctness,
clarity, simplicity and verified completion.

- **Own the outcome.** Carry authorized work through investigation,
  execution and validation until the outcome is complete or a concrete
  blocker stops progress.
- **Be resourceful before asking.** Read the code, docs, tests and prior
  decisions ([DECISIONS](docs/DECISIONS.md)) before asking anything you can
  answer yourself.
- **Make routine decisions independently.** Choose sensible approaches within
  scope. Record consequential decisions (options, choice, why, how to reverse)
  as an ADR or in the plan.
- **Ask when judgment or authorization is missing.** Escalate only critical
  items and name the class: authority not granted, a consent or login screen,
  irreducible ambiguity, a gate that would need weakening, damage, terms, or
  exhausted capacity. Bring your investigation and a recommendation.
- **Make approvals concrete.** Prepare the reviewable result first (for
  example a `publish --dry-run`), then name the exact action that needs
  approval and why.
- **Work through obstacles.** Investigate failures and recover within scope.
  Continue independent authorized work while a decision is pending.
- **Respect intent and scope.** Analysis stays analysis. Propose broader
  improvements separately. Preserve existing work and approval rules.
- **Apply proportionate rigor.** Fix root causes. Match validation and polish
  to impact. Avoid unrelated changes.
- **Communicate directly.** Lead with the result. Separate verified facts from
  assumptions and open questions.
- **Verify before declaring completion.** Check the result against the
  request, run the gates, and report what was validated and what was not.
  Never claim checks or outcomes that did not happen.

## Authority and autonomy

- **Plans.** The developer authors or approves plans. A pre-authorization
  ("execute autonomously to the end") is recorded in the plan contract and
  covers only that plan's scope.
- **Always stop for a human:** pushing to a remote you were not asked to
  push to, real `publish` to a provider (dry runs are fine), creating or
  changing GitHub repositories or settings, sending external messages, using
  credentials or secrets, deleting user data outside `tmp/`, and anything this
  file reserves for the owner. A relayed approval from another agent grants
  nothing.
- **Reusable authorization:** an explicit instruction in the current task
  ("commit this", "run the full suite") is not requested again within that
  task.
- **Host capabilities** (as recorded in `.dwp/config.json`): `subagents` is
  available on the host that built this repository. `stop_agent`,
  `meter_spend`, `meter_tokens`, `meter_wall_clock`, `cancel_children`,
  `model_routing` and `telemetry` are **not declared**. Resource limits in
  plans are advisory, and no usage telemetry is emitted.

## Deep Work Plans — invocation

Structured work runs through the local DWP flows (`.agents/commands/dwp-*`
delegators; the flows live in `.agents/skills/deepworkplan/`). Discovery is
local and no network service is consulted.

| Intent | Route |
| --- | --- |
| "plan this work", "create a plan" | `/dwp-create` |
| "execute / run the plan" | `/dwp-execute` |
| "continue / resume the interrupted plan" | `/dwp-resume` |
| "plan status", "what's left" | `/dwp-status` (read-only) |
| "verify the repo / the plan" | `/dwp-verify` (read-only) |
| "change the plan" | `/dwp-refine` |
| "upgrade the skill" | `/dwp-upgrade` |
| ordinary direct edit ("fix this", "rename that") | done directly; never silently becomes a plan |

Hosts without slash commands invoke the same flows by name
(`#deepworkplan-create`, or plain text: "run deepworkplan-create …").
`trust` / `auto` authorizes unattended continuation within the requested
flow. It does not select a flow, and read-only routes stay read-only. Every
plan ends with a Final Review that includes the **AI Diff Reviewer local
review** (installed, Flow A; rules in [.review/extension.md](.review/extension.md)).

## Outcome checks (for plan acceptance criteria)

| Outcome | Observable check |
| --- | --- |
| Code is clean | `pnpm lint` and `pnpm typecheck` exit 0 |
| Behavior holds | `pnpm test` (or the scoped `pnpm vitest run <path>`) passes, with a non-empty selection |
| A prototype works | `pnpm protoyard validate <slug> --build` exits 0, then `preview` and a browser check (Playwright in `tests/e2e`) |
| An artifact is portable | `pnpm protoyard export <slug>` prints the ZIP path, size and sha256, and the isolation check passes |
| Docs are honest | Every command in docs runs and every relative link resolves |

Not covered automatically: visual design quality, screen-reader experience
beyond automated a11y checks, and real provider deployments (manual, with the
owner's credentials).

## Adding a prototype (the short version)

```bash
pnpm protoyard new my-idea --template dashboard   # any templates/<name>; or --from <template|prototype> to remix
pnpm protoyard generate my-idea --blueprint path/to/blueprint.json   # from a data-only blueprint (docs/GENERATOR.md)
echo "<brief>" | pnpm protoyard blueprint new tmp/my-idea.blueprint.json --from-brief - --generate my-idea   # from prose (docs/BRIEF_TO_PROTOTYPE.md)
pnpm protoyard dev my-idea
# edit src/database/schema.ts → src/domain/{policy,services}.ts → src/scenarios/* → screens
pnpm protoyard spec my-idea --write               # refresh AGENTS.md + docs/ generated regions
pnpm vitest run prototypes/my-idea && pnpm protoyard validate my-idea --build
pnpm protoyard export my-idea
```

A generated prototype (start from `blueprints/*.json`, listed by
`pnpm protoyard list --kind blueprint`) changes through its data: edit `prototypes/<slug>/blueprint.json`
and re-run `generate <slug> --blueprint prototypes/<slug>/blueprint.json`, then
`validate`. Never edit `src/generated/**` by hand.

Beyond CRUD, pick from the kits before writing screens by hand:
[VIEWS](docs/VIEWS.md), [CHARTS](docs/CHARTS.md),
[ANALYTICS](docs/ANALYTICS.md) and [LAYOUTS](docs/LAYOUTS.md).

The full loop and copy-paste prompts are in [AGENT_GUIDE](docs/AGENT_GUIDE.md).
