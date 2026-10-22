# Flows

- Load the default scenario (presenter / audience / viewer personas).
- Read the document body from `blueprint.json` (headings, charts, tables, lists).
- Scroll the continuous flow; use “On this page” TOC anchors for deep links.
- Optional: submit the reader feedback form → `formResponses` through kind
  form services (`form:submit` → zod → `environment.run` → `db.transaction`).
- Print via `@protoyard/pages-ui` print CSS (continuous flow, not slide-per-page).
