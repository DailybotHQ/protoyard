# Protoyard UI Kit: flows

Each flow ends in the service layer: UI → service → `session.assert` → zod →
`environment.run` → `db.transaction`. Every mutation in
`src/domain/services.ts` should appear in at least one flow.

This prototype has no `src/domain/services.ts`. Its only domain service is
`createFavoriteServices(runtime)` in src/domain/favorites.ts (cached by
`favoritesService()` in src/lib/services.ts), with two mutations:
`toggle` and `clear`. Both are covered below. The remaining sections are
the kit's main demo interactions: the Theme Lab writes through the
runtime's theme controller (not a domain service), and the Forms page and
component demos keep everything in memory.

Common failure behavior for favorites: the UI calls the service through
`runService`. A permission denial shows a "Not allowed" toast, a simulated
network failure (offline, timeout, server error, rate limit) shows a toast
with the simulated message, and any other error shows "Something went
wrong". In every failure case nothing is written.

## Star a component

1. On any component card (a group page, a component page or the Favorites
   list) → the ☆ button ("Add <name> to favorites"). The button shows a
   loading state while the call runs, then a filled star; the sidebar
   Favorites badge and the Overview "Your favorites" count update live.
2. Service: `favoritesService().toggle(entryId)` in src/domain/favorites.ts
3. Capability: `favorites:manage` (designer, through `*`). No record-level
   rule: the row always belongs to the acting persona.
4. Writes (one transaction): `favorites` (new row: id `fav…` from
   `createRuntimeId`, personaId = acting persona, entryId, createdAt =
   simulated now). Returns `true`.
5. Failure states: permission denied, "Unknown catalog entry" when the id
   is not 1–64 lowercase letters, digits or dashes (a hand-written regex,
   not zod; it checks the format only, not that the id is in the catalog),
   simulated offline or failure (nothing written). For a viewer the button
   is replaced by a locked star with the tooltip "Viewers can't change
   favorites. Switch persona in DevTools.", so the call is not made from
   the UI.

## Unstar a component

1. The filled ★ button ("Remove <name> from favorites") on a component
   card or on a row of the Favorites page. The row disappears from
   Favorites.
2. Service: `favoritesService().toggle(entryId)` in src/domain/favorites.ts
3. Capability: `favorites:manage` (designer)
4. Writes (one transaction): `favorites` (the acting persona's row for
   that entry, found through the `[personaId+entryId]` index, is deleted).
   Returns `false`. Other personas' stars are untouched.
5. Failure states: the same as starring.

## Clear all favorites

1. Favorites → "Clear all" (shown only with at least one favorite and
   `favorites:manage`) → the "Clear all favorites?" dialog ("Removes every
   star for the active persona. Other personas keep theirs.") → "Clear
   favorites". On success a "Favorites cleared" toast appears and the page
   shows its empty state.
2. Service: `favoritesService().clear()` in src/domain/favorites.ts
3. Capability: `favorites:manage` (designer)
4. Writes: `favorites` (every row with personaId = acting persona is
   deleted in one bulk delete; there is no explicit `db.transaction`, and
   no input to validate). Returns the number of rows removed.
5. Failure states: permission denied, simulated offline or failure
   (nothing deleted). The error is shown as a toast and the dialog stays
   open with the message, so the user can retry or cancel.

## Use a theme in the prototype

1. Theme lab → a theme card → "Use in prototype". A "Prototype theme set to
   <name>" toast appears, the whole kit re-themes and the card shows an
   "Active" badge.
2. Service: `themeLabService().activate(theme)` in src/domain/themes.ts
   (via `activateTheme` in src/lib/theme-lab.ts): `session.assert` →
   `environment.run('theme.activate')` → register unknown themes with
   `saveCustom` when needed → `setOverride`.
3. Capability: `theme:apply` (designer and viewer). Library themes that are
   not yet on the runtime list are registered under `theme:apply` (viewers
   included). Brand-new Theme Studio drafts still need `theme:manage`
   (designer) via `saveCustom`.
4. Writes: the prototype's control database (appearance override and, when
   registering a library theme, the custom-theme list).
5. Failure states: permission denied, schema errors and the 24-theme limit
   surface as toasts (`runService` with `silentValidation: false`). Simulated
   offline/failure modes apply through `environment.run`.

## Save a Theme Studio draft

