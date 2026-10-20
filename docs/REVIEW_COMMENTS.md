# Review comments

Reviewers pin comments to a built prototype: they click a region, write a
note, and the thread stays anchored to that region (ADR-025). Review is
opt-in per prototype and loads lazily:

```json
"build": { "review": { "enabled": true, "adapter": "local" } }
```

The adapter decides where comments are stored and who sees them:

| Adapter | Where comments live | Who sees them |
| --- | --- | --- |
| `local` | IndexedDB in the reviewer's browser; Import and Export move them as a file | That browser only |
| `http` / `cloudflare` | A comments endpoint (`endpoint`, or `/api/comments` for `cloudflare`) | Everyone who can reach the endpoint |
| `artifact` | A Claude artifact's shared database | Everyone the artifact owner admits |

The toolbar names the active store, for example `artifact · shared · live`
or `local · this browser only · sync on refresh`. The package details are in
[packages/review/README.md](../packages/review/README.md) and
[packages/review-ui/README.md](../packages/review-ui/README.md).
`PROTOYARD_REVIEW_ADAPTER` (plus `PROTOYARD_REVIEW_ENDPOINT`) overrides the
adapter for one build
([packages/renderer-svelte/README.md](../packages/renderer-svelte/README.md)).

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

### Verified and not verified

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
