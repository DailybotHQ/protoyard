# Social Feed

A Protoyard starter for community and social products. It has:
- a **feed** (Home: people you follow and you; Everyone: all posts) that renders only the rows on screen;
- a **composer** that stays on screen;
- **reactions** (one per person per post), threaded **comments** and **follows**;
- **profiles** and a **notifications inbox** that fills as simulated time advances.

Everything is simulated:
- the data lives in the browser;
- roles are a UX simulation (not security);
- post text is plain text, never HTML;
- images are generated gradient placeholders, never uploads.

```bash
pnpm protoyard new my-community --template social-feed
pnpm protoyard dev my-community
```

| Scenario | What you see |
| --- | --- |
| `empty` | People have joined; nobody has posted. Every empty state |
| `active` *(default)* | A month of posts (about 240), reactions, comments, a dozen follows and a few unread notifications |
| `massive` | About 6,000 posts (25× the density): the feed stays smooth because only on-screen rows render |
| `moderator` | The `active` shape seen by a moderator, who can delete anyone's post |
| `viewer` | The `active` shape seen by a read-only viewer |

| Persona | Role | Can do |
| --- | --- | --- |
| `user_0001` Mila | member | post, react, comment, follow, delete own posts |
| `user_0002` Kofi | moderator | everything, and delete anyone's post |
| `user_0003` Hana | viewer | read only |

Open DevTools with **Ctrl/⌘ + .** to switch persona, go offline, or
**advance time**: reactions, comments, follows and mentions arrive in the
inbox and on your posts.

## How it works

- **Windowed feed:** `VirtualFeed` keeps only the visible rows (plus four
  above and below) in the DOM, with spacers for the full height.
  - Row heights are measured with a `ResizeObserver` as rows render (text, an
    image or an open comment thread change them) and estimated until then.
  - `feedWindow()` in `src/domain/feed.ts` does the math, and is unit-tested at
    6,000 rows.
- **Layout:** the app is bound to the window height (`h-app`). The feed list
  is the scroll region and the document never scrolls, so the composer
  (`[data-py-composer]`) stays on screen at 390×844. layout-fit checks this.
- **Services** (assert → zod → `environment.run` → transaction):
  - posts are 1–500 characters of plain text, with blank lines collapsed;
  - `@handle` mentions notify those people;
  - reactions toggle or replace, comments add, follows toggle (never yourself);
  - counts and notifications are written in the same transaction.
- **Activity:** `eventStream()` from `@protoyard/scenarios` generates the post
  history and the activity aimed at you.
  - The same stream seeds the inbox (five days back) and drives the timeline on
    time advance, through the same `notificationFor` resolver.
  - Its ids depend only on the day, so one long advance equals many short ones.
  - Someone who already follows you never "follows" you again.

## Layout

```text
src/database/schema.ts       people (&handle), posts, reactions ([postId+personId]), comments, follows (&pair), notifications
src/domain/feed.ts           timeline(), feedWindow(), mentionsIn() (pure, tested)
src/domain/validation.ts     plain-text post and comment schemas, reaction kinds
src/domain/services.ts       posts.create / remove, reactions.toggle, comments.add, follows.toggle, notifications.markRead
src/scenarios/generators.ts  eventStream() history, activityStream() + notificationFor(), the timeline
src/components/              VirtualFeed, PostCard, Composer, MediaPlaceholder, FollowButton
src/screens/                 Feed, Notifications, People, Profile (lazy routes)
tests/                       generators (determinism, integrity, 5k+ massive, windowing, timeline), services (real runtime)
```

## Docs

The agent spec is [AGENTS.md](AGENTS.md) and [docs/](docs/). Refresh it with
`pnpm protoyard spec social-feed --write`.
