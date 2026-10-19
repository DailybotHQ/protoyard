# Relay Chat: screens

## Routes

<!-- protoyard:generated:routes -->
_No `src/routes.ts`: this prototype declares its routes in `src/App.svelte`. List the screens by hand below._
<!-- /protoyard:generated:routes -->

## Screens

Relay Chat is a single screen with no router and no URL routes:
`src/App.svelte` renders everything, and "navigation" is local state
(selected channel, open thread, search results, huddle panel). The
scenario can be chosen with `?scenario=<id>` (as the end-to-end test does)
or in DevTools.

| Area | Purpose | Capability used |
| --- | --- | --- |
| Sidebar | Workspace, channels, bots, presence | `channel:read`, `workspace:read` (reads); `channel:create` ("+ New") |
| Channel header | Channel name and topic; search, share file, huddle | `search:run`, `file:share`, `huddle:start` |
| Message log | Top-level messages of the channel, or one thread's replies | `message:read`; `message:react` |
| Huddle panel | Simulated huddle with captions | `huddle:start` |
| Composer | Post, reply, bot commands, `/huddle` | `message:create` |

Write controls are disabled when the role lacks the capability (tooltip +
toast). Public channels show a **Join** button until the persona is a member.
Services still enforce policy if the UI is bypassed (see
[PERMISSIONS.md](PERMISSIONS.md)).

### Sidebar

- **Purpose:** orientation and channel switching.
- **Data:** the first workspace's name ("Loading…" until it loads) and the
  note "Relay Labs · simulated AI teammate · no real models"; the channels
  from `listChannels` (public channels plus private channels and DMs the
  persona is a member of), newest activity first, `#` for channels and `·`
  for DMs; the three bots as `@handle — Name`; a scrollable "Presence" list
  with each persona's **id** (not name) and status.
- **Actions:** click a channel (closes any open thread, marks it read; on
  phones it also opens the channel screen and focuses its heading); the
  current channel carries `aria-current="page"`; "+ New" toggles an inline "channel-name" field with "Add"
  ([Create a channel](FLOWS.md#create-a-channel)).
- **Empty:** the channel list and presence list render nothing when empty.
  On load the first workspace and its first channel are selected
  automatically.
- **Error / denied:** a failed or denied channel create shows its message
  above the composer.

### Channel header

- **Purpose:** context and channel-level actions.
- **Data:** the selected channel's name and topic ("Select a channel" when
  none is selected).
- **Actions:** "Search…" with Enter or "Search"
  ([Search messages](FLOWS.md#search-messages-read-only)); "Share file"
  ([Share a file](FLOWS.md#share-a-file)); "Huddle"
  ([Start a huddle](FLOWS.md#start-a-huddle)). Below `sm` (640 px) these
  move into a "More actions" disclosure button (`aria-expanded`) that opens
  a row with the search field, "Share file" and "Huddle"; Escape closes it
  and returns focus to the button. "Join" stays in the header at every width.
  Below `md` a "Back to channels" button opens the channel list.
- **Search results:** a "Search results" region with "N result(s)" and up to
  50 hits (first 80 characters each); clicking a hit opens its channel and
  thread. Nothing is shown for zero hits.
- **Error / denied:** share and huddle errors are caught and shown above the
  composer; read-only roles get a toast instead of a silent no-op.

### Message log

- **Purpose:** read the conversation (`role="log"`, "Messages").
- **Data:** without an open thread, the channel's top-level messages in time
  order; with a thread open, only that thread's replies (the parent is not
  repeated). Each message shows the author (a bot's display name, or a
  person's **persona id**), the time (local `HH:MM`), an "AI · simulated"
  badge for bots, the body as plain text (never HTML), and "Attachment id
  <fileId>" when a file is attached. Reactions appear as chips with counts (mine highlighted); toggle updates them.
  Bot replies grow word by word as the service streams them.
- **Actions:** "👍 React" ([React to a message](FLOWS.md#react-to-a-message));
  "Reply in thread" on top-level messages
  ([Reply in a thread](FLOWS.md#reply-in-a-thread)). With a thread open, a
  "Thread" bar (`role="status"`, "Thread open") has "Close", which returns
  focus to the "Reply in thread" button that opened the thread. On phones the
  thread fills the channel screen.
- **Loading:** "Loading messages…" while the query loads.
- **Empty:** "No messages yet. Try @relay, /summarize, or /huddle." (also
  shown for a thread with no replies yet).
- **Error / denied:** reads have no error state; react failures are not
  shown.

### Huddle panel

- **Purpose:** a simulated huddle ("Huddle (simulated)", region "Simulated
  huddle"), shown above the composer after starting one.
- **Data:** "Local captions only — no cloud speech. Phase: <state>" (idle,
  listening, transcribing…), polled every 200 ms; a captions box
  (`aria-live="polite"`) that starts with "Captions appear here (always
  on)." and gains a "You: …" line per push-to-talk.
- **Actions:** "Hold to talk" (press and release;
  [Talk in a huddle](FLOWS.md#talk-in-a-huddle-captions)); "Leave"
  ([Leave a huddle](FLOWS.md#leave-a-huddle)).
- **States:** the panel is local state; it is not restored after a reload
  even if the huddle row is still active, and it does not follow channel
  switches.

### Composer

- **Purpose:** write messages, thread replies, bot prompts and commands.
- **Data:** a hint line "Slash: /summarize · /relay · /standup · /ops ·
  /huddle · Acting as <persona name>"; the placeholder changes to "Reply in
  thread…" when a thread is open.
- **Actions:** Enter or "Send"
  ([Post a message](FLOWS.md#post-a-message),
  [Ask a bot teammate](FLOWS.md#ask-a-bot-teammate),
  [Summarize a channel](FLOWS.md#summarize-a-channel)). An empty draft does
  nothing.
- **Error / denied:** the error message (permission denied, validation,
  simulated offline) appears in red above the form (`role="alert"`) and the
  draft is kept; it clears on the next attempt.

## Shell

`protoyard.json` sets `"preview": { "viewport": "desktop", "shell": "none" }`
and `"platform": "responsive"`: the prototype is previewed at a desktop
viewport with no device frame. The layout is a full-height
(`h-dvh`) chat. From `md` (768 px) it has two columns: a 15rem (`w-60`)
sidebar and the main column. Below `md` the sidebar and the channel are
separate full-width screens (local state, no routes): the app opens on the
selected channel, "Back to channels" shows the list, and picking a channel
returns to it. The end-to-end journey runs on desktop and on a phone
(Pixel 7), where it also checks that the composer is fully on screen. The default theme is `ocean`
and the mode follows the system setting (`defaultMode: system`). The static
build shows the demo badge and does not include DevTools.
