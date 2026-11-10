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

- **Windowed feed:** Texuli's `VirtualListView` (from `@protoyard/ui`) in
  feed mode keeps only the visible posts (plus four above and below) in the
  DOM and sizes its own spacers.
  - Row heights are measured as posts render (text, an image or an open
    comment thread change them) and estimated at 180 px until then.
  - It follows the WAI-ARIA feed pattern: `role="feed"`, one `<article>` per
    post with `aria-setsize` / `aria-posinset`, a single tab stop among the
    posts, Page Up / Page Down between posts. Keys pressed in a post's own
    buttons and comment input stay theirs, and posts are never selected.
  - Each `<article>` is named by its post's author line (`aria-labelledby`),
    and the list has no box of its own (`surface="plain"`), so the feed runs
    edge to edge. Both lists share these props (`POST_FEED` in
    `src/lib/feed-list.ts`).
- **Layout:** the app is bound to the window height (`h-app`). The feed list
  is the scroll region and the document never scrolls, so the composer
  (`[data-py-composer]`) stays on screen at 390×844 (`pnpm visual:sweep` flags it when not).
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
src/domain/feed.ts           timeline(), byNewest(), mentionsIn() (pure)
src/domain/validation.ts     plain-text post and comment schemas, reaction kinds
src/domain/services.ts       posts.create / remove, reactions.toggle, comments.add, follows.toggle, notifications.markRead
src/scenarios/generators.ts  eventStream() history, activityStream() + notificationFor(), the timeline
src/components/              PostCard, Composer, MediaPlaceholder, FollowButton
src/screens/                 Feed, Notifications, People, Profile (lazy routes)
tests/                       none: tests/integration/templates.test.ts generates, validates and boots this template
```

## Docs

The agent spec is [AGENTS.md](AGENTS.md) and [docs/](docs/). Refresh it with
`pnpm protoyard spec social-feed --write`.
