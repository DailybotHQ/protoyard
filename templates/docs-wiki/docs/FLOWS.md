# Docs Wiki: flows

Each flow ends in the service layer: UI → service → `session.assert` → zod →
`environment.run` → `db.transaction`. Every mutation in
`src/domain/services.ts` should appear in at least one flow.

## Create a space

1. Home → **New space** (owner), name, key and description.
2. Service: `services.spaces.create(input)`.
3. Capability: `spaces:manage`.
4. Writes: `spaces`, plus an "Overview" page in `pages` and its version 1 in `versions`.
5. Failure states: key taken or malformed (inline), permission denied, simulated offline (nothing written).

## Create a page

1. A space → **New page**, or a page → **New subpage**; type a title. The editor opens.
2. Service: `services.pages.create({ spaceId, parentId, title, body })`.
3. Capability: `pages:edit`.
4. Writes: `pages` (last rank among its siblings, version 1), `versions` (`Created`).
5. Failure states: empty title, a parent in another space (inline), permission denied, simulated offline.

## Edit and save

1. A page → **Edit**: title plus the Markdown editor with a live safe preview → **Save**.
2. Service: `services.pages.save(id, { title, body, baseVersion })`.
3. Capability: `pages:edit`.
4. Writes: `pages` (`version + 1`, `updatedBy`, `updatedAt`) and `versions` (`Edited`) in one transaction. An unchanged save writes nothing.
5. Failure states: someone saved a newer version (inline; the typed text stays in the editor), empty title, too long, permission denied, simulated offline (neither page nor version written).

## Restore a version

1. A page → **History** → pick a version → **Restore version N**.
2. Service: `services.pages.restore(id, version)`.
3. Capability: `pages:edit`.
4. Writes: `pages` (the old title and body as `version + 1`) and `versions` (`Restored vN`).
5. Failure states: already the current version (inline), permission denied, simulated offline.

## Move a page

1. Any page tree → drag a page, or open its "Move to…" menu.
2. Service: `services.pages.move(id, { parentId, rank, rerank })`.
3. Capability: `pages:edit` (the tree is read-only without it).
4. Writes: `pages.parentId` and `rank` (and sibling ranks when the tree re-ranks). No version.
5. Failure states: into itself or a descendant, or into another space (the tree rolls back and the error toasts), permission denied, simulated offline.

## Delete a page

1. A page with no subpages → **Delete** → confirm.
2. Service: `services.pages.remove(id)`.
3. Capability: `pages:edit`.
4. Writes: deletes the page from `pages` and its rows from `versions`.
5. Failure states: it has subpages, permission denied, simulated offline.

## Search

1. Home, a space or **Search** → type words → results with highlighted title and snippet; filter by space.
2. Service: none (a read). `searchPages()` in `src/domain/wiki.ts` runs in memory over `pages`.
3. Capability: none; everyone can search.
4. Writes: nothing. The query is in the URL (`#/search?q=…&space=…`).
5. Failure states: no match (an empty state), an empty query (a hint).