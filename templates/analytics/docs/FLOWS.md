# Product Analytics: flows

Each flow ends in the service layer: UI → service → `session.assert` → zod →
`environment.run` → `db.transaction`. Every mutation in
`src/domain/services.ts` should appear in at least one flow.

## Arrange the dashboard

1. On Overview, the user selects **Edit layout**, then moves or resizes a widget (drag, or the handle's keyboard controls).
2. Service: `dashboards.saveLayout(id, { layout })` in src/domain/services.ts. The grid shows the change at once, is busy until the promise settles, and restores the old layout if it rejects.
3. Capability: `dashboards:edit`
4. Writes: `dashboards.layout`, `dashboards.updatedAt`; `activity` (`dashboard.layout_saved`)
5. Failure states: permission denied (viewer), invalid layout (field error), simulated offline (nothing written)

## Rename the dashboard

1. On Overview, the user selects **Rename** and saves a new name.
2. Service: `dashboards.rename(id, { name })`
3. Capability: `dashboards:edit`
4. Writes: `dashboards.name`, `dashboards.updatedAt`; `activity` (`dashboard.renamed`)
5. Failure states: permission denied, name too short (inline error), simulated offline (nothing written)

## Save a segment

1. On Trends, the user builds a filter in the filter panel, names it in the segment picker and saves it.
2. Service: `segments.create({ name, filter })`
3. Capability: `segments:create`
4. Writes: `segments` (new row owned by the actor); `activity` (`segment.created`)
5. Failure states: permission denied (viewer), unknown property or wrong operator (field errors), simulated offline (nothing written)

## Manage segments

1. On Segments, the user renames a segment or deletes it after a confirmation.
2. Service: `segments.rename(id, { name })`, `segments.remove(id)`
3. Capability: `segments:manage-all`, or `segments:manage-own` for segments the actor owns (checked against the stored row inside the transaction)
4. Writes: `segments` (update or delete); `activity` (`segment.renamed`, `segment.deleted`)
5. Failure states: permission denied (viewer, or a member acting on someone else's segment), simulated offline (nothing written)