1. Theme lab → Theme Studio panel → set a name (default "<selected theme>
   Lab"), brand color, font pairing, density (Compact, Default,
   Comfortable) and corner radius (0–20 px); the light and dark previews
   update live → "Save draft as custom theme". A "Saved and previewing
   “<name>”" toast appears and the kit switches to the new theme.
2. Service: `themeLabService().saveCustom(studioTheme)` then
   `setOverride` (ThemeLabPage). The draft is built with
   `createThemeFromSeed` from `@protoyard/themes`. Path:
   assert → `environment.run('theme.saveCustom')` → control DB.
3. Capability: `theme:manage` (designer). Viewers are denied.
4. Writes: the control database's custom-theme list (id
   `<selected theme id>-lab`, so saving again from the same selected theme
   replaces the previous draft) and the appearance override.
5. Failure states: permission denied, theme-schema errors and the 24-theme
   limit ("You can keep up to 24 custom themes…") show as error toasts
   (`silentValidation: false`). Simulated offline applies via
   `environment.run`.

## Inspect and copy theme tokens

1. Theme lab → "Inspect tokens" on a card, or the "Theme to inspect"
   select; switch Light / Dark; read the token table (token, CSS variable,
   value, contrast badges) → "Copy theme tokens".
2. Service: none. Read-only: `exportThemeJson(theme, exportTheme)` in
   src/lib/theme-lab.ts returns the runtime's export JSON
   (`protoyard-theme/v1` envelope, the format the runtime's theme import
   accepts, so the JSON can be imported in Theme Studio) and writes it to
   the clipboard. Library themes not registered in the runtime get the same
   envelope built locally.
3. Capability: none.
4. Writes: nothing stored. On success the status line says "Copied <name>
   theme tokens.".
5. Failure states: without clipboard access the status says "Clipboard
   access is unavailable. Copy the exported JSON below." and a read-only
   "Exported theme JSON" textarea shows the JSON. Library themes that fail
   to load show "Some library themes could not be loaded. Try another
   category.".

## Submit the Forms page

1. Forms → "Create workspace" form (workspace name, URL slug filled from
   the name until edited, owner email, optional description, industry,
   time zone, visibility, "Invite my team" switch, terms checkbox) →
   "Create workspace". "Reset" clears it.
2. Service: none. Validation and the save are local to FormsPage.
3. Capability: none.
4. Writes: nothing. After an 800 ms wall-clock delay ("Creating…"), a
   "Workspace created" toast and a "Submitted values" card show what was
   entered. Nothing is stored; a reload loses it.
5. Failure states: inline errors appear after the first submit ("Workspace
   name is required.", "Use at least 3 characters.", "URL slug is
   required.", "Lowercase letters, numbers and single dashes only.", "Owner
   email is required.", "Enter a valid email, like you@example.com.",
   "Write at least 20 characters, or leave it empty.", "Choose an
   industry.", "Choose a time zone.", "You must accept the terms to
   continue.") with a "Please fix N fields before continuing." alert, and
   focus moves to the first invalid field. "Public" visibility is disabled
   ("Not available on the free plan.").

## Try a component demo

1. Any group or component page → interact with the live demo (open dialogs
   and sheets, sort and filter the data table, drag Kanban cards, send a
   chat message and get a scripted reply, step through the wizard, fire
   toasts). Patterns (`#/components/patterns`) compose whole screens: a
   SaaS dashboard with a "create deal" form, a task board with a detail
   panel and create/delete, a team chat with conversations and replies, and
   a mobile app that adds orders and advances their status.
2. Service: none. Each `src/demos/*Demo.svelte` keeps its state in memory;
   people and messages come from `src/demos/members.ts`, `chat.ts` and
   `nav.ts` (fictional, `example.com`).
3. Capability: none; demos behave the same for every persona.
4. Writes: nothing persisted. Leaving the page resets the demo. Some demos
   use the wall clock and timers (`new Date()`, `setTimeout`) for message
   times and typing or saving effects, not the simulated clock.
5. Failure states: a demo chunk that fails to load shows "Could not load
   the demo: …" in its card.

## Copy a usage snippet

1. Under any demo → the "Usage" code block → "Copy". The button shows
   "Copied" for 1.5 s and a polite live region announces "Code copied to
   the clipboard".
2. Service: none (`navigator.clipboard.writeText` in
   src/components/CodeBlock.svelte).
3. Capability: none.
4. Writes: the clipboard only.
5. Failure states: without clipboard access nothing happens (the button
   stays "Copy"); the snippet can still be selected in the scrollable,
   focusable code block.
