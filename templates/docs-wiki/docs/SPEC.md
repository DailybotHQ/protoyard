# Docs Wiki: spec

## Problem

Teams keep their knowledge in a wiki: nested pages, written in Markdown,
changed by many people over time. This template simulates one, so a team can
try tree navigation, editing with a preview, version history and search
before building anything.

## Users

- Editors (`editor`) write and reorganize pages.
- The owner (`owner`) also creates spaces.
- Readers (`viewer`) browse, search and read the history.

## Capabilities

- [Create spaces](FLOWS.md#create-a-space) and [pages](FLOWS.md#create-a-page) in a nested tree.
- [Edit pages in Markdown](FLOWS.md#edit-and-save) with a live preview that never runs embedded HTML.
- Keep every save as a version and [restore any of them](FLOWS.md#restore-a-version).
- [Reorganize the tree](FLOWS.md#move-a-page) by drag or keyboard.
- [Delete leaf pages](FLOWS.md#delete-a-page).
- [Search all pages](FLOWS.md#search) with highlighted matches.

## Non-goals

- No real-time co-editing, comments, mentions, attachments or page templates.
- No visual (side-by-side) diff; history shows changed-line counts and the full version.
- No page permissions per space or page; no publishing outside the app.
- No server search index: search runs in the browser over every page.

## Scenarios

<!-- protoyard:generated:scenarios -->
| Scenario | Name | Group | Density | Seed | Generator knobs | Description |
| --- | --- | --- | --- | --- | --- | --- |
| `active` | Team wiki | Data | normal | 4242 | `{"series":{"historyDays":90,"seasonality":"weekly"},"wiki":{"extraPages":0,"seed":true}}` | Three spaces with about 45 nested pages, months of version history, and a page of hostile Markdown the preview shows as text. |
| `empty` | Brand-new wiki | Lifecycle | empty | 101 | `{"wiki":{"seed":false}}` | No spaces or pages yet, seen by the owner: every empty state and the first space. |
| `large` | Large wiki | Data | normal | 4242 | `{"series":{"historyDays":90,"seasonality":"weekly"},"wiki":{"extraPages":1450,"seed":true}}` | About 1,500 pages (meeting notes and runbooks added to the team wiki): search and the tree at scale. |
| `viewer` | Read-only reader | Data | normal | 4242 | `{"series":{"historyDays":90,"seasonality":"weekly"},"wiki":{"extraPages":0,"seed":true}}` | The team wiki seen by a viewer: read, search and browse history, but no edits. |
<!-- /protoyard:generated:scenarios -->

## Honest boundaries

- **Data** lives in the visitor's own browser (IndexedDB); spaces and pages
  are generated, fictional content. Nothing is sent anywhere.
- **Personas, not sign-in.** Switching persona in DevTools changes the role;
  roles are a UX simulation, not security.
- **Network and time** are simulated: latency, offline and failures come from
  the environment overrides; "now" is the simulated clock.
- **Rendering is real**: page bodies go through the same safe Markdown parser
  any real build would need, and hostile content stays inert text.

## Rebuild as a real app

- **Schema** → server tables for spaces, pages and versions (or a document
  store), with the same version invariant enforced by the database.
- **Services** → endpoints with the same transactions and the `baseVersion`
  conflict check (or real-time co-editing with CRDTs).
- **Policy and personas** → authentication and per-space permissions.
- **Search** → a server full-text index (Postgres FTS, Meilisearch,
  OpenSearch) instead of an in-memory scan.
- **Markdown** → keep a parser that builds an AST and renders elements; never
  inject HTML.
- **Environment failures** → retries and offline drafts that never lose text.
- **Scenarios** → seed data for demos and tests only.
- **Screens** → the same flows; add comments and attachments if needed.

## Manifest facts

<!-- protoyard:generated:manifest -->
| Field | Value |
| --- | --- |
| id | `template.docs-wiki` |
| slug | `docs-wiki` |
| name | Docs Wiki |
| version | 0.1.0 |
| platform | responsive |
| category | starter |
| default scenario | `active` |
| default theme | `productivity-minimal` |
| storage namespace | `template-docs-wiki` |
| schema version | 1 |
| generator version | 1 |
| timeline | no |
| themes | built-in presets only |
<!-- /protoyard:generated:manifest -->
