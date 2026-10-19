# Social Feed: screens

## Routes

<!-- protoyard:generated:routes -->
| Route | Screen | Capability | Description |
| --- | --- | --- | --- |
| `#/` | Feed | — | Home and everyone timelines with the composer. |
| `#/notifications` | Notifications | — | Reactions, comments, follows and mentions aimed at you. |
| `#/people` | People | — | Everyone in the network, with follow buttons. |
| `#/people/:handle` | Profile | — | A person, their follow state and their posts. |
<!-- /protoyard:generated:routes -->

## Screens

<!-- protoyard:generated:screens -->
| Screen | Route | Description |
| --- | --- | --- |
| Feed | `#/` | Home and everyone timelines with the composer. |
| Notifications | `#/notifications` | Reactions, comments, follows and mentions aimed at you. |
| People | `#/people` | Everyone in the network, with follow buttons. |
| Profile | `#/people/:handle` | A person, their follow state and their posts. |
<!-- /protoyard:generated:screens -->

- **Feed:**
  - Home and Everyone tabs; the composer for members and moderators, or a note for viewers.
  - A windowed `role="feed"` list of posts: author link, time, plain text, placeholder image, reaction toggles (`aria-pressed`), a comment thread that expands, and delete where allowed.
  - States: loading, an empty home ("Follow people…"), an empty network.
- **Notifications:**
  - Newest first; unread rows tinted and announced. Actions: Mark read, Mark all read (members and moderators).
  - States: loading, and an empty inbox that explains how to advance time.
- **People:** everyone but you, by handle, each with Follow or Following (hidden for viewers).
- **Profile** (`#/people/:handle`): name, handle, bio, follower and following counts, a Follow button, and that person's posts in the same windowed list. Not-found and no-posts states.

## Shell

A responsive web app previewed at the desktop viewport (`preview.viewport: desktop`):
- **Desktop:** a left sidebar with section links and the persona card.
- **Below `md`:** a bottom navigation bar instead.
- **Height:** the app is bound to the window (`h-app`), and each screen's list is the scroll region, so the composer stays on screen on phones (390×844).
