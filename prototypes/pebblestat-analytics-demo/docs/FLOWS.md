# Pebblestat Analytics: flows

Each flow ends in the service layer: UI → service → `session.assert` → zod →
`environment.run` → `db.transaction`. Every mutation in
`src/domain/services.ts` appears in at least one flow. Every flow fails the
same ways: permission denied (a viewer, or an analyst acting on someone else's
row) and simulated offline (nothing written).

## Arrange the dashboard

1. On Overview, the user selects **Edit layout** and moves or resizes a widget, or selects **Rename**.
2. Service: `dashboards.saveLayout(id, { layout })`, `dashboards.rename(id, { name })`
3. Capability: `dashboards:edit`
4. Writes: `dashboards.layout` / `name`, `updatedAt`; `activity`
5. Failure states: invalid layout or name (field errors); the grid restores the old layout if saving fails

## Save a report

1. On Trends, the user picks an event, measure, breakdown and filter, then **Save report**.
2. Service: `reports.save({ projectId, name, config })`; on Reports, `reports.rename(id, { name })` and `reports.remove(id)`
3. Capability: `reports:save`; renaming or deleting someone else's report needs `reports:manage-all`
4. Writes: `reports`; `activity` (`report.saved`, `report.renamed`, `report.deleted`)
5. Failure states: unknown event or property (field errors)

## Save and manage a segment

1. On Trends, the user saves the filter as a segment; on Segments, renames or deletes it.
2. Service: `segments.create({ projectId, name, filter })`, `segments.rename`, `segments.remove`
3. Capability: `segments:create`, `segments:manage-own` / `segments:manage-all`
4. Writes: `segments`; `activity`
5. Failure states: unknown property or operator (field errors)

## Annotate the timeline

1. On Trends, the user selects **Annotate** and picks a title, kind and past day; the note appears in the strip under the charts.
2. Service: `annotations.create({ projectId, title, kind, day })`, `annotations.remove(id)`
3. Capability: `annotations:create`; removing someone else's note needs `annotations:manage-all`
4. Writes: `annotations`; `activity`
5. Failure states: a future day or a short title (field errors)

## Create and manage an alert

1. On Alerts, the user creates an alert (event, above or below, daily threshold), then mutes, unmutes or deletes it.
2. Service: `alerts.create(input)`, which stores a baseline from the last 14 days; `alerts.setMuted(id, muted)`; `alerts.remove(id)`
3. Capability: `alerts:manage`; someone else's alert needs `alerts:manage-all`
4. Writes: `alerts`; `alertChecks` (deleted with the alert); `activity`
5. Afterwards: advancing simulated time runs the daily checks (timeline `alert.check` → `applyEvent`), which write `alertChecks` and update `alerts.status`. Failure states: a negative or fractional threshold (field errors)
