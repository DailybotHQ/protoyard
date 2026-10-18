# Lumen Bank (fictional): flows

Each flow ends in the service layer: UI → service → `session.assert` → zod →
`environment.run` → `db.transaction`. Every mutation in
`src/domain/services.ts` should appear in at least one flow.

All amounts below are integer cents. The transfer form takes dollars
(`amount`, a number) and the service converts them with
`Math.round(amount * 100)`. Every service error is turned into plain words by
`describeError` in `src/lib/errors.ts`.

## Send money between own accounts

1. Transfer tab (`#/transfer`), or "Move money" on an account page
   (`#/transfer?from=<accountId>`). Pick the source account (locked and
   dormant accounts are disabled), pick another own account as the recipient,
   enter an amount (quick picks $20, $50, $100, $250) and an optional memo,
   then Review → "Send $X". The amount step warns ahead of time when the
   amount exceeds the available balance, the account's per-transfer limit or
   the joint-holder cap.
2. Service: `services.transfer({ fromAccountId, toAccountId, beneficiaryId: null, amount, memo })` in src/domain/services.ts
3. Capability: `transfers:create` (owner and member). Record-level rule:
   a `member` may send at most 50,000 cents ($500) per transfer; the service
   passes `{ amountCents }` to `session.assert`.
4. Writes (one Dexie transaction): `transfers` (id, fromAccountId,
   toAccountId, beneficiaryId = null, amountCents, memo, status =
   `completed`, createdBy = active persona id, at), `transactions` (a debit
   row of `-amountCents` on the source and a credit row of `+amountCents` on
   the destination, both category `transfer`, status `posted`, transferId =
   the transfer id), `accounts` (balanceCents of both accounts).
5. Failure states (nothing written in every case): invalid input (zod: exactly
   one recipient, amount greater than zero and at most 1,000,000 dollars, memo
   at most 80 characters; amounts that round to 0 cents), permission denied
   (viewer; member above $500), same account, account not found, source or
   destination locked or dormant, over the source account's per-transfer
   limit (`dailyLimitCents`), insufficient funds (checking and savings cannot
   go below 0; a credit account can go down to `-10 × dailyLimitCents`),
   simulated offline or server failure from `environment.run`. The review
   step shows the error inline with "No money moved", plus a toast. The
   success state is a receipt with the transfer id as the reference.

## Send money to a payee

1. Transfer tab, choose a payee as the recipient; or the send icon on a payee
   in Payees (`#/transfer?to=<payeeId>`). Deep links skip the steps they
   already answer. Same amount, review and receipt steps as above.
2. Service: `services.transfer({ fromAccountId, toAccountId: null, beneficiaryId, amount, memo })` in src/domain/services.ts
3. Capability: `transfers:create` (owner and member; member capped at 50,000
   cents per transfer by the record-level rule).
4. Writes (one Dexie transaction): `transfers` (toAccountId = null,
   beneficiaryId set, other fields as above), `transactions` (one debit row of
   `-amountCents` on the source, merchant = the payee nickname or name),
   `accounts` (source balanceCents). Money leaves the ledger; there is no
   receiving account.
5. Failure states: the same as between own accounts, plus "That recipient no
   longer exists" when the payee was removed. Nothing written.

## Add a payee

1. Payees (`#/payees`) → "+" in the header (or "Add a payee" on the empty
   state) → bottom sheet with full name, optional nickname, fictional bank
   name and the last 4 digits only → "Save payee". The form validates with the
   same zod schema before calling the service.
2. Service: `services.addBeneficiary({ name, nickname, institution, last4 })` in src/domain/services.ts
3. Capability: `beneficiaries:manage` (owner only, through `*`). No
   record-level rule.
4. Writes (a single `add` inside `environment.run`, no explicit transaction):
   `beneficiaries` (id, ownerId = active persona id, name, nickname (defaults
   to the first word of the name), institution, masked = `•••• <last4>`,
   createdAt).
5. Failure states: permission denied (checked before validation), invalid
   input (name 2–60 characters, nickname at most 24, institution 2–40,
   last4 exactly four digits; shown per field), simulated offline or server
   failure. Nothing written.

## Remove a payee

1. Payees → trash icon on a payee → confirm "Remove payee" in the alert
   dialog. Errors are shown inside the dialog, which stays open.
