# Team chat: screens

## Routes

<!-- protoyard:generated:routes -->
_No `src/routes.ts`: this prototype declares its routes in `src/App.svelte`. List the screens by hand below._
<!-- /protoyard:generated:routes -->

## Screens

Single-screen `App.svelte` (same shell as Relay Chat): sidebar channels, message
log with reaction chips and counts, Join on public channels when not a member,
composer disabled for viewers / non-members, read-only toast + disabled tooltips.

**Phones** (same structure as relay-chat-demo):

- Below `md` (768 px) the channel list and the channel are separate full-width
  screens. The app opens on the selected channel. "Back to channels" shows the
  list with focus on the current channel (`aria-current="page"`), and picking a
  channel returns to it with focus on its heading.
- Below `sm` (640 px) search, "Share file" and "Huddle" move into a "More
  actions" disclosure (`aria-expanded`). Escape closes it and returns focus to
  the button, and "Join" stays in the header.
- Closing a thread returns focus to its "Reply in thread" button.

`tests/phone-layout.test.ts` covers these, and every `protoyard new --template
team-chat` starts with them.

## Shell

TODO: the device or host shell and viewport this prototype is designed for (`preview` in protoyard.json).
