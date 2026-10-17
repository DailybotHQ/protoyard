# Product Spec — Protoyard

> **Build prototypes that feel real.** Real behavior. Fake infrastructure.

## The problem

Prototypes are usually one of two things:

- **Pictures that pretend.** Design-tool mockups and clickable images. The
  buttons go nowhere, nothing is saved, and every "what if" needs another frame.
- **Real apps built too early.** A backend, a database, authentication and a
  deployment pipeline, just to find out whether an idea works.

Neither lets a team ask the questions that matter: *what does this look like
for a brand-new user? For an admin six months in? With a thousand records?
When the network drops? When the trial expires?*

AI coding agents make the problem sharper. They can now build a convincing
interface in minutes, but they need somewhere to put it: a place with a real
data layer, realistic data, users and permissions, and a way to publish the
result, without first building infrastructure.

## What Protoyard is

Protoyard is an open-source workspace for building **interactive prototypes
that behave like real products**. Everything runs in the browser, so no backend
is needed.

One repository holds as many independent prototypes as you like. Each is a
small web app with:

- **A real database in the browser.** Create, edit, delete, search and filter.
  Changes survive a page reload.
- **Scenarios.** Load "brand-new signup", "six months in" or "year-one power
  user", and the app shows a coherent, reproducible world for that moment.
- **Personas and permissions.** Switch between owner, admin, member and viewer
  without losing data. Forbidden actions are actually blocked.
- **Simulated time and conditions.** Preview the app next month, go offline,
  add latency or make requests fail, and see how the product copes.
- **Themes.** Light, dark or system mode and several color presets, each
  prototype styled separately.
- **Snapshots.** Save the exact state after your edits, restore it later, or
  export it to a file and share it.
- **One-command publishing.** Build a single prototype into a static site or a
  ZIP. It runs on any static host with no Protoyard installed, or it can be
  published to Cloudflare Pages.

## Who it is for

| Who | What they get |
| --- | --- |
| **Product managers and designers** | Stakeholder demos that hold up when people click around, and every user state on demand. |
| **Developers** | A fast place to test UX ideas with real data flows before committing to an architecture. |
| **AI coding agents** | A documented, predictable workspace (`AGENTS.md`, a CLI with `--json`, shared components) where "make me a prototype of X" ends in something that works. |
| **Educators and teams** | Many experiments side by side, each isolated and easy to share. |

## How it is used

1. Clone the repository, run `pnpm install`, then `pnpm dev`. A gallery opens.
2. Ask a coding agent, or run `pnpm protoyard new my-idea --template dashboard`.
3. Build the product's screens and data model on the shared runtime.
4. Explore it in the browser with the floating DevTools panel: scenarios,
   personas, time, environment, theme and snapshots.
5. Run `pnpm protoyard export my-idea` to get a portable static site, or
   `pnpm protoyard publish my-idea --provider cloudflare` to host it.

## Key capabilities (what "done" means)

- Hundreds or thousands of prototypes in one workspace. The gallery reads a
  small metadata index, so it stays fast and never compiles every app.
- Each prototype is independent: its own code, data model, scenarios,
  personas, theme and database namespace. Changing one never touches another.
- Primary controls do something real. CRUD persists, permissions are enforced
  in services as well as in the UI, and empty, loading and error states exist.
- Scenarios are deterministic: the same seed, reference time and generator
  version rebuild the same world.
- Loading a scenario, overriding state and taking a snapshot are three
  different operations, and the product never mixes them up.
- Standalone builds need no server, no credentials and no network.

## Success criteria

- A newcomer can clone the repository, open a demo, change data, reload, switch
  persona, load a scenario, restore a snapshot and export a static build in
  minutes, without reading the source.
- A coding agent can follow `AGENTS.md` to go from `new` → implement →
  `validate` → `build` → `export` in a domain unrelated to the demos, without
  copying demo code.
- Demos in very different domains (CRM, mobile banking, AI team chat) run on
  the same engine with no domain assumptions in the platform.
- The 1,000-manifest index benchmark is measured and documented, not claimed.

## Non-goals

- **Not a backend or a SaaS platform.** There is no server, no cloud sync and
  no shared multi-user editing.
- **Not real security.** Personas and roles simulate user experience. Data in
  the browser can be read and changed by anyone using that browser.
- **Not a native app runtime.** Mobile prototypes run in the mobile browser,
  with touch-friendly layouts.
- **Not a design tool or a universal schema designer.** Prototypes are code,
  written by people or agents.
- **Not a payments, banking or authentication product.** Demo data is fictional,
  and nothing connects to real financial systems.

## Honest boundaries

- Data is stored per browser and per origin. It does not sync between devices,
  and the browser may clear it, so export snapshots of anything worth keeping.
- Separate database names on one origin are logical namespaces, not a security
  boundary. Untrusted prototypes need separate origins.
- Running a prototype someone else wrote executes their code, the same as
  running any web app.

## Positioning

Protoyard is general-purpose open source (MIT) from Dailybot, Inc. It requires
no proprietary service and contains no Dailybot-specific concepts. The demos
use fictional companies, people, banks and data throughout.
