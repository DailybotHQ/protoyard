# Booking Calendar: screens

## Routes

<!-- protoyard:generated:routes -->
| Route | Screen | Capability | Description |
| --- | --- | --- | --- |
| `#/` | Calendar | — | The week calendar: book, move and cancel. |
| `#/bookings` | Bookings | — | Every booking, filtered by upcoming, past and cancelled. |
| `#/book` | Book online | — | The public booking page: pick a resource, a free slot and confirm. |
| `#/resources` | Resources | — | Rooms and people with their weekly opening hours. |
<!-- /protoyard:generated:routes -->

## Screens

<!-- protoyard:generated:screens -->
| Screen | Route | Description |
| --- | --- | --- |
| Calendar | `#/` | The week calendar: book, move and cancel. |
| Bookings | `#/bookings` | Every booking, filtered by upcoming, past and cancelled. |
| Book online | `#/book` | The public booking page: pick a resource, a free slot and confirm. |
| Resources | `#/resources` | Rooms and people with their weekly opening hours. |
<!-- /protoyard:generated:screens -->

- **Calendar:**
  - The views-ui CalendarView: week by default, agenda below `sm`, plus day and month; times are UTC.
  - Tones: confirmed (primary), recurring blocks (warning), completed (success), no-show (danger), cancelled (neutral).
  - A resource filter narrows the view.
  - Staff and the owner click a slot to book, drag or keyboard-move bookings, and open a booking to cancel it. Viewers and clients get a read-only calendar (no drag, no create).
  - Data states (loading, offline, failed) come from the view.
- **Bookings:** a DataTable with Upcoming, Past and Cancelled, showing when, resource, customer and status. A row opens the booking. Each filter has an empty title.
- **Book online:**
  - A four-step public flow: resource, length and day (only open days in the next 14), free times (`freeSlots`), details.
  - A refused slot shows its reason above the times; success shows a confirmation.
  - Viewers see a note and a disabled Confirm.
- **Resources:** each resource with its weekly hours. The owner edits a day's hours in a dialog; others read.

## Shell

A responsive web app previewed at the desktop viewport (`preview.viewport: desktop`). Below `lg` the sidebar is a drawer; below `sm` the calendar opens in agenda view and tables hide secondary columns.
