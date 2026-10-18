# Pipeline CRM: flows

Each flow ends in the service layer: UI → service → `session.assert` → zod →
`environment.run` → `db.transaction`. Every mutation in
`src/domain/services.ts` should appear in at least one flow.

Common failure behavior: the UI calls services through `runService`. A
permission denial shows a "Not allowed" toast, a simulated network failure
(offline, timeout, server error, rate limit) shows a toast with the
simulated message, and a zod `ValidationError` is shown inline next to the
form field. In every failure case nothing is written. Create flows also
check the plan first: in an expired workspace (`trial-expired`) they throw
`PaywallError` (shown as an error toast), and most create buttons are
disabled (the Dashboard header "Company" button is not).

## Create a company

1. Dashboard ("Company", or "Add your first company" on an empty workspace) or Companies → "New company". Fill name, website domain, industry, employees, city and comma-separated tags. On success the app opens the new company.
2. Service: `companies.create(input)` in src/domain/services.ts
3. Capability: `companies:write` (owner, admin, rep). The plan must be active.
4. Writes (one transaction): `companies` (new row: id, name, industry, employees, domain, city, tags, ownerId = acting persona, createdAt, updatedAt), `activities` (a `created` entry with companyId)
5. Failure states: permission denied, paywall (expired plan), validation errors (name 2–80 characters, domain like `acme.example`, employees 1–1,000,000, up to 8 tags), simulated offline or failure (nothing written)

## Edit a company

1. Company detail → "Edit". Change any field and "Save changes".
2. Service: `companies.update(id, input)` in src/domain/services.ts
3. Capability: `companies:write` (owner, admin, rep; no record-level rule, so a rep can edit any company)
4. Writes (single update, no activity entry): `companies` (name, industry, employees, domain, city, tags, updatedAt)
5. Failure states: permission denied, validation errors (same rules as create), simulated offline or failure (nothing written). The paywall is not checked on edits.

## Delete a company and everything it owns

