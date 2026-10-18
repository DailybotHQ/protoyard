# Relay — team AI chat: screens

## Routes

<!-- protoyard:generated:routes -->
_No `src/routes.ts`: this prototype declares its routes in `src/App.svelte`. List the screens by hand below._
<!-- /protoyard:generated:routes -->

Declared with `createRouter` in `src/App.svelte` (hash routing):

| Path | Screen | Title | Required capability |
| --- | --- | --- | --- |
| `#/` | `src/screens/Home.svelte` | Conversations | none checked (every role holds `chat:read`) |
| `#/c/:id` | `src/screens/Thread.svelte` | Conversation | none checked (every role holds `chat:read`; there is no membership check on the id) |

The conversation list (`src/components/ConversationList.svelte`) is not a
route: it is the left pane of the shell. Any other path shows the router's
built-in "Page not found" screen in the conversation pane.

## Screens

### Shell and layout (all routes)

- Container queries (`@3xl`), not media queries, pick the layout, so the
  DevTools phone presets get the real phone layout.
- Wide (desktop): the conversation list (320 px) and the routed pane sit side
  by side.
- Narrow (phone): one pane at a time. `#/` shows the list; `#/c/:id` shows the
  thread with a back arrow to `#/`.
- An environment banner sits on top: "You are offline" (simulated offline),
  "Agents are having trouble" or "Service problems" (simulated failure mode,
  for example `agent-outage`), or "Slow connection" (simulated slow network).
- When the demo badge is on (`build.demoBadge`), extra bottom padding keeps
  the fixed "Prototype" badge off the composer and the persona card.

### Conversation list (left pane)

- **Purpose:** find and open conversations.
- **Data shown:** the workspace name, the conversations the active persona
  participates in (pinned first, then most recent), each with up to two agent
  avatars (or `#`), title, pin icon, time of the last message, a preview of
  the last message ("You: …" for your own) and an unread badge (99+ cap).
  The active persona's name and role label at the bottom.
- **Actions:** **New** (opens the "New conversation" dialog: name, agents,
  optional teammates); Inbox / Archived (count) toggle; search messages
  (2+ characters) with highlighted matches linking to each conversation.
- **Empty:** "No conversations yet" with **Ask Atlas** (phone only; desktop
  shows the welcome pane instead); "Nothing archived"; "Inbox zero" when
  every conversation is archived; "No messages match" for an empty search.
- **Loading:** "Loading conversations…".
- **Denied:** without `conversations:create` (viewer) the **New** and **Ask
  Atlas** buttons are hidden.
- **Error:** failures of the "New conversation" dialog show an error toast
  and keep the dialog open.

### Home (`#/`)

- **Purpose:** the landing pane. On a phone the list fills the screen
  instead.
- **Data shown:** a new user (no conversations) gets "Welcome to Relay,
  <first name>" with an **Ask Atlas** button; everyone else gets "Pick a
  conversation". Below, "Your agents": each agent's avatar, name, handle and
  description.
- **Actions:** **Ask Atlas** or **Ask <agent>** creates a direct
  conversation with that agent and opens it.
- **Denied:** without `conversations:create`, the welcome shows "Your role
  can read conversations but not start them." and the Ask buttons are hidden.
- **Error:** a failed create shows "Could not start a chat with <agent>".

### Thread (`#/c/:id`)

- **Purpose:** read and write one conversation with people and agents.
- **Data shown:** title, agent names, people count and "Pinned" in the
  header; messages grouped by author (within five minutes) and by day, with
  avatars and an "Agent" tag; agent replies rendered as safe Markdown
  (paragraphs, lists, bold, italics, code, tables, mentions; never
  `{@html}`). Only the newest 60 messages render at first, which keeps the
  600-message "All-hands archive" of the `long-thread` scenario fast. Opening
  a conversation moves focus to its title; focus stays in the composer after
  you send.
- **Actions:** the composer (Enter to send, Shift+Enter for a new line,
  @mention autocomplete with arrow keys and Enter or Tab, agent chips when
  the conversation has several agents, a hint about who answers); starter
  prompts in an empty conversation; **Stop** per streaming reply and in the
  composer; **Retry** on failed or interrupted replies; **Load earlier
  messages** (60 more, keeping the reading position); a "New messages"
  button when scrolled up; the ⋯ menu with Pin/Unpin, Rename…, Archive or
  Unarchive, and Delete… (with a confirmation dialog).
- **Streaming:** a typing indicator names the agents streaming in this page;
  a reply shows "Thinking…" then "Writing…" as chunks arrive; a stopped reply
  shows "Stopped". Screen readers hear each finished agent reply once
  through a polite live region. Auto-scroll happens only when already at the
  bottom, and is instant with reduced motion.
- **Empty:** "No messages yet. Try one of these:" with starter prompts (or
  just "No messages yet." without `messages:send`).
- **Loading:** "Loading conversation…".
- **Not found:** "Conversation not found" (deleted, or from another
  scenario) with "Back to conversations".
- **Error:** "Message not sent" toast keeps the draft; a failed reply shows
  "Reply failed." with the error and **Retry**; a reply cut off by a reload
  shows "Reply interrupted (the page reloaded mid-stream)." with **Retry**;
  "Could not retry" toast when a retry fails before it starts.
- **Denied:** a viewer sees a "read-only access as a guest" banner, a
  disabled composer with the reason, no ⋯ menu entries and no Retry or Stop.
  Rename, Archive and Delete appear only when `conversations:manage` allows
  this conversation (members: their own). An archived conversation shows an
  "archived" banner (with **Unarchive** when allowed) and a disabled composer.
- **Phone vs desktop:** on a phone the header has a back arrow to `#/`; the
  layout is otherwise the same.

## Shell

`protoyard.json` sets `"platform": "responsive"` and `"preview": { "viewport": "desktop" }`:
it is designed for a desktop viewport, with no device frame. The layout
also works at phone width (see "Shell and layout" above); use the DevTools
viewport presets to check it. The default appearance is the `ocean` theme in
dark mode.
