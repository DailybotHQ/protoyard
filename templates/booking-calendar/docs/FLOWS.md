# Booking Calendar: flows

Each flow ends in the service layer: UI → service → `session.assert` → zod →
`environment.run` → `db.transaction`. Every mutation in
`src/domain/services.ts` should appear in at least one flow.

## Book from the calendar

1. On Calendar, staff click an empty slot (or **New booking**), pick the resource, length and customer, and select **Confirm booking**.
2. Service: `bookings.create(input)` in src/domain/services.ts (runs as `environment.run('bookings.confirm')`)
3. Capability: `bookings:manage`
4. Writes: `bookings` (status `confirmed`, source `staff`); `activity` (`booking.created`)
5. Failure states: the time overlaps a confirmed booking ("That time overlaps …"), is outside opening hours, is in the past or off the grid (field errors); permission denied; simulated offline (nothing written)

## Move a booking

1. On Calendar, staff drag a booking (or press Space, move with the arrows, and Enter). The move shows at once and is put back if refused.
2. Service: `bookings.reschedule(id, { start, end })`
3. Capability: `bookings:manage`
4. Writes: `bookings.start`, `end`, `updatedAt`; `activity` (`booking.rescheduled`)
5. Failure states: the new time overlaps another booking or is outside the hours; only confirmed bookings move; permission denied; offline

## Cancel a booking

1. On Calendar or Bookings, staff open a booking, add an optional reason and select **Cancel booking**. Its time becomes free again.
2. Service: `bookings.cancel(id, { reason })`
3. Capability: `bookings:manage`
4. Writes: `bookings.status` = `cancelled`, `cancelReason`; `activity` (`booking.cancelled`)
5. Failure states: only upcoming confirmed bookings can be cancelled; permission denied; offline

## Book online

1. On Book online, a client picks a resource, a length, a day and one of the **free** times offered, enters a name and an `@example.com` email, and selects **Confirm booking**.
2. Service: `bookings.bookPublic(input)` (`environment.run('bookings.confirm')`)
3. Capability: `bookings:book-public`
4. Writes: `bookings` (source `public`); `activity` (`booking.booked_public`)
5. Failure states: the slot was taken meanwhile ("That time overlaps …", shown above the times); invalid email; viewers can browse but not book; offline

## Change opening hours

1. On Resources, the owner edits one weekday's opening and closing time.
2. Service: `availability.update(ruleId, { startMinute, endMinute })`
3. Capability: `availability:manage`
4. Writes: `availability`; `activity` (`availability.updated`). Existing bookings stay; new bookings follow the new hours.
5. Failure states: closing not after opening, or off the 15-minute grid (field errors); permission denied; offline

## Time passes (no user action)

1. Advancing simulated time (DevTools) emits `booking.ended` for each confirmed booking that ended.
2. `applyEvent` in src/prototype.ts sets `completed` or `no-show` (`outcomeFor(seed, id)`); cancelled or moved bookings are skipped.
