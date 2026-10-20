# Screens — Cadence Studio

| Route | Screen | Behavior |
| --- | --- | --- |
| `#/` | Studio overview | Counts bookings, classes and clients; charts booking status. |
| `#/bookings/calendar` | Bookings calendar | Week view on wide screens and agenda on phones. Select an empty slot to create a booking; drag or grab an event with Space and move it with arrow keys. |
| `#/bookings` | Bookings | Generated list with search, create and record actions. |
| `#/bookings/<id>` | Booking details | Shows the booking and its activity history. |
| `#/settings` | Settings | Saves the theme and light/dark/system mode for this browser. |
| `#/clients`, `#/classes`, `#/instructors`, `#/rooms` | Studio records | Generated CRUD lists and detail forms for supporting records. |

Calendar events without an end field use the calendar's one-hour default. The desktop layout is `sidebar`; the generated layout switches to `mobile-tabs` below 768 px. Calendar data and settings remain local to this prototype.
