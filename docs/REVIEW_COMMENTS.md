# Review comments

Reviewers pin comments to a built prototype. They click a spot on a screen,
write a note, and the thread stays anchored to that element through layout
changes, device frames and shells (ADR-025). The team reads every thread in one
list, and `protoyard comments pull` turns them into a `REVIEW.md` an agent can
plan from.

Review is opt-in per prototype and loads lazily. A build without it contains
none of the review code.

> **Not authentication.** Reviewer names are self-declared. A review key only
> keeps casual visitors out: anyone who has the link (and the key, when one is
> set) can read, add, change and delete comments. See [Honest limits](#honest-limits).

## Turn review on

| Where | How |
| --- | --- |
| The prototype's manifest | `"build": { "review": { "enabled": true, "adapter": "local" } }` in `protoyard.json` |
| One build, without editing the manifest | `PROTOYARD_REVIEW=1 pnpm protoyard build <slug>` |
| One build with another backend | add `PROTOYARD_REVIEW_ADAPTER=local\|http\|cloudflare\|artifact` (and `PROTOYARD_REVIEW_ENDPOINT` for `http`), validated like the manifest field ([renderer README](../packages/renderer-svelte/README.md)) |
| A dev server or a DevTools build | open the prototype with `?comments=1`; DevTools then shows a **Comments** tab |
| A Cloudflare deploy with shared comments | `pnpm protoyard publish <slug> --provider cloudflare --comments [d1\|kv]` ([below](#shared-comments-on-cloudflare-pages)) |
| A Claude artifact | `adapter: "artifact"` and `export --target artifact --comments` ([below](#the-artifact-adapter)) |

```bash
PROTOYARD_REVIEW=1 pnpm protoyard build crm-demo     # review on, local adapter, no manifest edit
pnpm protoyard budget crm-demo                        # initial JS stays within budget
```

## Where comments live

The adapter decides where comments are stored and who sees them:

| Adapter | Where comments live | Who sees them | Use it for |
| --- | --- | --- | --- |
| `local` (default) | IndexedDB in the reviewer's browser (`protoyard.<namespace>.review`); Export and Import move them as a file | That browser only | A reviewer working alone, or a review handed over as a file |
| `cloudflare` | The comments Function of the same Pages deploy, on `/api/comments`, with a D1 or KV store | Everyone who can open the deploy | A team reviewing a Cloudflare deploy |
| `http` | Any endpoint with the comments REST shape (`endpoint`) | Everyone who can reach the endpoint | Your own server ([below](#your-own-endpoint-http)) |
| `artifact` | A Claude artifact's shared database | Everyone the artifact owner admits | A prototype shared as a private Claude artifact |

The toolbar names the active store, for example `local · this browser only · live`
or `http · shared · live`. Shared adapters show comments waiting to sync
when the network fails. They keep the text in the browser and retry, so
nothing typed is lost. The package details are in
[packages/review/README.md](../packages/review/README.md) and
[packages/review-ui/README.md](../packages/review-ui/README.md).

## Reviewer guide

### Leave a comment

1. Open the **Review** launcher, a small round button that names the thread
   count. It sits in a corner of the window where it covers no control of the
   app and not the "Prototype · simulated data" badge.
2. Choose **Comment**. The app stops reacting to clicks: a click now places a
   pin instead of pressing a button.
3. Click the spot you mean. The first time, the browser asks for the name
   shown on your comments. This is **not a login**: it is stored in this
   browser for this prototype. Then write the comment.
4. The pin appears on that element. Comment mode ends after each pin. Press
   **Escape** to leave it without commenting.

Pins follow their element when the window is resized, the phone is rotated or
the prototype is shown in a device frame (`?shell=phone`). A dashed pin may
be on the wrong element: the element it was placed on changed. Nearby pins
gather into a numbered button that expands on click. Resolved threads are
hidden until the comments list shows them.

### Keyboard

| Key | What it does |
| --- | --- |
| **C** | Enter or leave comment mode (outside text fields) |
| **Arrow keys** | Move the crosshair 16 px (**Shift** + arrows: 40 px) |
| **Enter** | Place the pin at the crosshair |
| **Shift+C** | Comment on the element that has keyboard focus |
| **Escape** | Leave comment mode, or collapse the toolbar |
| **Tab** | Reach pins: each one is a button named "Comment thread by <name>: <text>, N replies" |

### Threads and the comments list

- **A pin** opens its thread: the comments, a **Reply** box and, for the
  person who started it in this browser, **Resolve thread** or **Reopen
  thread**. Ownership comes from a random id kept in the browser, so it is a
  convenience, not a permission.
- **Comments** in the toolbar (or the **Comments** tab in DevTools) lists every
  thread. You can filter by state, screen, author and anchor (**Anchored** or
  **Orphaned**), and search.
  - Choosing a thread opens its screen and pulses its pin.
  - When the thread was written in another scenario, the list asks before
    switching, and it saves a safety snapshot first.
  - **Restore saved shell, theme and persona** reproduces the view the
    reviewer saw.
- **Orphaned** threads point to an element that no longer exists on that
  screen, for example after a scenario switch removed a row. They stay in the
  list, and they reappear on the screen when the element comes back.

### Move comments between browsers (local adapter)

With the `local` adapter, the expanded toolbar has **Export** (downloads
`<slug>-review-comments.json`) and **Import** (validates the file, merges it by
comment id and keeps the newer copy). Files are limited to 5 MB and must
match the prototype's namespace and slug. Shared adapters sync through their
endpoint, so these buttons do not appear there.

## The agent loop: comments → REVIEW.md → tasks

```bash
# From a local export file (the reviewer's Export) or from a deploy:
pnpm protoyard comments pull crm-demo --file path/to/crm-demo-review-comments.json --format md
PROTOYARD_REVIEW_KEY=<key> pnpm protoyard comments pull crm-demo --from https://<deploy>/api/comments --format md
pnpm protoyard comments export crm-demo     # back to the local adapter format (artifacts/review/exports/crm-demo.json)
pnpm protoyard comments import crm-demo artifacts/review/exports/crm-demo.json
```

`comments pull` writes two files and prints their paths:

| File | What |
| --- | --- |
| `prototypes/<slug>/docs/REVIEW.md` | The report: open threads first, grouped by screen. Each thread has the quoted comment, its replies, the route, the anchor locators, the element text, the captured context (scenario, persona, shell, theme, mode, viewport) and a deep link that reopens that view |
| `artifacts/review/comments/<slug>.json` | The validated comments (the cache that `export` reads) |

`--out <file>` also writes the chosen format (`md` or `json`) to another
workspace file. `--from` takes an absolute `http(s)` collection URL with no
credentials, query or fragment. It only reads (`GET`), times out after 10
seconds, refuses redirects and responses over 5 MB, and sends
`PROTOYARD_REVIEW_KEY` as `x-review-key` when it is set. The key never goes
on the command line or into a file. Every comment is validated before
anything is written, and comment text is escaped in `REVIEW.md`, so a comment
cannot inject Markdown or links into the report.

Then hand `REVIEW.md` to an agent and ask for a plan: one task per open
thread (or per screen), the deep link as the reproduction, the anchor and the
element text to find the code. The prompt is in
[AGENT_GUIDE](AGENT_GUIDE.md). Resolve the threads in the prototype once the
work ships, then pull again. Resolved threads move to their own section.

## Shared comments on Cloudflare Pages

`pnpm protoyard publish <slug> --provider cloudflare --comments [d1|kv]`
builds with the `http` adapter on the same-origin `/api/comments`. It ships
the comments handler as `dist/_worker.js` (under 20 KB raw), with a
`_routes.json` that sends only `/api/comments/*` to it.

### One-time setup (the developer runs it)

The CLI prints these steps and **never runs them**. They need your
Cloudflare account.

1. Dry run, which builds and prints the setup: `pnpm protoyard publish crm-demo --provider cloudflare --comments d1 --dry-run`.
2. Create the store:
   - **D1** (the default, strongly consistent): `npx --no-install wrangler d1 create protoyard-crm-demo-comments`, then `npx --no-install wrangler d1 execute protoyard-crm-demo-comments --remote --file packages/review/schema/d1.sql`.
   - **KV**: `npx --no-install wrangler kv namespace create protoyard-crm-demo-comments`.
3. Bind it to the Pages project as `REVIEW_DB` (D1) or `REVIEW_KV` (KV), for
   production and preview (dashboard → Settings → Bindings). Without the
   binding the worker answers `503 store_unconfigured`.
4. Optional: `npx --no-install wrangler pages secret put REVIEW_KEY --project-name protoyard-crm-demo`.
   Share the deploy link once as `https://…/?review=<key>`. The review UI
   moves the key into the browser's session storage, removes it from the
   address bar and sends it as `x-review-key`.
5. Deploy with the same command without `--dry-run`. Like every real publish,
   this needs your explicit go-ahead and your credentials.

`showcase --publish cloudflare --comments` puts one worker at the site root
for every demo. Details, the store table and the deploy ledger are in
[PUBLISHING.md](PUBLISHING.md#shared-review-comments-on-cloudflare-pages---comments).

## Your own endpoint (`http`)

Any server that implements `GET /api/comments/<slug>[?since=]`,
`GET /api/comments/<slug>/summary`, `PUT /api/comments/<slug>/<id>` and
`DELETE /api/comments/<slug>/<id>` works. The simplest way is to call
`handleCommentsRequest(request, env, store)` from `@protoyard/review/server`,
which uses Web APIs only, with `createD1CommentsStore`,
`createKvCommentsStore` or your own `CommentsStore`.
[tests/e2e/support/serve-comments.ts](../tests/e2e/support/serve-comments.ts)
is an 80-line Node example that serves a build and the API on one origin. It
uses an in-memory store and is for tests only.

```bash
PROTOYARD_REVIEW=1 PROTOYARD_REVIEW_ADAPTER=http PROTOYARD_REVIEW_ENDPOINT=/api/comments \
  pnpm protoyard build crm-demo --out tmp/crm-review
pnpm exec tsx tests/e2e/support/serve-comments.ts tmp/crm-review 4651
```

## The artifact adapter

Use it when the prototype is shared as a private Claude artifact
([PUBLISHING.md](PUBLISHING.md#sharing-as-a-claude-artifact)). Set the
adapter and pack with `--comments`:

```json
"build": { "review": { "enabled": true, "adapter": "artifact" } }
```

```bash
pnpm protoyard export relay-chat-demo --target artifact --comments --dry-run
```

`relay-chat-demo` ships this configuration. `--comments` declares the
capabilities the page asks for:

| Capability | Declared as | Used for |
| --- | --- | --- |
| `db` | `{ rules: [{ path: 'review', read: 'view', write: 'interact' }] }` | Shared threads under `review/<slug>/threads/<threadId>`, replies under `…/replies/<commentId>` |
| `user` | `{ scopes: ['profile'] }` | The author's opaque claude.ai id, and names resolved when shown |
| `comments` | `{ composer_only: true }` | A fallback that opens Claude's own comment composer |

`--comments` only declares them. A build whose adapter is `local` still
stores comments in each viewer's browser. Use
`PROTOYARD_REVIEW_ADAPTER=artifact` to switch one export without editing the
manifest.

### Which mode a viewer gets

When review mounts, the page asks the claude.ai viewer for the capabilities
(`claude.use`). The viewer answers `null` when a capability is not served or
not granted, and after about 10 seconds when no viewer answers. The adapter
then picks one of three modes:

1. **Shared**: `db` and `user` resolve. Threads are read from and written to
   the artifact's database, and they update live.
2. **Composer only**: `db` or `user` is missing, but the shell grants
   `comments`. Comment mode opens Claude's comment composer anchored to the
   clicked element, from that click only. Claude's comment panel shows and
   owns those threads, so Protoyard cannot list, sync or export them.
3. **Local**: neither is available, for example the same build opened
   outside claude.ai. Comments stay in that browser, as with the `local`
   adapter.

### Who can read and write

- **Read:** everyone admitted to the artifact (the `view` level) reads every
  shared thread. Shared comments are visible to all of them, unlike the
  prototype's own data, which stays in each viewer's browser.
- **Write:** Contributors and above (`interact`) can add, reply to, resolve and
  delete comments. For Viewers and Commenters, a write is refused with
  "This artifact viewer cannot write shared comments." Once the viewer
  reports that writes are not allowed, the visit stays read-only.
- **Identity:** authors are claude.ai accounts. Only ids are stored, and
  names are resolved each time they are shown. The prototype's own personas
  and roles are simulated and never security, and they do not decide who
  can comment.
- **Lifetime:** shared comments are kept across re-shares to the same URL
  and are erased when the owner deletes the artifact.

### Limits

- Errors keep their capability code. Full or exhausted storage
  (`quota_exceeded`, `resource_exhausted`) and revoked access can be retried
  from a new click. `revoked` asks the viewer to reopen the artifact.
- Writes to one document are serialized. Live updates cover at most 64
  collections per view (the thread list plus 63 reply lists). Replies in
  further threads appear on the next refresh.
- Import and Export are not shown, because shared threads sync through the
  artifact.
- Comments are plain text, like every adapter. Snapshots and comment data
  are untrusted input and are never rendered as HTML.

### Artifact: verified and not verified

The adapter passes the shared adapter conformance suite against a fake
capability surface (`pnpm vitest run packages/review/tests/artifact-adapter.test.ts packages/review/tests/artifact-shell.test.ts`).

One real private publish of `relay-chat-demo` with `--comments` was made on
2026-10-19. An ArtifactData list of `review/relay-chat-demo/threads`
returned an empty list as the owner and at `view` level.

Not verified yet:

- writing a real comment in the claude.ai viewer
- the composer-only mode in a real shell
- live updates between two viewers
- Commenter-level refusals

## Honest limits

- **Names are self-declared, and keys are shared.** Anyone can type any name.
  The review key is one shared secret: it keeps casual visitors and crawlers
  out, but everyone who has the link and the key can read, add, change and
  delete **every** comment of the deploy. The server does not check who wrote
  a comment. "Only the author resolves" is a rule of the review UI, based on
  a random id kept in the browser. It is not enforced by the server.
- **Comments are public to anyone with the link** (and the key, when set).
  Treat them like a shared document. Never put secrets or personal data in
  them.
- **Writes must come from the deploy's own origin.** This stops other websites
  from posting from a visitor's browser. A script can still send any
  `Origin`, so it is not access control.
- **Local comments are visible to the same origin.** The `local` adapter stores
  comments in IndexedDB under the page's origin, like prototype data. Another
  prototype served from the same origin (a showcase) can read them. Serve
  untrusted prototypes from separate origins.
- **Plain text only.**
  - Bodies are limited to 2,000 characters and names to 60. Control and bidi
    characters are refused.
  - Text is rendered as text, never as HTML.
  - Where a thread shows Markdown, links go through the shared safe parser,
    which allows only `http(s)`, `mailto` and relative URLs.
  - `REVIEW.md` escapes every comment.
- **Limits on the comments Function.**
  - Request bodies are capped at 16 KB.
  - Each client id may make 30 requests and each IP address 120 per 60
    seconds; beyond that the Function answers `429` with `Retry-After`.
  - The CLI reads at most 5 MB, and imported files are capped at 5 MB.
- **KV is eventually consistent.** With the KV store, a new comment can take a
  while to appear for other reviewers, concurrent edits can overwrite each
  other (last write wins), and rate limits are approximate. D1 is strongly
  consistent and is the default.
- **Live, but polled.** Shared adapters poll every 30 seconds while the page is
  open and on window focus. There is no push.
- **Not exercised against real services.** Cloudflare deploys, bindings and
  the D1/KV stores are not run by any test in this repository. Only dry runs,
  the worker bundle (size, routes, setup lines, a KV round trip through the
  bundled worker in Node) and the handler in Node are verified. Validate a
  real deploy yourself with your credentials, after a dry run.

## Measured sizes

Measured on 2026-10-19 (gzip -9, Vite production build of `crm-demo`):

| What | Size |
| --- | ---: |
| Initial JS, review off | 174.76 KB |
| Initial JS, `PROTOYARD_REVIEW=1` | 177.13 KB (+2.37 KB: the guarded mount, the toolbar placement and the review flag) |
| Lazy, loaded when review mounts: `mount` + session (toolbar, overlay, thread) + local adapter + anchors + comment schemas | 1.5 + 8.3 + 1.3 + 2.3 + 1.3 = 14.7 KB, plus 1.4 KB CSS |
| Lazy, on first open: comments panel | 3.5 KB, plus 1.1 KB CSS |
| Lazy, by adapter: `http` / `artifact-shell` | 2.4 KB / 2.6 KB |
| Cloudflare `_worker.js` (raw, minified) | 14,443 bytes with D1, 13,981 bytes with KV (limit 20 KB) |

## Tests

| What | Command |
| --- | --- |
| Engine and UI (anchors, adapters and their conformance suite, server handler and validator parity, overlay, toolbar, panel, thread, session) | `pnpm vitest run packages/review packages/review-ui` |
| CLI `comments` and `publish --comments` (worker bundle, routes, setup lines, KV round trip) | `pnpm vitest run packages/cli/tests/comments-command.test.ts packages/cli/tests/publish-comments.test.ts` |
| Renderer wiring (review before DevTools, Comments tab, placement, build-time adapter) | `pnpm vitest run packages/renderer-svelte/tests/review-wiring.test.ts packages/renderer-svelte/tests/floating.test.ts packages/renderer-svelte/tests/review-flag.test.ts` |
| Browser E2E on `PROTOYARD_REVIEW=1` builds, including two reviewers on a local comments server | `PROTOYARD_E2E_COMMENTS_PROTOTYPES=crm-demo,mobile-banking-demo pnpm test:e2e tests/e2e/review-comments.spec.ts` ([tests/e2e/README.md](../tests/e2e/README.md#review-comments)) |

