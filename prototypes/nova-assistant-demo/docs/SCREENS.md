# Nova Assistant: screens

## Routes

<!-- protoyard:generated:routes -->
_No `src/routes.ts`: this prototype declares its routes in `src/App.svelte`. List the screens by hand below._
<!-- /protoyard:generated:routes -->

## Screens

Declared with `createRouter` in `src/App.svelte` (hash routing):

| Path | Screen | Title | Required capability |
| --- | --- | --- | --- |
| `#/` | `src/screens/Workspace.svelte` | Assistant | none checked to render (every role holds `assistant:read`) |
| `#/settings` | `src/screens/Settings.svelte` | Settings | none checked to render; saving needs `assistant:settings`, clearing data needs `assistant:data` |

Two more views are header tabs in `src/App.svelte`, not routes: **Voice**
and **Widget demo** replace the routed area while selected, and
**Assistant** brings it back. Any other hash path shows the router's
built-in "Page not found" screen. No screen hides an action by role: every
control is shown, and a forbidden action fails in the service with the
error in a notice.

### Shell and layout (all views)

- **Sidebar** (only at `lg` width and up): Nova logo (link to `#/`), **New
  conversation** (labelled with a "⌘ K" hint, but no keyboard shortcut is
  bound), the projects (toggle buttons), "History" (up to 10 conversations
  of the selected project, ★ for pinned), a "Monthly usage" meter (tokens
  of this month's messages against `monthlyLimit`, "simulated"), and
  **Settings**. The sidebar's project and history selection only drive the
  voice view; the Workspace screen keeps its own selection.
- **Header:** the current route title, the tagline, the **Assistant**,
  **Voice** and **Widget demo** tabs, and a Settings icon below `lg`.
- **Alert:** errors from the sidebar's New conversation and from voice sends
  show above the content.
- **Footer:** "Simulation only · responses use deterministic local packs ·
  no model provider is contacted".

### Workspace (`#/`)

- **Purpose:** chat with the simulated assistant inside a project, and
  organize conversations.
- **Data shown:** project chips; a history panel (from `md` width) with
  "Search history" (title filter), "Recent conversations" (newest first, ★
  when pinned) and folders; the thread header (title, folder, "Responses
  are simulated"); the messages in `MessageList` from `@protoyard/ai-ui`
  (a virtualized list, so the 5,000-message `long-history` thread stays
  fast; replies rendered as safe rich text, never `{@html}`); the composer
  with model picker and attachments.
- **Actions:** **New**; select a project, conversation or folder filter;
  create a folder; **Pin**; move to folder; **Rename** (browser prompt);
  **Share** (copies a local link); **Canvas** (dialog loaded on demand);
  send, stop, attach files, change model; **Regenerate**, **Edit** and
  resend, thumbs up or down. See [FLOWS.md](FLOWS.md).
- **Streaming:** the composer's send button becomes "Stop response" while
  a reply streams in this conversation.
- **Empty:** with no conversation at all, "A little room for big ideas"
  with **Start a conversation**; "No matching conversations." when the
  search or folder filter hides everything (the thread still shows the
  first conversation of the project when the selection is cleared).
- **Loading:** no explicit loading state; lists start empty until the
  live queries resolve. The canvas dialog appears once its code has loaded.
- **Error:** a notice above the thread shows the service error (permission
  denied, rate limit, monthly limit, "You are offline (simulated).
  Changes were not saved.", "Something went wrong on the server (simulated
  500)." in `assistant-outage`, or "The simulated agent run was not
  approved.").
- **Denied:** a viewer sees every control; sends and edits fail with the
  permission error in the notice. Opening an empty canvas as a viewer does
  nothing.

### Settings (`#/settings`)

- **Purpose:** personalize the simulated assistant and control what the
  workspace remembers.
- **Data shown:** custom instructions (up to 1,200 characters), a "Use
  saved memory in simulated replies" checkbox, saved memory, context mode
  ("Standard · include enabled memory" or "Private · omit saved memory from
  prompts"), monthly simulated token limit (1,000 to 10,000,000), and a
  note that everything stays in IndexedDB.
- **Actions:** **Save settings**, **Clear saved memory**, **Clear local
  workspace data** (with a confirm dialog), **Back to assistant**.
- **Success:** "Settings saved in this prototype workspace.", "Saved memory
  cleared." or "Local workspace data cleared. Reload or choose a scenario
  to start again."
- **Error / denied:** the error message in a red notice (permission denied
  for a viewer on save or clear memory; for a member or viewer on clear
  workspace; zod messages; simulated offline).
- **Loading:** the form shows defaults until the settings row loads.

### Voice (tab)

- **Purpose:** a simulated voice conversation.
- **Data shown:** "Loading voice mode…" while the module loads; then the
  voice state, push-to-talk or hands-free mode, the scripted transcript as
  "You said · simulated caption", and the latest reply as "Assistant ·
  simulated caption". "Speech output is muted in this browser; captions
  remain available." when speech synthesis is missing.
- **Actions:** "Start push to talk" / "Finish and transcribe"; each
  transcript is sent to the active conversation.
- **Error:** send errors show in the alert above the content.

### Widget demo (tab)

- **Purpose:** show Nova embedded in a fictional host page, "Northstar
  Journal · fictional host site".
- **Data shown:** the host article and the `AssistantWidget` from
  `@protoyard/ai-ui/widget` (loaded on demand): a launcher ("Open simulated
  assistant") that opens a sidebar, which can expand to full screen and be
  restored or closed. Inside, the same conversations, messages, folders and
  canvas as the workspace. The chosen mode (launcher, sidebar, full screen)
  is remembered in `localStorage`.
- **Actions:** send, stop, select, rename, pin, move to folder, create
  folder, regenerate, edit, feedback, share link, edit or close the canvas.
  The new-conversation button is disabled.
- **Error:** none shown: the widget demo calls most services with `void`,
  so failures (permission denied, offline) leave the UI unchanged.

## Shell

`protoyard.json` sets `"platform": "responsive"` and
`"preview": { "viewport": "desktop", "shell": "browser" }`. The **browser**
shell draws a browser frame (a tab and an address bar) with the default
origin `https://nova-assistant-demo.example`, and the tab label follows the
route title ("Assistant" or "Settings", suffixed with "Nova Assistant").
The layout adapts with breakpoints: the sidebar appears from `lg`, the
history panel from `md`.

The default theme is `amethyst` in `system` mode, but the app shell and
screens use mostly fixed colors, so theme and dark mode mainly change the
`@protoyard/ai-ui` components. DevTools are not included in builds
(`build.includeDevtools: false`); use `pnpm protoyard dev` to switch
scenarios, personas, network and clock. The "Prototype" demo badge is on.