1. Company detail → "Delete" → confirm. The dialog states how many contacts and deals go with it. On success the app returns to Companies.
2. Service: `companies.remove(id)` in src/domain/services.ts
3. Capability: `companies:delete` (owner and admin through `*`; reps and viewers do not hold it)
4. Writes (one transaction): deletes from `activities` (rows with this companyId, and rows whose dealId belongs to the company's deals), `deals` (rows with this companyId), `contacts` (rows with this companyId) and `companies` (the row)
5. Failure states: permission denied, simulated offline or failure (nothing deleted)

## Create a contact

1. Contacts → "New contact", or Company detail → "Contact" (company preselected). Fill first and last name, email, phone, job title and company.
2. Service: `contacts.create(input)` in src/domain/services.ts
3. Capability: `contacts:write` (owner, admin, rep). The plan must be active.
4. Writes (one transaction): `contacts` (new row: id, companyId, firstName, lastName, email, phone, title, ownerId = acting persona, createdAt, updatedAt), `activities` (a `created` entry with companyId and contactId)
5. Failure states: permission denied, paywall, validation errors (names required, valid email, a company must be picked, "That company no longer exists"), simulated offline or failure (nothing written)

## Edit a contact

1. Contacts → the pencil button on a row → change fields → "Save changes".
2. Service: `contacts.update(id, input)` in src/domain/services.ts
3. Capability: `contacts:write` (owner, admin, rep; no record-level rule)
4. Writes (single update, no activity entry): `contacts` (companyId, firstName, lastName, email, phone, title, updatedAt)
5. Failure states: permission denied, validation errors, simulated offline or failure (nothing written)

## Delete a contact

1. Contacts → the trash button on a row → confirm. Deals that listed the person keep existing.
2. Service: `contacts.remove(id)` in src/domain/services.ts
3. Capability: `contacts:delete` (owner and admin through `*`; reps and viewers do not hold it)
4. Writes (one transaction): `deals` (contactId set to `null` where it was this contact), `contacts` (the row deleted). Activities are not touched.
5. Failure states: permission denied, simulated offline or failure (nothing written)

## Create a deal

1. Dashboard "New deal", Deals "New deal", Company detail "Deal" (company preselected) or the "+" on an open Pipeline column (stage preselected). Fill title, company, optional primary contact (from that company), amount in USD, expected close date, stage and owner. From Dashboard, Deals and Company detail the app opens the new deal; from the Pipeline it stays on the board.
2. Service: `deals.create(input)` in src/domain/services.ts
3. Capability: `deals:create` (owner, admin, rep). The plan must be active. Any persona can be chosen as owner, including by a rep.
4. Writes (one transaction): `deals` (new row: id, title, companyId, contactId, ownerId (input or acting persona), stage (default `lead`), amount rounded to whole dollars, currency `USD`, probability from the stage, closeDate as ISO, lostReason `'No reason given'` if created as lost else `null`, closedAt set if created as won or lost, createdAt, updatedAt), `activities` (a `created` entry with dealId and companyId)
5. Failure states: permission denied, paywall, validation errors (title 3–100 characters, company required and existing, amount 0–100,000,000, valid close date), simulated offline or failure (nothing written)

## Edit a deal

1. Deal detail → "Edit" → change title, company, contact, amount, close date, stage or owner → "Save changes".
2. Service: `deals.update(id, input)` in src/domain/services.ts
3. Capability: `deals:update` with the deal as the resource (reps: only deals whose `ownerId` is their persona; the check uses the stored deal, so a rep may reassign their own deal to someone else)
4. Writes (one transaction): `deals` (title, companyId, contactId, ownerId, amount, closeDate, updatedAt; and when the stage changed: stage, probability, lostReason, closedAt), `activities` (a `stage-change` entry only when the stage changed)
5. Failure states: "Deal not found", permission denied, validation errors, simulated offline or failure (nothing written). The paywall is not checked on edits.

## Move a deal to another stage

1. Pipeline → drag the card to another column, or the card's "Move to…" menu (keyboard path); or Deal detail → the "Change stage" select. Choosing `lost` opens the lost-reason dialog instead (next flow). Cards a persona cannot update are not draggable and have no menu.
2. Service: `deals.moveStage(id, stage)` in src/domain/services.ts
3. Capability: `deals:update` with the deal as the resource (reps: own deals only)
4. Writes (one transaction): `deals` (stage, probability, lostReason (`null` unless lost), closedAt (set when won or lost, cleared otherwise), updatedAt), `activities` (a `stage-change` entry "Moved from X to Y"). Moving to the current stage writes nothing.
5. Failure states: "Deal not found", permission denied, simulated offline or failure (nothing written)

## Mark a deal as lost

1. Pipeline (drag or "Move to…" → Lost) or Deal detail ("Change stage" → Lost) → the "Mark deal as lost" dialog → pick a reason (Budget, Chose a competitor, No decision, Timing, Missing feature) → "Mark lost".
2. Service: `deals.moveStage(id, 'lost', lostReason)` in src/domain/services.ts
3. Capability: `deals:update` with the deal as the resource (reps: own deals only)
4. Writes (one transaction): `deals` (stage `lost`, probability 0, lostReason, closedAt, updatedAt), `activities` (a `stage-change` entry)
5. Failure states: permission denied, simulated offline or failure (nothing written; the dialog stays open)

## Delete a deal

1. Deal detail → "Delete" → confirm. On success the app returns to Deals.
2. Service: `deals.remove(id)` in src/domain/services.ts
3. Capability: `deals:delete` with the deal as the resource (reps: own deals only). A deal that no longer exists returns without error.
4. Writes (one transaction): deletes from `activities` (rows with this dealId) and `deals` (the row)
5. Failure states: permission denied, simulated offline or failure (nothing deleted)

## Log an activity on a deal

1. Deal detail → Activity tab → type the text, pick Note, Call, Email or Meeting → "Log activity". The form is hidden for personas without the capability.
2. Service: `activities.log(type, body, refs)` in src/domain/services.ts (the screen passes `{ dealId, companyId }`)
3. Capability: `activities:create` (owner, admin, rep; no record-level rule, so a rep can log on any deal)
4. Writes (single insert): `activities` (id, type, body (trimmed), dealId, companyId, contactId, actorId = acting persona, at = simulated now)
5. Failure states: permission denied, validation errors ("Write at least 2 characters", "Keep it under 2,000 characters"), simulated offline or failure (nothing written)