2. Service: `services.removeBeneficiary(id)` in src/domain/services.ts
3. Capability: `beneficiaries:manage` (owner only). No record-level rule.
4. Writes: deletes the `beneficiaries` row. Past `transfers` and
   `transactions` are not changed, so a transfer keeps its `beneficiaryId`
   even after the payee is gone.
5. Failure states: permission denied, simulated offline or server failure.
   Nothing written.

## Freeze, unfreeze or reactivate an account

1. Account page (`#/accounts/:id`) → "Freeze account" (active account),
   "Unfreeze account" (locked) or "Reactivate account" (dormant) → confirm in
   the alert dialog. Non-owners do not see the button; on a non-active
   account they see "Only the primary holder can unfreeze or reactivate this
   account."
2. Service: `services.setAccountStatus(id, status)` in src/domain/services.ts,
   with `status` = `locked` (freeze) or `active` (unfreeze, reactivate). The
   service cannot set `dormant`.
3. Capability: `accounts:manage` (owner only). No record-level rule.
4. Writes: `accounts` (status).
5. Failure states: permission denied, simulated offline or server failure
   (shown inside the dialog). Nothing written. An unknown id updates nothing.

## Simulated payroll deposit

1. Home → "Payroll" quick action, or "Simulate payroll deposit ($2,850.00)"
   on the welcome empty state of a brand-new account. The deposit goes to the
   first active checking account; the button is disabled without
   `transfers:create` or without an active checking account.
2. Service: `simulations.simulatePayroll(accountId, amountCents = 285000)` in
   src/lib/simulations.ts. It is a demo money source, not part of
   `src/domain/services.ts`, but it follows the same rules.
3. Capability: `transfers:create`, asserted without a resource, so the member
   cap does not apply to deposits.
4. Writes (one Dexie transaction): `transactions` (one row of
   `+amountCents`, description "Payroll deposit (simulated)", category
   `salary`, status `posted`, transferId = null), `accounts` (balanceCents).
5. Failure states: permission denied (viewer), amount not a positive integer
   of cents, account not found, account locked or dormant ("deposits are
   paused"), simulated offline or server failure. Nothing written.

## View balances and activity (read only)

1. Home, an account page and Activity read `accounts` and `transactions`
   through `liveQuery`, so every write above shows up immediately. Activity
   filters by account, category and direction and loads 30 rows at a time.
2. Service: none. Screens read IndexedDB directly; no service method is
   called.
3. Capability: `accounts:read` is granted to every role but is not asserted
   anywhere, so reads are never denied.
4. Writes: none.
5. Failure states: reads keep working in simulated offline mode (the data is
   on the device).

## Change the color mode

1. Profile → Appearance → Light, Dark or System.
2. Service: `runtime.theme.setPreference({ mode })` (platform runtime, not a
   domain service).
3. Capability: none.
4. Writes: the active persona's appearance preference, stored by the runtime
   on this device. No domain table changes.
5. Failure states: an error is shown as a toast.

## Time passes (timeline)

1. DevTools → advance simulated time. The timeline in
   `src/domain/timeline.ts` derives events day by day for the window
   `(from, to]`: payroll of 285,000 cents to `acct_checking` on the 1st and
   15th (09:00 UTC), rent of 180,000 cents from `acct_checking` on the 3rd
   (08:00), an auto-save of 40,000 cents from `acct_checking` to
   `acct_savings` on the 5th (10:00), and 1–3 card purchases a day on
   `acct_credit` (45%) or `acct_checking`.
2. Handler: `applyBankEvent(event, ctx)` in src/domain/timeline.ts, run by
   the runtime inside its transaction for each event id it has not applied.
3. Capability: none (it is the simulated passage of time, not a user action).
4. Writes: `transactions` (one posted row per posting, id
   `txn_<event id>_<index>`, transferId = null, category from the event),
   `accounts` (balanceCents of every account touched). The runtime records the
   event in the platform table `py_events`, with `payload.outcome` set to
   `applied` or `skipped` plus a reason.
5. Skips (nothing written for that event): the account does not exist in this
   world (for example `acct_savings` in `new-account`), the account is locked
   or dormant, a debit would take checking or savings below 0, or a card
   below `-10 × dailyLimitCents`. A multi-leg event (auto-save) lands
   completely or not at all. Events depend only on the scenario, the day and
   stable account ids (event ids look like `evt:<scenario>:<day>:<n>`), so
   advancing 7 days at once or 1 day seven times commits the same events, and replaying a window applies nothing. Previewing
   time without committing writes nothing.
