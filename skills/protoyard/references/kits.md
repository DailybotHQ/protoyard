# Protoyard kit catalog

What each reusable kit is for, where it is imported from, and where its full
documentation lives. Guides are listed as repository paths: inside a Protoyard
checkout open them locally (`docs/VIEWS.md`); otherwise read them in the
[Protoyard repository](https://github.com/DailybotHQ/protoyard/tree/main/docs)
or at <https://protoyard.app/docs/>. Package READMEs hold the full API
references. This catalog is a map, not an API reference: verify names against
the installed packages before using them.

## Choose by need

| Need | Kit | Guide |
| --- | --- | --- |
| Page structure: sidebar, rail, top navigation, dual sidebar, master–detail, dashboard grid, docs, marketing, mobile tabs or drawer, wizard, auth split | Layouts (`@protoyard/ui` `LayoutHost`, catalog in `@protoyard/core`) | `docs/LAYOUTS.md` |
| Show the app as a phone, tablet, desktop window, browser tab, chat widget on a host site, extension popup or plugin panel | Shells (renderer-drawn frames) | `docs/SHELLS.md` |
| Move work across columns | `BoardView` from `@protoyard/views-ui/board` | `docs/VIEWS.md` |
| Bookings or events on a calendar, with recurrence | `CalendarView` from `@protoyard/views-ui/calendar` | `docs/VIEWS.md` |
| Plan durations and dependencies (Gantt-style) | `TimelineView` from `@protoyard/views-ui/timeline` | `docs/VIEWS.md` |
| Large editable tables with filters and saved views | `DataGrid`, `FilterBuilder`, `SavedViews` from `@protoyard/views-ui/grid` | `docs/VIEWS.md` |
| Hierarchies and outlines | `TreeView`, `OutlineEditor` from `@protoyard/views-ui/tree` | `docs/VIEWS.md` |
| Locations, routes and geofences in a fictional offline city | `SimulatedMap` from `@protoyard/views-ui/map` | `docs/VIEWS.md` |
| Markdown writing, comments, activity, notifications, files, settings, empty/error/offline states, a command palette | `@protoyard/views-ui/{editor,activity,notifications,files,settings,states,commands}` | `docs/VIEWS.md` |
| A whole blueprint-described app with its screen kinds | `BlueprintApp` from `@protoyard/crud/app` | `docs/VIEWS.md`, `docs/GENERATOR.md` |
| Line, area, bar, combo, scatter; pie, donut, funnel, sankey, treemap; heatmaps and histograms; sparklines and gauges; large-data canvas marks; tile maps | `@protoyard/charts-ui/{cartesian,part-whole,matrix,compact,canvas,geo}` | `docs/CHARTS.md` |
| KPI tiles, date ranges and comparison, filters and segments, dashboard grid, drill-down, funnels, cohorts | `@protoyard/analytics` (engine and generators) and `@protoyard/analytics-ui/{date-range,filters,grid,drill,funnel,cohort}` | `docs/ANALYTICS.md` |
| Sign-in, OAuth and MFA screens, onboarding, workspaces and invitations, inbox, billing | `@protoyard/saas` (engine) and `@protoyard/saas-ui` (lazy screens, `saasRoutes`, guards) | `docs/SAAS_KITS.md` |
| An assistant workspace, agents and tools, streaming answers, voice, an embeddable chat widget | `@protoyard/ai` (engine) and `@protoyard/ai-ui`, `@protoyard/ai-ui/voice`, `@protoyard/ai-ui/widget` | `docs/AI_KITS.md` |
| Faces for seeded people | `@protoyard/avatars`, shown through the `@protoyard/ui` `Avatar` | `docs/AVATARS.md` |
| Buttons, forms, tables, dialogs, toasts, badges, cards, stat cards | `@protoyard/ui` | `packages/ui/README.md` |
| Colors, fonts, density and a brand theme | `@protoyard/themes` (64-theme library, Theme Studio, `protoyard theme`) | `docs/THEMES.md` |

## Families

### Layouts and shells

A layout is the page structure around routed screens; a shell is the simulated
device or host frame around the whole app, and the two compose. Layouts render
navigation from data and fall back to a narrower layout when the available
width is too small. Shells simulate a device; they do not emulate one (the user
agent, touch and pixel density stay the real browser's). Select a layout with
`preview.layout` in `protoyard.json`, a blueprint `layout`, DevTools or
`?layout=`; select a shell with the manifest preview fields or `?shell=`.
Guides: `docs/LAYOUTS.md`, `docs/SHELLS.md`.

### Views

Framework-free engines in `@protoyard/views/<subpath>` and Svelte components in
`@protoyard/views-ui/<subpath>`, one entry per view. Neither package is
re-exported by `@protoyard/ui`. Import each view from a lazy route. Services
stay in the prototype: views call back with validated intents (a move, a
reschedule, an edit). Guide: `docs/VIEWS.md`.

### Charts

Protoyard's own chart kit, with no third-party chart library: math in
`@protoyard/charts` and Svelte components in `@protoyard/charts-ui`, one lazy
subpath per family. Every chart has a title, a spoken summary, keyboard
traversal, a tooltip, a real table view, loading, empty and error states, and
theme colors. Canvas rendering is its own lazy chunk. Guide: `docs/CHARTS.md`.

### Analytics

The engine (`@protoyard/analytics`), deterministic generators
(`@protoyard/analytics/generators`) and views (`@protoyard/analytics-ui`) for
product-analytics and dashboard apps on simulated events. Start from the
`analytics` template, or the `dashboard` template for a simpler overview; in
this repository the `add-dashboard` agent skill wires a dashboard into an
existing prototype. Guide: `docs/ANALYTICS.md`.

### SaaS

Simulated accounts, sign-in, OAuth, MFA, onboarding, workspaces, invitations,
an inbox and billing: `@protoyard/saas` holds schemas, services and scenario
fragments; `@protoyard/saas-ui` holds lazy screens and route guards. Templates:
`b2b-saas`, `onboarding`. Nothing here is security or a real provider.
Guide: `docs/SAAS_KITS.md`.

### AI

A deterministic simulation of assistants, agents and tools, team chat and
voice: `@protoyard/ai` (engine, safe Markdown, chart answers) and
`@protoyard/ai-ui` (assistant workspace, with `voice` and `widget` subpaths).
Answers are scripted or simulated in the browser, never a real model.
Templates: `ai-assistant`, `agent-console`, `chat`, `team-chat`, `chat-widget`.
Guide: `docs/AI_KITS.md` (read its "Honest boundaries" section first).

### Avatars

175 portraits of fictional people, assigned deterministically to seeded people
and rendered through `Avatar` with initials as the fallback. Use them only as
placeholder people. Guide: `docs/AVATARS.md`.

## Blueprint archetypes

A blueprint `archetype` block can select the `assistant`, `team-chat`,
`saas-onboarding` or `analytics` experience. It is validated data: entity
slots, a screen route, scenario defaults and the public entry points of the
matching kits. It never executes imports by itself. See the archetype contract
in `packages/blueprint/README.md` and the kit guides above for what each
experience renders today.
