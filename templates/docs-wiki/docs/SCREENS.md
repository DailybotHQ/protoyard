# Docs Wiki: screens

## Routes

<!-- protoyard:generated:routes -->
| Route | Screen | Capability | Description |
| --- | --- | --- | --- |
| `#/` | Home | — | Every space, recently updated pages and a search box. |
| `#/search` | Search | — | Full-text search over titles and bodies, with highlighted matches (?q=). |
| `#/spaces/:id` | Space | — | A space's page tree (drag to move) and its recent changes. |
| `#/pages/:id` | Page | — | A page rendered through the safe Markdown preview, with its breadcrumb and subpages. |
| `#/pages/:id/edit` | Edit page | — | The Markdown editor with a live safe preview; saving adds a version. |
| `#/pages/:id/history` | Page history | — | Every version of a page: preview, changed lines, and restore. |
<!-- /protoyard:generated:routes -->

## Screens

<!-- protoyard:generated:screens -->
| Screen | Route | Description |
| --- | --- | --- |
| Home | `#/` | Every space, recently updated pages and a search box. |
| Search | `#/search` | Full-text search over titles and bodies, with highlighted matches (?q=). |
| Space | `#/spaces/:id` | A space's page tree (drag to move) and its recent changes. |
| Page | `#/pages/:id` | A page rendered through the safe Markdown preview, with its breadcrumb and subpages. |
| Edit page | `#/pages/:id/edit` | The Markdown editor with a live safe preview; saving adds a version. |
| Page history | `#/pages/:id/history` | Every version of a page: preview, changed lines, and restore. |
<!-- /protoyard:generated:screens -->

- **Home** (`Home.svelte`): a search box, space cards with page counts,
  and the eight most recently updated pages. **New space** for owners.
  Loading: skeleton cards. Empty: "No spaces yet".
- **Search** (`Search.svelte`): the query and a space filter from the URL;
  up to 50 results with highlighted titles and snippets. Empty query: a
  hint. No match: an empty state.
- **Space** (`SpaceHome.svelte`): the space's page tree (views-ui `TreeView`:
  arrows, typeahead, Enter opens, drag or "Move to…" for editors), a search
  box and recent changes. **New page** for editors. Not found: an empty state.
- **Page** (`PageView.svelte`): breadcrumb, title, "Version N · edited by …",
  the body through the safe preview, subpages, and the tree with the current
  page selected. **Edit**, **New subpage** and **Delete** (leaf pages only,
  confirmed) for editors; **History** for everyone. Not found: an empty state.
- **Edit page** (`PageEdit.svelte`, its own chunk): title and the views-ui
  `MarkdownEditor` in split mode (toolbar, shortcuts, live safe preview).
  **Save** is disabled until something changes; a conflict shows as an
  alert above the editor and keeps the typed text. Denied: "Read-only".
- **Page history** (`PageHistory.svelte`): versions newest first with author,
  time, note and +/− changed lines; the picked version renders through the
  safe preview, with **Restore version N** for editors.

Mutations show pending feedback on their Button, and service errors that are
not field errors toast through `runService`.

## Shell

A responsive web app (`preview.viewport: desktop`). From `lg` the page tree
sits in a left column; below it, the page comes first and the tree follows.
The sidebar becomes a drawer below `lg`. The page scrolls as a document.
