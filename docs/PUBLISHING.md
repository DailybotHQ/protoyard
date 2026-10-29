# Publishing

A prototype builds into a plain static site: HTML, JS and CSS, with no server,
credentials or network calls at runtime. This page covers building,
exporting, previewing and putting it on a host. Design decisions: ADR-009
(hash routing) and ADR-014 (publishing adapters) in
[DECISIONS.md](DECISIONS.md).

## Agent-assisted ship flow

The distributable [`protoyard-ship` skill](../skills/protoyard/ship/SKILL.md)
wraps this CLI contract with a reviewable sequence: verify with
`validate --build`, export or artifact-dry-run, then run
`publish --provider <p> --dry-run`. The CLI itself does not prompt before a
preview upload, so the skill requires the developer's explicit approval of
the provider, project, target and exact command before it runs a live publish.
Production still requires the CLI's `--yes` guard. npm publication is a
separate consent checkpoint and is never run as part of prototype export.

## The commands

| Command | Does | Contacts a provider |
| --- | --- | --- |
| `pnpm protoyard build <slug>` | Production build → `artifacts/<slug>/dist` + `build-manifest.json` | No |
| `pnpm protoyard export <slug>` | Build, isolation check, ZIP → `artifacts/<slug>/<slug>.zip` | No |
| `pnpm protoyard export <slug> --target artifact [--dry-run]` | Build for a Claude artifact, isolation check, pack → `artifacts/<slug>/artifact/` | No |
| `pnpm protoyard artifact record <slug> --url <url>` · `artifact list` | Record and list the Claude artifact URLs the Artifact tool returned ([sharing](#sharing-as-a-claude-artifact)) | No |
| `pnpm protoyard preview <slug>` | Serves `artifacts/<slug>/dist` like a static host | No |
| `pnpm protoyard publish <slug> --provider static` | Build, isolation check, ZIP, upload instructions | No |
| `pnpm protoyard publish <slug> --provider <p> --dry-run` | Build, verify, print the exact deploy command | No |
| `pnpm protoyard publish <slug> --provider <p>` | Build, verify, **deploy a preview immediately** (no prompt), print the provider's URL | Yes |
| `pnpm protoyard publish <slug> <slug>… \| --all \| --tag <tag> --provider <p> [--dry-run]` | The same for several prototypes, one after another, with one summary | Only without `--dry-run` |
| `pnpm protoyard publish --history [<slug>…] [--provider <p>] [--limit <n>]` | Print the last recorded publishes from the local ledger | No |
| `pnpm protoyard review-index [--from-ledger \| --slugs a,b]` | One static page linking every real deployment, with scenario and persona links | No |
| `pnpm protoyard review-index --publish <p> [--project <name>] --dry-run` | Generates the review page and prints the provider command for that directory | No |
| `pnpm protoyard review-index --publish <p> [--project <name>]` | Generates and deploys the review page through the provider adapter | Yes |

`pnpm protoyard build --all` builds every prototype one after another (for CI
smoke runs).

Options shared by `build`, `export` and `publish`:

| Option | Effect |
| --- | --- |
| `--base <path>` | Public base: `./` (default) or an absolute `/sub/path/` |
| `--include-devtools` | Ship the DevTools panel in this build |
| `--out <dir>` (`build` only) | Custom output folder. Refused if it is, or contains, a source folder (the workspace root, `prototypes/`, `templates/`, `packages/`, `apps/`, `node_modules/`, `.git/`). |
| `--skip-build` (`export` only) | Zip the existing build, after checking every file still matches `build-manifest.json` |

## Artifacts

```text
artifacts/<slug>/
├── dist/                  the static site (served as is)
│   ├── index.html
│   ├── favicon.svg        files from the prototype's public/
│   └── assets/            hashed JS and CSS chunks
├── build-manifest.json    what was built, from what, with checksums
└── <slug>.zip             export / publish --provider static
```

`artifacts/` is git-ignored. After every build the CLI checks that
`index.html` exists, that every local file it references was emitted and that
it loads a JavaScript entry.

### `build-manifest.json`

From a real `crm-demo` build (the `files` list is shortened):

```json
{
  "format": "protoyard.build",
  "formatVersion": 1,
  "slug": "crm-demo",
  "id": "example.crm",
  "version": "0.1.0",
  "builtAt": "2026-10-17T07:19:50.428Z",
  "base": "./",
  "includeDevtools": false,
  "outDir": "artifacts/crm-demo/dist",
  "fileCount": 6,
  "totalBytes": 1212035,
  "files": [
    { "path": "assets/dist-yVFZAMG4.js", "size": 415859, "sha256": "f9018f92…" }
  ],
  "generator": { "name": "@protoyard/cli", "version": "1.0.0" },
  "sdk": { "core": "1.0.0", "runtime": "1.0.0", "rendererSvelte": "1.0.0", "vite": "8.3.4" },
  "node": "26.11.1"
}
```

| Field | Meaning |
| --- | --- |
| `slug`, `id`, `version` | From `protoyard.json` |
| `builtAt` | Build time (metadata only, never used for seeded data) |
| `base`, `includeDevtools` | The settings this build used |
| `outDir` | Workspace-relative when inside the workspace, absolute otherwise |
| `target` | `"artifact"` for the single-chunk Claude artifact build (`export --target artifact`); absent for a plain build |
| `fileCount`, `totalBytes`, `files[]` | Every emitted file with size and SHA-256 |
| `generator`, `sdk`, `node` | CLI, package, Vite and Node versions that produced it |
| `bundle` | gzip (level 9) bytes: `initialJsGzip` (entry chunks and their static imports), `lazyJsGzip` (chunks loaded through `import()`, such as Faker), `cssGzip`, `totalGzip` (every file), and `chunks[]` (`file`, `kind`: `initial`, `lazy` or `css`, `gzip`). Computed from Vite's chunk manifest, which is then deleted from `dist`. Absent when the prototype's `vite.config.ts` does not use `defineProtoyardConfig`. `build` prints the same figures. |

## Base paths

| Base | Output | Use when |
| --- | --- | --- |
| `./` (default) | Relative URLs (`./assets/index-….js`) | Almost always. The same files work at `/`, `/demos/crm/` or any folder of any host. |
| `/sub/path/` | Absolute URLs (`/protoyard/crm-demo/assets/…`) | A host that requires absolute paths. The site then only works at that exact path. |

The default comes from `build.base` in `protoyard.json` (`./`). A value
without a leading `/`, with `..`, spaces, `?` or `#` is rejected:

```text
$ pnpm protoyard build crm-demo --base sub/
✗ Invalid --base "sub/".
  Use "./" for relocatable output or an absolute path such as "/protoyard/crm-demo/".
```

A missing trailing slash is added (`/protoyard/crm-demo` →
`/protoyard/crm-demo/`). `preview` reads the base from the build manifest and
serves the site at that path.

## Hash routing: no rewrites needed

Prototype routes live after the `#` (`#/deals/42`). The server only ever
serves `index.html` and the assets, so refresh, back, forward and deep links
work on every static host, including a ZIP unpacked into a sub-folder. You do
not need redirect or rewrite rules.

Claude artifact links can use the hash for a validated app scenario because
the artifact URL retains its fragment but not a query string. Use
`#scenario--persona--theme`; omit the trailing fields when they are not
needed. A theme may also be supplied without a persona as
`#scenario--theme`. At boot, the renderer accepts only scenario, persona and
theme ids present in the prototype, turns them into the existing
`?scenario=…&actor=…&theme=…` inputs, and clears the consumed hash before the
app router starts. Unknown persona or theme ids are ignored. Unknown
scenarios and ordinary route hashes (including deck slide hashes) are left
untouched. Existing query options such as `?devtools=0` remain in effect.

## What a build includes

| Item | Default | Change it |
| --- | --- | --- |
| DevTools panel | **Excluded.** The code is removed from the bundle, not just hidden. | `--include-devtools`, or `"build": { "includeDevtools": true }` in `protoyard.json` |
| "Prototype · simulated data" badge | **Shown** (below the frame, or in a corner free of controls when full-bleed, else a small info dot in a free gap; its tooltip says data is simulated and stored only in this browser) | `"build": { "demoBadge": false }` in `protoyard.json` |
| Device or host frame inside an iframe | **Off**: an embedded page renders full-bleed | `"build": { "frameWhenEmbedded": true }` keeps an explicit (non-`auto`) shell frame when the page is embedded, for example as a Claude artifact ([SHELLS.md](SHELLS.md#when-the-app-goes-full-bleed)) |
| Faker | In a separate chunk, downloaded only when a world is generated (first visit, scenario load) | |
| Your scenarios and generator | Included, so the first visit can seed the default scenario | |
| Avatar images | **Included**: the 175 fictional people of `@protoyard/avatars` at 64 and 128 px under `avatars/` (350 files, 513,196 B, fixed names, no JavaScript) | `defineProtoyardConfig({ root, avatars: false })` in `vite.config.ts` ([renderer README](../packages/renderer-svelte/README.md#avatars)) |

With DevTools included, visitors can still hide them with `?devtools=0`
(presentation mode). Without them, no URL parameter can bring them back.

Visitors' data lives in their own browser (IndexedDB). Where storage is blocked (some private windows, previews, blocked site data), the prototype runs from memory and shows a "Changes won't be saved" banner; it never claims data was saved. Nothing is shared
between visitors, and nothing reaches you. See
[DATABASE.md](DATABASE.md#persistence-caveats).

## The isolation check

`export` and `publish` scan every text asset of the build for another
registered prototype's manifest (its `id`, or its `namespace` as a property)
or its database name (`protoyard.<namespace>.data`). Any match fails the
command with exit code `4`:

```text
✗ The crm-demo bundle contains code from other prototypes.
  <file> references <other-slug> (<other-id>)
```

This catches a prototype importing another prototype's code. On success:

```text
  Isolation: no references to the other 6 registered projects.
```

`build` alone does not run this check.

## Export and the ZIP

```bash
pnpm protoyard export crm-demo
```

```text
✓ Exported crm-demo
  artifacts/crm-demo/crm-demo.zip  385 KB  (6 files)
  sha256 8f371b169525f673624051c6f6ee7d034a3c0ffb3910089df122cf005e458153
  Isolation: no references to the other 6 registered projects.
  Relocatable (base ./): unzip into any folder of any static host.
```

The ZIP contains the contents of `dist/` (no wrapping folder). To use it:

- **Serve it over HTTP.** Opening `index.html` from disk (`file://`) does not
  work: the app loads as a JavaScript module (`<script type="module">`), and
  browsers block module scripts on `file://`. Any static server works, for
  example `python3 -m http.server 8080` inside the unzipped folder.
- **Upload the contents, not the ZIP**, to the host.
- A build with a custom `--base` must be served from that path.

## One file from a quick exploration

A quick exploration (level 1, [PLAYER](PLAYER.md)) can travel as **one HTML file**
that opens by double-clicking, from `file://`, with no server, no install and no
network:

```bash
pnpm protoyard quick serve my-idea                  # optional: try it over http first
pnpm protoyard quick export my-idea --single-file   # → .protoyard/quick/my-idea/my-idea.html
pnpm protoyard quick export my-idea --single-file --out tmp/share/my-idea.html --force
```

**What's in the file** (`packages/cli/src/lib/quick/single-file.ts`):
- the exploration's own built player: the JavaScript chunks and stylesheets
  its player page can reach, through static and dynamic imports and Vite's
  preload lists ([`chunk-graph.ts`](../packages/cli/src/lib/quick/chunk-graph.ts)).
  An app starts from `index.html`. A deck, page or doc starts from
  `deck.html`, `page.html` or `doc.html`, so it carries no app boot, CRUD
  shell or app kits. It also leaves out Faker: the kind runtime never
  generates a world, so it never loads it. A player built before those pages
  existed falls back to `index.html`;
- the blueprint, as an inert `<script type="application/json"
  id="protoyard-blueprint">` with `<` escaped, so it can never close the
  element. The player reads it as an untrusted source, like a `#bp=` link.

**How it loads without a server:** browsers don't load module chunks from
`file://`, so each of the player's chunks is embedded as text. A small bootstrap
turns them into `blob:` modules behind an import map, with every relative chunk
import rewritten to a bare `py:assets/…` specifier. The stylesheets are inlined
up front.

**Policy:** the file carries its own Content-Security-Policy:
- `connect-src 'none'`, so the page can't reach the network;
- `script-src 'unsafe-inline' blob:`, because the import map and blob URLs are
  created at runtime;
- no service worker; the export refuses a page that would register one.

**Measured on 2026-10-20** over the 40 catalog blueprints: 3,245,592–3,246,497
bytes, about 1.05 MB gzip. The player dominates, and the blueprint adds a few KB.
On npm Texuli 0.5.0, the 40 catalog blueprints measured at a maximum of
4,284,417 bytes (the 0.4.0 maximum was 4,207,769 bytes). The export refuses
files over `QUICK_SINGLE_FILE_BUDGET_BYTES` (4,418,158 bytes); the existing
cap is lower than the 0.5.0 maximum plus 5% and is retained.

**Content kinds (measured 2026-10-22).** The catalog deck (Lumen launch), page
and doc export at 1,606,788–1,607,557 bytes, against 3,051,751 bytes for the
CRM app from the same player build.
- **Budget:** on npm Texuli 0.5.0, the catalog deck, page and doc measured
  2,681,755–2,689,852 bytes (the 0.4.0 range was 2,656,649–2,684,123 B).
  `QUICK_SINGLE_FILE_ENTRY_BUDGET_BYTES` remains 2,818,330 bytes (about
  2.69 MiB), already lower than the current maximum plus 5%.
- **Not met:** the proposed 1.5 MiB deck budget. DevTools (with Deck Studio
  and the theme browser), review comments, device shells and the chart blocks
  are all reachable from a kind page, and they ship with it.
- **Tests:** `packages/cli/tests/quick/single-file-kinds.test.ts`.
  - It fails if a CRUD, Faker or analytics chunk, or the app boot, appears in
    a deck, page or doc file.
  - It checks that an app file still carries every lazy CRUD screen.
  - It opens a deck file from `file://` in Chromium, where it changes slides
    with no network request.
`packages/cli/tests/quick-single-file.test.ts` checks every catalog blueprint
against that budget. It also opens an export from `file://` in Chromium: the
blueprint boots, a lazy screen renders, and a reload reuses the IndexedDB world.

**Limits:**
- **Generation thread:** worlds generate on the main thread. The generation
  worker can't start from a `blob:` base, so the player falls back as it does
  whenever Workers are unavailable.
- **Avatars:** avatar images aren't embedded; people show initials.
- **Storage:** browsers keep `file://` storage per browser profile, and some
  clear it more readily than a site's.
- **Not a security boundary:** the file is the prototype, data and all. Anyone
  who receives it can open and change it.

## Sharing as a Claude artifact

A prototype can be shared as a private Claude artifact, a page hosted on
claude.ai, with no hosting account (ADR-026). The CLI prepares, checks and records the share.
It never publishes, because only an agent with the Claude Artifact tool can.
The repository skill `share-as-artifact` (`/share-artifact <slug>`) does
that step, and only after the developer approves it.

| Command | Does |
| --- | --- |
| `pnpm protoyard export <slug> --target artifact [--comments] [--no-devtools] [--dry-run] [--json]` | Artifact build, isolation check, every Artifact rule, pack → `artifacts/<slug>/artifact/` |
| `pnpm protoyard artifact record <slug> --url <url>` | Records the URL the Artifact tool returned, after checking the pack is current |
| `pnpm protoyard artifact list [--json]` | The latest recorded share per prototype |
| `pnpm protoyard review-index --from-ledger` | The review page, with recorded shares labeled private |
| `pnpm protoyard showcase --target artifact [--slugs a,b] [--no-templates]` | The gallery plus selected demos as one pack → `artifacts/showcase/artifact/` |
| `pnpm protoyard quick export <slug> --target artifact [--url <url>]` | A quick exploration as one artifact page → `<exploration>/artifact/`, recorded in its `quick.json` ([below](#a-quick-exploration-as-an-artifact)) |

### Who sees what

Say this plainly whenever you share:

- **Private by default.** A new artifact is visible only to its owner and
  to the people the owner shares it with in claude.ai. The share ledger
  records `private` at record time. Later changes to the sharing settings
  happen in claude.ai, and the ledger does not see them.
- **Each viewer has their own data.** The prototype's database (IndexedDB),
  its appearance settings, scenarios and personas live in each viewer's own
  browser. Nothing a viewer does in the app reaches other viewers or the
  owner. That storage can be empty, blocked or wiped in previews and
  private windows. The app then shows its storage error state, never fake
  success.
- **Shared comments are the one exception.** With `--comments` and the
  `artifact` review adapter, comment threads live in the artifact's shared
  database (the `db` capability). Everyone admitted to the artifact can read
  them. Contributors and above can write them, and Viewers and Commenters
  cannot. They are erased when the owner deletes the artifact.
- **Identity comes from claude.ai.** Comment authors are claude.ai accounts,
  stored as opaque ids and resolved to names when shown. Roles, personas and
  sign-in *inside* the prototype are still simulated and are never security.

### The pack

`export <slug> --target artifact` builds a separate copy in
`artifacts/<slug>/artifact-dist/` (manifest `artifact-build.json`), so the
plain build in `dist/` is untouched:

- DevTools are included, so viewers can switch scenarios and personas in
  the page. `--no-devtools` leaves them out.
- `build.frameWhenEmbedded` is on, so an explicit shell (phone, tablet,
  browser, widget) keeps its frame inside the artifact viewer
  ([SHELLS.md](SHELLS.md#when-the-app-goes-full-bleed)).
- It builds **one script chunk and one stylesheet**. The CLI sets
  `PROTOYARD_TARGET=artifact` for this build, and always sets it to empty for
  every other build, so a value inherited from the shell never changes a plain
  build. The shared renderer config (`defineProtoyardConfig`) then puts every
  module into a single chunk group (Rolldown `codeSplitting.groups`) and turns
  off CSS code splitting. Images, fonts and avatars stay files.
  - **Why:** lazy screens and kits would otherwise each be a file that counts
    against the 511-file version cap.
  - **Why a group:** unlike `codeSplitting: false`, it keeps tree-shaking of
    dynamic imports. With `false`, the relay-chat-demo script grew from
    1.27 MB to 3.24 MB raw (every Faker locale stayed in).
  - **Cost:** the page downloads all of its code at open. For relay-chat-demo,
    measured 2026-10-22, the single script is 411,835 B gzip and the
    stylesheet 20,047 B. A plain build with DevTools has 163,489 B gzip of
    initial JS plus 269,599 B lazy, across 38 files.
  - **Recorded:** `artifact-build.json` stores `"target": "artifact"`.
    `--skip-build` refuses a build without it, such as one made before this
    change.
  - **Your own config:** a `vite.config.ts` that is not built on
    `defineProtoyardConfig` can read `process.env.PROTOYARD_TARGET` itself.
    The single chunk group needs the page's single HTML entry.
  - **No top-level await on a lazy import:** inside one chunk, a dynamic
    import resolves back into the chunk that is still evaluating. A module
    that awaits one at its top level never finishes, and the page stays blank
    with nothing in the console. Generated decks, pages and docs therefore
    parse their blueprint synchronously
    (`@protoyard/blueprint/kinds/parse`), not with
    `await parseAnyBlueprint(…)`.
- It always uses the relative base `./`. `--base` with another path,
  `--offline` and `"build": { "offline": true }` are refused (exit 2 and 4).
- Avatar images ship at 128 px only (175 files, 356,386 B), and 64 px
  requests resolve to 128 px. Both sizes would be 350 files. That would take
  `relay-chat-demo` from one publish batch to two and put `ui-kit` (180 app
  files) at 531 files, over the 511-file version cap.

It then runs the isolation check and the pack step
(`packages/cli/src/lib/artifact-pack.ts`), which writes
`artifacts/<slug>/artifact/`:

| File | Content |
| --- | --- |
| `page.html` | The page as body content: the Artifact tool adds its own document skeleton |
| `assets/…` and the other build files | Every file at the path the page references |
| `artifact-manifest.json` | Sizes, sha256 and content types, publish batches, the build sha256, the icon and description, declared capabilities, warnings |

```text
$ pnpm protoyard export relay-chat-demo --target artifact --dry-run
✓ Checked relay-chat-demo as a Claude artifact (dry run, nothing written)
  page    artifacts/relay-chat-demo/artifact/page.html
  files   179 + the page, 1.8 MB in 1 publish batch
  sha256  d9398bd9acfd603b0087940877e6960b707c7b91af1bfdbb5112e11509c06fbe (build)
  build   DevTools included, explicit shells keep their frame when embedded, one script chunk
  Isolation: no references to the other 81 registered projects.
  Publish it with the share-as-artifact skill (--json lists the exact Artifact tool arguments). Artifacts are private until you share them.
```

**Rules and limits.** Every Artifact rule is checked, and the export fails
with exit 4 and lists each reason:

- external scripts outside the allowed CDNs, and stylesheets other than
  Google Fonts
- network fetches and imports, and service workers
- non-web file types (source maps are refused). Accepted binary fonts are
  `.woff`, `.woff2`, `.ttf` and `.otf` (`font/woff`, `font/woff2`, `font/ttf`,
  `font/otf`); extensions are matched case-insensitively
- the 16 MB page and text-file limit and the 15 MB binary limit
- 255 files and 64 MB per publish, and 511 files and 256 MB per version
- a missing `<title>`. A title longer than four words is a warning.
- the replacement character U+FFFD in a text file. The Artifact tool refuses
  it, because it usually marks a broken decode, but bundled libraries can
  hold it on purpose (a `CSS.escape` polyfill returns it for NUL). So the
  pack writes it as an escape that means the same character: `\uFFFD` in
  JS and JSON, `\fffd ` in CSS. Sizes and sha256 in `artifact-manifest.json`
  describe the packed file, and the build itself is never changed. In the
  other text files the pack copies (SVG, plain text…) the character fails
  the export (`escapeReplacementCharacters` in `artifact-pack.ts`).

`--dry-run` builds and checks everything without writing the pack.
`--skip-build` reuses the last artifact build when it was made with the same
settings. `--json` adds the manifest and the exact Artifact tool arguments
per batch (`file_path`, `files`, `icon`, `description`, `capabilities`). A
pack over 255 files is split into batches that the skill publishes, one
after another, to the same URL.

Measured on 2026-10-19:

- `relay-chat-demo` packs into 219 files plus the page, 1,730,943 B, in
  one batch. Its manifest enables review comments, so the pack includes the
  lazy review chunks.
- `keel-projects-demo` with `--comments` is 316 files plus the page,
  2.2 MB, in two batches.
- The relay artifact build, measured earlier the same day, loaded
  158,065 B gzip of initial JS (DevTools stay lazy), against 152.75 KB for
  the plain build.
- `ui-kit` (dry run) is 355 files plus the page, in two batches.

### Review comments in an artifact

`--comments` declares the runtime capabilities that shared comments need,
and it needs `"build": { "review": { "enabled": true } }`. Without that, it
fails with exit 4:

```text
$ pnpm protoyard export crm-demo --target artifact --comments --dry-run
✗ --comments needs review comments enabled for crm-demo.
  Set "build": { "review": { "enabled": true } } in its protoyard.json (docs/REVIEW_COMMENTS.md).
```

The declared capabilities are `db` (one rule: `review/` is readable at
`view` and writable at `interact`, which is Contributor), `user` with the
`profile` scope (author ids and names), and `comments` with
`composer_only: true`.

The capabilities are used only when the build's review adapter is
`artifact`. `relay-chat-demo` sets
`"review": { "enabled": true, "adapter": "artifact" }`. A prototype whose
manifest says `local` (for example `keel-projects-demo`) still declares the
capabilities with `--comments`, but its page keeps comments in each
viewer's browser. To switch one build without editing the manifest, set the
adapter for that export:

```bash
PROTOYARD_REVIEW_ADAPTER=artifact pnpm protoyard export keel-projects-demo --target artifact --comments --dry-run
```

How the adapter behaves in the viewer, the composer fallback and its limits
are in [REVIEW_COMMENTS.md](REVIEW_COMMENTS.md#the-artifact-adapter).

### Share and re-share with the skill

`/share-artifact <slug> [--comments] [--no-devtools] [--dry-run]` runs the
`share-as-artifact` skill ([SKILL.md](../.agents/skills/share-as-artifact/SKILL.md)):

1. `--dry-run` runs only the dry-run export and stops. Nothing is written,
   published or recorded.
2. Otherwise it runs `export <slug> --target artifact --json` and stops on
   any failure.
3. It reads `page.html` and every file in the manifest in full. A file it
   cannot read stops the share.
4. It checks `artifact list --json` for an existing URL, shows the summary,
   and **waits for the developer's explicit approval**. Sharing is an
   outward-facing publish.
5. It publishes each batch with the exact arguments from the export JSON.
   On a **re-share** it first reads the recorded URL, then publishes to that
   same URL, so the link does not change.
6. It runs `artifact record` with the URL the Artifact tool returned, never
   a guessed or edited one.
7. With `--comments`, it lists the thread roots once with ArtifactData
   (`review/<slug>/threads`) and reports exactly what that checked. It
   writes no test comments.

Never paste a private artifact URL into tracked files.

### The share ledger

`artifact record` appends one line to `artifacts/share/ledger.jsonl`
(git-ignored, local to your checkout). The line goes through the same
single-append writer and credential-key refusal as the deploy ledger.

```text
$ pnpm protoyard artifact record relay-chat-demo --url https://claude.ai/artifact/<id>
✓ Recorded relay-chat-demo artifact share.
  url         https://claude.ai/artifact/<id>
  visibility  private at record time
  build       fa92f4aa2e75a0cd0a33cd52e6b702ed8ccad9ac17b070886f470fcad62f2321 (219 files)
  ledger      artifacts/share/ledger.jsonl
```

It refuses:

- a URL that is not `https://claude.ai/artifact/<id>` or
  `https://claude.ai/code/artifact/<id>`
- a slug without a pack
- a pack whose files no longer match their manifest. One edited file gives
  `Packed file assets/… no longer matches the artifact manifest.`, exit 4.

The CLI checks the URL's shape, but it cannot prove that the Artifact tool
returned the URL. Recording only returned URLs is the skill's job.

| Field | Meaning |
| --- | --- |
| `format`, `formatVersion` | `protoyard.share-ledger`, `1` |
| `at`, `slug`, `kind` | When it was recorded, which prototype, `artifact` |
| `url`, `visibility` | The returned URL, and `private` at record time |
| `buildSha256`, `fileCount` | The source build digest from the pack manifest, and the packed file count |
| `commit`, `dirty` | The workspace commit and whether tracked files had changes |
| `capabilities` | The declared capability names (`comments`, `db`, `user` with `--comments`) |

A re-share appends a new line. `artifact list` shows the latest line per
prototype (`No artifact shares recorded.` when there are none), and
`--json` returns `{ entries, total, ledger, skipped }`. Unreadable lines are
skipped and counted.

### In the review index

`review-index` also reads the share ledger. A recorded share appears as
**Shared as artifact (private by default)**, with a note that the link opens
only for people the owner shared it with. The review manifest has it as
`artifactShare: { url, visibility }`. `--from-ledger` includes prototypes
that have a real deploy or a recorded share. Only recorded URLs are linked,
never guessed ones.

### The showcase as one artifact

`showcase --target artifact` builds the gallery with the selected demos
embedded, and packs it under `artifacts/showcase/artifact/`. It requires the
base `./`. `--slugs` limits the bundled prototypes and templates, which
keeps the pack within the caps.

```text
$ pnpm protoyard showcase --target artifact --slugs relay-chat-demo,support-widget-demo --no-templates
✓ support-widget-demo          ./p/support-widget-demo/app/ · 1.3 MB
✓ relay-chat-demo              ./p/relay-chat-demo/app/ · 1.3 MB
✓ Showcase → artifacts/showcase (977 files, 8.8 MB, base ./, DevTools included)
✓ Artifact pack → artifacts/showcase/artifact (488 files, 2 publish batches)
```

Measured on 2026-10-19: 487 files plus the page, 4,514,818 B, in two batches
(254 and 233 files).

**One prototype per artifact is the normal path.** An artifact version holds
at most 511 files, and the full showcase site is far larger (1,762 files
measured on 2026-10-19 with 26 demos), so the whole showcase can never be
one artifact. A showcase pack only fits with a short `--slugs` list and
`--no-templates`, and the pack check refuses it (exit 4) when it does not.
To share many prototypes, share each one as its own artifact
(`/share-artifact <slug>`) and list them with `review-index --from-ledger`,
or host the full showcase on a static host (below). The skill takes a prototype slug, so a showcase pack
has no skill path yet. An agent publishes it by following its manifest
batches with the same read-every-file and approval steps.

### A quick exploration as an artifact

A quick exploration (not a registered prototype) packs as **one page**, the
[single file](#one-file-from-a-quick-exploration) turned into Artifact page
content (`packages/cli/src/lib/quick/artifact.ts`):

```bash
pnpm protoyard quick export my-idea --target artifact --json      # pack: page + publish arguments
# … the developer approves; an agent publishes page.html with the Artifact tool …
pnpm protoyard quick export my-idea --target artifact --url https://claude.ai/artifact/<id>
```

**What it writes** in `<exploration>/artifact/` (replaced on every pack):
- `page.html`, body content: `<title>` first, the page contract's light and
  dark color tokens, then the single file's head scripts and styles and its
  body. The Artifact tool adds the document skeleton (doctype, charset,
  viewport), so those wrappers and metas are dropped.
- `artifact-manifest.json` (`protoyard.quick-artifact`, version 1): the
  page's bytes and sha256, the blueprint hash, the player version, and the
  publish arguments.

**Publish arguments** in the envelope's `publish` (the `--json` output):
- `file_path`, the absolute page path. There are no supporting `files`, since
  the player is already inline.
- `title`, the blueprint name cut to at most four words.
- `icon`, from the blueprint category (`app` when there is none).
- `description`, the blueprint description's first sentence, or a sentence
  that labels the data simulated (at most 1,000 characters).

**Checked before writing** (nothing is written when one fails, exit 4):
- every `ARTIFACT_LIMITS` cap (one page, at most 16,000,000 bytes);
- no network markup or network imports;
- no service worker;
- no U+FFFD. Inside script and style bodies it is escaped to the same
  character, as the prototype pack does for JS and CSS; elsewhere it is
  refused.

**Recording, never publishing.** The CLI never publishes. Sharing is an
outward-facing step that needs the developer's approval, then the Artifact
tool. `--url` then records the returned URL in the exploration's own
`quick.json` `shares`:
- each share is `{ kind: "artifact", url, visibility: "private", variant: null,
  sha256, at }`;
- it is never written to the prototype share ledger, which is keyed by
  registry slugs;
- it refuses a URL that is not a claude.ai artifact link (exit 2), a missing
  pack (exit 3), and a page or blueprint that no longer matches the pack
  (exit 4).

Like `artifact record`, the CLI checks the URL's shape but cannot prove the
Artifact tool returned it.

**Who sees what** is as [above](#who-sees-what): private by default, and each
viewer's data stays in their own browser.

**Measured on 2026-10-20** with the four `blueprints/quick/*.json` examples:
- each page passes every rule, at 3,243,656–3,244,614 bytes, far under the
  16,000,000-byte text-file cap;
- the analytics page, wrapped in a minimal skeleton (doctype, charset,
  viewport) and served over http, boots to `protoyard:ready` in headless
  Chromium (`packages/cli/tests/quick-artifact.test.ts`).

**Limits:**
- **No CSP meta.** The single file's own CSP meta can't travel: a CSP meta
  outside `<head>` is ignored, so the claude.ai viewer's own policy applies.
- **Preload lookups to a reserved host.** Without that CSP, Vite's preload
  helper requests `https://protoyard-single-file.invalid/…` names for
  stylesheets that are already inlined. The host is reserved and never
  resolves, so the requests fail harmlessly.
- **Base exploration only.** The pack covers the base exploration, not a
  variant (`variant: null`).
- **Not verified on claude.ai.** Boot inside the claude.ai viewer has not been
  checked; that needs a consented publish.

### Verified and not verified

Verified once, on 2026-10-19:

- `relay-chat-demo` was published as a private artifact with `--comments`
  and recorded in the ledger.
- An ArtifactData list of `review/relay-chat-demo/threads` returned an empty
  list as the owner and at `view` level.

Verified locally in the artifact viewer harness (no upload):
[`tests/e2e/artifact-pack.spec.ts`](../tests/e2e/artifact-pack.spec.ts)
packs relay-chat-demo, and
[`tests/e2e/deck-artifact.spec.ts`](../tests/e2e/deck-artifact.spec.ts) packs
the `create-anything-deck` deck. The harness
([`tests/e2e/support/artifact-harness.ts`](../tests/e2e/support/artifact-harness.ts))
wraps `page.html` in a document skeleton inside an iframe, as the viewer does.
For the deck, the spec checks the following, on desktop and phone viewports:

- the first slide renders;
- arrow keys and `#/<slide>/<step>` links navigate, including opening
  straight on a deep link;
- the only script fetched is the entry that `page.html` loads. Any other
  script must be a re-export facade of it, and a split chunk with code of its
  own fails the test;
- without `window.claude`, the clipboard or IndexedDB, the deck still runs,
  copying a slide reference says it failed, and there is no review UI;
- no console errors and no failed requests.

Measured 2026-10-22: the deck pack is 177 files plus the page, 2,193,470 B,
with one script (1,705,116 B raw, 548,131 B gzip) and one stylesheet
(129,948 B raw, 21,004 B gzip).

Not verified yet:

- boot, routing, query parameters (`?scenario=`, `?actor=`) and DevTools
  inside the real claude.ai viewer (the harness is same-origin and
  unsandboxed)
- writing a real comment
- other viewers, and Commenter-level behavior
- a showcase pack published as an artifact.

## Preview locally

```bash
pnpm protoyard preview crm-demo            # http://127.0.0.1:4173/
pnpm protoyard preview crm-demo --host     # also on your LAN, for phones
```

It serves the last build, with an SPA fallback (if nothing was built yet, it
stops and tells you to run `build` first), on port `4173` or the next free one (`--strict-port` fails
instead). Each origin has its own data, so the preview starts with a fresh
world even if you edited data in `dev`.

## Publish adapters

`publish` always builds and verifies locally first, then hands the folder to
a provider CLI. It prints only the URL the provider printed; if there is
none, it fails rather than guess one. Tokens and account details are never
printed.

| Provider | `--provider` | Status | Tool |
| --- | --- | --- | --- |
| Cloudflare Pages | `cloudflare` | Supported | Wrangler (not bundled) |
| Static hosting (manual upload) | `static` | Supported | none |
| Netlify | `netlify` | **Experimental**: "implemented but not verified against the real service" | Netlify CLI |
| Vercel | `vercel` | **Experimental**: same | Vercel CLI |

The provider CLI is looked up on `PATH`, then in the workspace's
`node_modules/.bin`, then through `npx --no-install`. Nothing is installed
for you. `pnpm protoyard doctor` shows which ones are available; add
`--offline` to skip the login checks.

| Option | Effect |
| --- | --- |
| `--project <name>` | Provider project or site name. Default `protoyard-<slug>`. |
| `--preview` | Preview deployment (the default) |
| `--production` | Production deployment. Requires `--yes` (or `CI=1`), unless combined with `--dry-run`. |
| `--dry-run` | Build and verify, print the exact command, contact nobody. **Without it, `publish` uploads immediately**: a preview needs no confirmation, also with `--all` or `--tag`; only `--production` asks for `--yes`. Run `--dry-run` first when you only want to check. |
| `--branch <name>` | Cloudflare only: a named preview branch (lowercase letters, digits and dashes; `main` is reserved), so each pull request or reviewer gets its own preview URL. Refused with `--production` and by the other adapters. |
| `--ensure-project` | Cloudflare only: create the Pages project when it is missing. A dry run lists the `wrangler pages project create` command first. A real publish runs `wrangler pages project list --json` and creates the project only when its name is absent. |
| `--comments [d1\|kv]` | Cloudflare only, one prototype: shared review comments. Builds with the http review adapter on the same-origin `/api/comments`, adds `dist/_worker.js` and `dist/_routes.json`, and prints the one-time Wrangler setup, which the CLI never runs. D1 is the default. See [Shared review comments](#shared-review-comments-on-cloudflare-pages---comments). |
| `--history [<slug>…] [--limit <n>]` | Print the deploy ledger instead of publishing (see below) |

### Publishing several prototypes

Pass several slugs, `--all` (every prototype) or `--tag <tag>` (every
prototype with that tag). Templates are never included. Each prototype is
built, checked for isolation and handed to the provider in turn, exactly as a
single publish, and the batch continues past a failure:

```bash
pnpm protoyard publish --all --provider cloudflare --dry-run
pnpm protoyard publish crm-demo mobile-banking-demo --provider static
pnpm protoyard publish --tag review --provider cloudflare            # real deploys: your credentials
```

A dry run over every prototype (2026-10-18, Vite's build lines omitted):

```text
$ pnpm protoyard publish --all --provider cloudflare --dry-run
✓ mobile-banking-demo             3.1 s  would run npx --no-install wrangler pages deploy /…/artifacts/mobile-banking-demo/dist --project-name protoyard-mobile-banking-demo --branch preview --commit-dirty=true
✓ support-widget-demo             3.0 s  would run npx --no-install wrangler pages deploy /…/artifacts/support-widget-demo/dist --project-name protoyard-support-widget-demo --branch preview --commit-dirty=true
✓ nova-assistant-demo             3.0 s  would run npx --no-install wrangler pages deploy /…/artifacts/nova-assistant-demo/dist --project-name protoyard-nova-assistant-demo --branch preview --commit-dirty=true
✓ crm-demo                        3.2 s  would run npx --no-install wrangler pages deploy /…/artifacts/crm-demo/dist --project-name protoyard-crm-demo --branch preview --commit-dirty=true
✓ ui-kit                          3.2 s  would run npx --no-install wrangler pages deploy /…/artifacts/ui-kit/dist --project-name protoyard-ui-kit --branch preview --commit-dirty=true
✓ ai-chat-demo                    2.9 s  would run npx --no-install wrangler pages deploy /…/artifacts/ai-chat-demo/dist --project-name protoyard-ai-chat-demo --branch preview --commit-dirty=true
! Cloudflare Pages CLI not found locally. Install Wrangler (`pnpm add -D wrangler` in your own fork, or `npm i -g wrangler`).
Nothing was uploaded.
All 6 prototypes verified.
```

The output is one line per prototype (time, then the URL the provider
printed, the command a dry run would run, the ZIP, or the error), and the
exit code is `1` if any prototype failed. With `--json`, `data` is
`{ provider, target, dryRun, total, failed, results[] }`, with one
`{ slug, ok, durationMs, project, kind, url | command | zip, error }` entry
per prototype.

Unknown slugs and tags fail before anything is built. Each prototype uses its
default project (`protoyard-<slug>`), so `--project` is refused when there is
more than one target. `--production` still requires `--yes` and is checked
once, up front. One slug keeps the single-publish output.

### The deploy ledger

Every publish that completes (a real deploy, a dry run or a static ZIP)
appends one JSON line to `artifacts/publish/ledger.jsonl` (git-ignored,
local to your checkout). Failed publishes are not recorded.

```text
$ pnpm protoyard publish --history
2026-10-18T01:54:42.075Z  crm-demo                 cloudflare preview           dry run, nothing uploaded e2d7ba6+dirty
```

| Field | Meaning |
| --- | --- |
| `format`, `formatVersion` | `protoyard.publish-ledger`, `1` |
| `at` | When the publish completed |
| `slug`, `provider`, `target`, `branch`, `project` | What was published, where, and to which preview branch (`null` when none) |
| `kind`, `dryRun` | `published`, `dry-run` or `static` |
| `url`, `deploymentId` | Only for a real deploy, and only what the provider printed. Always `null` for dry runs and ZIPs. |
| `commit`, `dirty` | `git rev-parse HEAD` of the workspace and whether tracked files had uncommitted changes (`null` outside git) |
| `buildSha256`, `fileCount`, `totalBytes` | sha256 over the built files' paths and hashes (it identifies the exact build), plus its size |
| `zip`, `zipSha256` | The static provider's ZIP |
| `review` | Only with `--comments`: `{ adapter: "http", store: "d1" \| "kv" }`. Never a review key or a binding id. |

Each line is validated before it is written, and written in a single append,
so concurrent publishes never interleave inside a line. The schema is
strict: tokens, account ids and provider output are never recorded, and any
field whose name looks like a credential is refused. `--history` shows the
last 20 entries, oldest first. Filter with slugs or `--provider`, change the
count with `--limit`, and add `--json` for `{ ledger, total, shown, skipped,
entries }`. Lines that are not valid entries are skipped and counted. If the
ledger cannot be written, the publish still reports its result, with a
warning and `ledger: null`.

### The team review index

`pnpm protoyard review-index` writes one static page for reviewers,
`artifacts/review/index.html`, plus `review-manifest.json` (the same data as
JSON). For each prototype it shows the name, description and icon, then:

- **Deployed** (the deploy ledger has a real publish): the URL the provider
  printed, target and preview branch, publish time and commit, one link per
  scenario (`?scenario=<id>`), and one per persona of the default scenario
  (`?actor=<id>`, at most 12).
- **Not deployed**: a "not deployed" badge and the command to publish it.
  No URL is ever guessed. Dry runs and ZIPs do not count as deployments.
- **Review comments** (optional): open and resolved thread counts and the
  pull time, read from `artifacts/review-comments/comments/<slug>.json`
  (written by `comments pull` or `comments import`). That folder sits outside
  `artifacts/review/`, so it is never uploaded with the page.

```bash
pnpm protoyard review-index                          # every prototype
pnpm protoyard review-index --from-ledger            # only prototypes with a real deploy
pnpm protoyard review-index --slugs crm-demo,mobile-banking-demo --title "Sprint 12 review"
```

| Option | Effect |
| --- | --- |
| `--out <dir>` | Output folder (default `artifacts/review`, same safety rules as `build --out`) |
| `--base <path>` | Public base of the review page itself (`./` or `/sub/path/`), used for its link to `review-manifest.json` |
| `--provider <p>` | Provider named in the publish command for undeployed prototypes (default `cloudflare`) |
| `--no-personas` | Skip persona links. Persona ids come from running each deployed prototype's generator for its default scenario in a child process, as `validate` does. |

The page has no JavaScript and no external requests: plain HTML with inline
CSS using the default theme's tokens, light and dark. All text is escaped. The
same ledger and registry produce the same bytes, so the page can be committed
or diffed. Publishing the page is optional. Use `--publish cloudflare --dry-run`
to inspect the exact upload command without contacting Cloudflare, then omit
`--dry-run` only when you intend to deploy. The default Pages project is
`protoyard-review`; an explicit `--project` overrides it. `--production`
targets the production branch and requires `--yes`. The local empty
`.protoyard-review` ownership marker is temporarily removed for upload and
restored afterward. Add `--no-personas` to skip generator runs when a faster
index is more useful than persona deep links.

```bash
pnpm protoyard review-index --publish cloudflare --dry-run --no-personas
```

### Cloudflare Pages

Dry run first. It needs no account and does not require Wrangler (output of
2026-10-18; Vite's build lines omitted):

```text
$ pnpm protoyard publish crm-demo --provider cloudflare --dry-run
✓ Dry run: crm-demo built and verified (46 files, 1.4 MB).
Would run:
  npx --no-install wrangler pages deploy /…/artifacts/crm-demo/dist --project-name protoyard-crm-demo --branch preview --commit-dirty=true
! Cloudflare Pages CLI not found locally. Install Wrangler (`pnpm add -D wrangler` in your own fork, or `npm i -g wrangler`).
Nothing was uploaded.
```

A named preview branch and the project setup, in one dry run:

```text
$ pnpm protoyard publish crm-demo --provider cloudflare --branch pr-42 --ensure-project --dry-run
✓ Dry run: crm-demo built and verified (46 files, 1.4 MB).
Would run:
  npx --no-install wrangler pages project create protoyard-crm-demo --production-branch main
  npx --no-install wrangler pages deploy /…/artifacts/crm-demo/dist --project-name protoyard-crm-demo --branch pr-42 --commit-dirty=true
! Cloudflare Pages CLI not found locally. Install Wrangler (`pnpm add -D wrangler` in your own fork, or `npm i -g wrangler`).
Nothing was uploaded.
```

A real deploy **requires your Cloudflare credentials**:

1. Install Wrangler: `npm i -g wrangler` (or `pnpm add -D wrangler` in your
   own fork).
2. Authenticate, either with `npx wrangler login`, or by setting
   `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in the environment.
   The CLI checks login with `wrangler whoami` (or the presence of
   `CLOUDFLARE_API_TOKEN`) and reports only "logged in" or "not logged in".
3. Create the Pages project once:
   `npx wrangler pages project create protoyard-crm-demo --production-branch main`,
   or pass `--ensure-project` to let `publish` create it when it is missing.
   Without either, a deploy to a missing project fails with exactly this hint.
4. Deploy:

```bash
pnpm protoyard publish crm-demo --provider cloudflare                       # preview (branch "preview")
pnpm protoyard publish crm-demo --provider cloudflare --production --yes    # production (branch "main")
pnpm protoyard publish crm-demo --provider cloudflare --branch pr-42         # preview with its own alias
```

These real deploys have not been run in this repository's own checks: they
need the owner's Cloudflare credentials. Only dry runs are verified here.

Preview and production differ only in the branch passed to Wrangler: Pages
treats `main` (the production branch) as production and any other branch as
a preview with its own URL. The printed URL is the last `*.pages.dev` URL in
Wrangler's output.

### Shared review comments on Cloudflare Pages (`--comments`)

`--comments [d1|kv]` publishes a prototype with shared review comments. Every
reviewer of the deploy sees the same threads. The CLI changes three things:

1. **The build.** Review is on, with the `http` adapter pointed at the
   same-origin `/api/comments` (`PROTOYARD_REVIEW=1`,
   `PROTOYARD_REVIEW_ADAPTER=http`, `PROTOYARD_REVIEW_ENDPOINT=/api/comments`).
   The prototype's `protoyard.json` is not edited, and `build-manifest.json`
   records `review.adapter: "http"`.
2. **`dist/_worker.js`.** The comments handler from `@protoyard/review/server`
   is bundled with the CLI's own Vite into one minified file
   ([Pages advanced mode](https://developers.cloudflare.com/pages/functions/advanced-mode/)).
   Only the chosen store ships. The bundle must stay **under 20 KB raw**, with
   no imports and no Node built-ins. Otherwise the publish fails and nothing
   is written. Measured on 2026-10-19: 15,105 bytes with D1 and 14,476 bytes
   with KV. The handler validates comments with a dependency-free validator
   that is kept in parity with `ReviewCommentSchema` by tests. zod would add
   about 95 KB.
3. **`dist/_routes.json`.** It includes only `/api/comments/*`, so every
   other request is served as a static asset and never invokes the worker.
   The worker also hands any other path to `env.ASSETS`.

The worker and routes are written before the isolation check and the digest,
so both cover the folder that deploys. `functions/` is not used, because
Wrangler resolves it from its working directory.

A dry run builds all of this and prints the one-time setup. Nothing is
created, bound or uploaded (output of 2026-10-19, with Vite's build lines
and the absolute path shortened):

```text
$ pnpm protoyard publish crm-demo --provider cloudflare --comments d1 --dry-run
✓ Dry run: crm-demo built and verified (430 files, 2.1 MB).
Comments: D1 store bound as REVIEW_DB; _worker.js (14 KB) answers /api/comments/* (_routes.json); review adapter http on /api/comments.
Run once before the first deploy (protoyard runs none of these):
  npx --no-install wrangler d1 create protoyard-crm-demo-comments
  npx --no-install wrangler d1 execute protoyard-crm-demo-comments --remote --file packages/review/schema/d1.sql
  Bind the D1 database "protoyard-crm-demo-comments" to the Pages project "protoyard-crm-demo" as REVIEW_DB (Settings > Bindings, for production and preview), then deploy.
Optional shared review key (not authentication):
  npx --no-install wrangler pages secret put REVIEW_KEY --project-name protoyard-crm-demo
  REVIEW_KEY is optional: reviewers open the link once with ?review=<key> (kept in that browser). It discourages casual writes and is not authentication.
Would run (after the one-time setup):
  npx --no-install wrangler pages deploy /…/artifacts/crm-demo/dist --project-name protoyard-crm-demo --branch preview --commit-dirty=true
! Cloudflare Pages CLI not found locally. Install Wrangler (`pnpm add -D wrangler` in your own fork, or `npm i -g wrangler`).
Nothing was uploaded.
```

| Store | Binding | One-time commands |
| --- | --- | --- |
| `d1` (default, recommended) | `REVIEW_DB` | `wrangler d1 create <project>-comments`, then `wrangler d1 execute <project>-comments --remote --file packages/review/schema/d1.sql` |
| `kv` | `REVIEW_KV` | `wrangler kv namespace create <project>-comments` (KV reads, writes and rate limits are eventually consistent) |

Bind the store to the Pages project under the binding name, in the
dashboard (Settings > Bindings) for both production and preview. A worker
without its binding answers `503 store_unconfigured`. `REVIEW_KEY` is
optional. When it is set, every request needs the `x-review-key` header,
which the review UI sends after a reviewer opens the link once with
`?review=<key>`. Names and keys are self-declared and shared: this mode
discourages casual writes, and it is **not authentication**.

After a deploy, pull the threads into the prototype's `docs/REVIEW.md` for
the agent loop (only `GET`; the key comes from the environment):

```bash
PROTOYARD_REVIEW_KEY=<key> pnpm protoyard comments pull crm-demo --from https://<deploy>/api/comments --format md
```

The reviewer guide, the agent loop, honest limits and measured sizes are in
[REVIEW_COMMENTS.md](REVIEW_COMMENTS.md).

`--comments` is refused by the other providers and in batch publishes. For
one shared worker over many demos, use the showcase (below). Static and ZIP
exports never ship the worker. `export` builds a fresh `dist/` without one,
and `export --skip-build`, `publish --provider static` and a publish without
`--comments` all refuse a folder that still holds `_worker.js`. The deploy
ledger records `review: { adapter, store }`, never a key. As with every
publish, real deploys need your credentials and are not run in this
repository's checks. Only dry runs and the worker tests (bundle size,
routes, setup commands, a KV round trip through the bundled worker) are
verified.

### Netlify and Vercel (experimental)

Both adapters are implemented but not verified end to end. A dry run says
so:

```text
! The Netlify adapter is experimental and untested against the live service.
Would run:
  netlify deploy --dir /…/artifacts/crm-demo/dist --site protoyard-crm-demo --json
```

| | Netlify | Vercel |
| --- | --- | --- |
| Command | `netlify deploy --dir <dist> --site <project> [--prod] --json` | `vercel deploy <dist> --yes [--prod]` |
| Auth | `netlify login`, or `NETLIFY_AUTH_TOKEN` | `vercel login`, or `VERCEL_TOKEN` |
| `--project` | Passed as `--site` | Validated but **not** passed; the Vercel CLI links the folder to a project itself (interactively or through `VERCEL_PROJECT_ID`) |

After a real deploy the CLI adds: "The adapter is experimental: please
verify the URL loads."

### Static hosting and GitHub Pages

`--provider static` deploys nothing. It builds, checks isolation, writes the
ZIP and prints instructions:

```text
$ pnpm protoyard publish crm-demo --provider static
✓ crm-demo is ready for manual upload: artifacts/crm-demo/crm-demo.zip (385 KB)
Upload the ZIP contents (not the ZIP itself) to any static host:
  • Cloudflare Pages / Netlify: drag the unzipped folder into the dashboard "deploy manually" area.
  • GitHub Pages / S3 / any web server: copy the files into the served folder.
Builds with base "./" work from any folder; a custom --base must match the URL path.
Data lives in each visitor's browser (IndexedDB) — nothing is shared between visitors.
```

For GitHub Pages, copy the contents of `artifacts/<slug>/dist` into the
folder your Pages site serves (for example a sub-folder per prototype). The
default `./` base works under `https://<user>.github.io/<repo>/<any-folder>/`,
and hash routing means no `404.html` trick is needed.

## CI/CD templates for prototype teams

`protoyard ci init` copies versioned GitHub Actions workflows from
`packages/cli/ci-templates/github/` into `.github/workflows/` of your
repository. It only writes files: repository settings, secrets and branch
protection are never changed, and it prints secret **names**, never values.
The templates and what each one costs are described in
[packages/cli/ci-templates/README.md](../packages/cli/ci-templates/README.md).

| Workflow | `--with` | What it runs |
| --- | --- | --- |
| `protoyard-check.yml` | `check` | lint, typecheck and tests |
| `protoyard-build.yml` | `build` | `validate --build`, then `export` and `budget` on that same build (`--skip-build`), for the prototypes a pull request affects; all prototypes on `main` |
| `protoyard-e2e.yml` | `e2e` | Playwright on the affected prototypes |
| `protoyard-preview.yml` | `preview` | Installs Wrangler at a pinned version, then publishes a Cloudflare preview per pull request (`--branch pr-<number> --ensure-project`), skipped for forks. It uploads on every run. It needs `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in the `protoyard-preview` environment (see below). |

```text
$ pnpm protoyard ci init --with check --dry-run
✓ CI init dry run: 1 file(s) for github
  create .github/workflows/protoyard-check.yml

Required secrets (names only — never values):
  (none for the selected workflows)

Manual one-time steps:
  • Settings are not changed by this command.
  • Review the generated workflow files, then commit them on a branch.
  • Ensure GitHub Actions is enabled for the repository (Settings → Actions).
  • Optionally mark the check/build workflows as required status checks after the first green run.

Nothing was written (--dry-run).
```

**Preview secrets.** The preview job builds pull request code while the
Cloudflare token is in its environment, so anyone who can push a branch can
read it. Create a token limited to **Account → Cloudflare Pages: Edit** on one
account, store both values as secrets of the `protoyard-preview`
**environment** (Settings → Environments) with **required reviewers**, so each
preview run waits for approval, and rotate the token when collaborators
change. `ci init --with preview` prints these steps; it never configures them.

`--dry-run` also prints a unified diff per file (omitted above). Existing
files are refused without `--force`. Each scaffolded file carries
`# protoyard-ci-template: <id> v<N>` and `# protoyard-ci-hash: <sha256>`, so
`pnpm protoyard ci check` can report each workflow as up-to-date, outdated
(a newer template ships), modified (edited since `ci init`), unhashed or
unmanaged. `--strict` exits 4 on drift; `pnpm protoyard doctor` mentions
outdated workflows. In this repository, which has no scaffolded workflows:

```text
$ pnpm protoyard ci check
No scaffolded workflows (.github/workflows/protoyard-*.yml). Run `pnpm protoyard ci init`.
```

The build, e2e and preview templates select prototypes with
`protoyard affected`, which maps `git diff --name-only <ref>...HEAD` to
slugs: a change under `prototypes/<slug>/` affects that prototype, and a
change to shared code (`packages/`, `templates/`, root configuration)
affects all of them. Only indexed prototypes are selected: a changed
`prototypes/<name>/` folder that is not in the registry (deleted, renamed, or
without a valid manifest) is listed under `skipped` in `--json` and never
appears in the CSV, so a pull request that deletes a prototype stays green:

```text
$ pnpm protoyard affected --since HEAD~1
✓ Affected all prototypes (shared change) since HEAD~1 (7 path(s), 32.5 ms)
  ai-chat-demo  (packages)
  crm-demo  (packages)
  mobile-banking-demo  (packages)
  nova-assistant-demo  (packages)
  support-widget-demo  (packages)
  ui-kit  (packages)
  csv: ai-chat-demo,crm-demo,mobile-banking-demo,nova-assistant-demo,support-widget-demo,ui-kit
$ pnpm protoyard affected --since HEAD~1 --format csv
ai-chat-demo,crm-demo,mobile-banking-demo,nova-assistant-demo,support-widget-demo,ui-kit
```

## Releasing the packages to npm

This section is the release runbook for the Protoyard packages themselves, not
for prototypes. **No Protoyard package has been published to npm yet.** The
first live publish is a consent checkpoint that only the developer can pass.

### What is published

Every non-`private` package in `packages/*`, plus `apps/gallery`
(`@protoyard/gallery`), is published: 31 packages today. That covers the
`@protoyard/*` libraries, `protoyard` (the short-name CLI) and
`create-protoyard`. Prototypes, the individual templates and the root
workspace are `private` and never published. `@protoyard/templates` ships every
template's git-tracked files instead.

`pnpm check:packages` lists the same set, and the package guide describes what
each package is for ([PACKAGES.md](PACKAGES.md)). The packages ship their built
`dist/`. The bins, `@protoyard/templates`' template folders,
`@protoyard/avatars`' images and the gallery's site source ship as declared
data (ADR-028).

### One lockstep version

All public packages share one version through one Changesets `fixed` group,
and the root `package.json` carries the same version.

- **Current state.** Every manifest says `1.0.0`. There are no `0.0.0`
  placeholders left to replace, but `1.0.0` has never been published: the
  first release is the version the first `pnpm version-packages` produces.
- **The check.** `pnpm version-packages --check` exits 1 when any public
  package or the root drifts off the lockstep version.

### Add a changeset

Every change to a public package that should reach users needs a changeset:

```bash
pnpm changeset            # pick the packages and the bump; writes .changeset/<name>.md
```

Commit the generated file with the change. Because of the fixed group, any
bump moves every public package to the same new version
([.changeset/README.md](../.changeset/README.md)).

### Prepare a release

On an up-to-date `main`:

1. Apply the changesets: `pnpm version-packages`. It runs `changeset version`,
   writes each package's `CHANGELOG.md`, deletes the consumed changesets, and
   sets the root version to the lockstep version.
2. Add the release section to the hand-curated root `CHANGELOG.md`.
   `bash scripts/changelog-section.sh <version>` must print it.
3. Run the same checks the release gate runs. Nothing here contacts a
   registry or needs a credential:

   ```bash
   pnpm version-packages --check
   pnpm build:packages
   pnpm check:packages --require-all
   pnpm verify:packages
   pnpm verify:packages --pm npm
   pnpm -r --filter "./packages/**" --filter "./apps/gallery" publish --dry-run --no-git-checks
   ```

   - `check:packages --require-all` must report every package as `pass`.
   - Both `verify:packages` runs must pass every step.
   - The dry run lists every tarball's files and publishes nothing.
4. Commit the version bump through the normal review.

### Trusted publishing setup (once per package)

The `npm` job authenticates with npm **trusted publishing** (GitHub OIDC).
There is no npm token, and none may be added. This setup belongs to the
developer, on npmjs.com, for each of the published packages:

1. Open the package's settings on npmjs.com and add a trusted publisher of
   type GitHub Actions.
2. Enter the repository `DailybotHQ/protoyard`, the workflow file
   `release.yml` and the environment `npm`.
3. In the repository settings on GitHub, give the `npm` environment required
   reviewers, so every publishing run waits for an explicit approval.

npm attaches a trusted publisher to a package that exists in the registry. A
name that has never been published may need a different first step. Check
npm's documentation for new packages at the time of the first release; this
guide does not assume one.

### The release workflow

Pushing a `v*` tag runs `.github/workflows/release.yml`. All its actions are
pinned by commit SHA.

| Job | What it does | Permissions |
| --- | --- | --- |
| `gate` | The full repository gate (listed below), then packs every public package with `pnpm pack` in dependency order, writes the tarballs' `SHA256SUMS` and uploads both as the `npm-tarballs` artifact. | `contents: read` |
| `npm` | Downloads `npm-tarballs`, verifies every tarball against its `SHA256SUMS`, then runs `npm publish <tarball> --provenance --access public` for each, in dependency order. It has no source checkout, no install and no build, so no package script runs while it holds the OIDC token. | `contents: read`, `id-token: write`, environment `npm` |
| `release` | Verifies the skill against the committed `SHA256SUMS`, then creates the GitHub Release from the CHANGELOG.md section and attaches that file, after `npm` succeeds. | `contents: write` |

The `gate` job checks, in order:

1. The tag matches the root version and has a CHANGELOG.md section.
2. No changeset is pending.
3. Public hygiene passes.
4. The skill's stamped versions match the tag, the skill matches the
   committed `SHA256SUMS` (`scripts/verify-skill-integrity.sh`), and the
   tagged skill smoke-installs with a pinned skills CLI.
5. `pnpm version-packages --check`.
6. `pnpm check`.
7. `pnpm build:packages`, then `pnpm check:packages --require-all`.
8. `pnpm verify:packages`.
9. The tarballs are packed, checksummed and uploaded for the `npm` job.
10. The gallery and every prototype build.

The `npm` job:

- **npm version.** It refuses an npm older than 11.5.1, the first release with
  trusted publishing.
- **Checksums.** It refuses to publish when a tarball does not match the
  gate's `SHA256SUMS`, when the publish order names a file that is not
  checksummed, or when a path leaves the artifact folder.
- **Dist-tags.** A stable tag (`v1.2.0`) publishes under `latest`. A
  prerelease tag (`v1.2.0-rc.1`) publishes under `next`, and its GitHub
  Release is marked as a prerelease.
- **Order and reruns.** Dependencies are published before their dependents.
  Versions already on the registry are skipped, so rerunning after a partial
  failure publishes only what is missing.

Every pull request also runs the `packages` job in `ci.yml`: build,
`check:packages --require-all` and `verify:packages`. A package problem
therefore shows up long before a tag.

### Consent checkpoint: stop for a human

A live publish is outside what an agent may do on its own:

- **The developer's actions.** Creating and pushing the release tag,
  configuring trusted publishers, and approving the `npm` environment run.
  The approval is the consent for that publish.
- **Agents stop at the dry run.** An agent prepares the reviewable result:
  the version bump, the changelog section, the checks above and the
  `publish --dry-run` output. It then names the exact next action for the
  developer.
- **What an agent never does.** Push a `v*` tag, run `npm publish` without
  `--dry-run`, handle an npm token, or change npm or GitHub settings. An
  approval relayed by another agent grants nothing.

## Deploying the gallery

The gallery is a separate static site that lists prototypes from the
metadata registry. It does not contain the prototypes themselves; publish
those individually.

```bash
pnpm build                              # index + astro check + astro build → apps/gallery/dist
GALLERY_BASE=/protoyard/ pnpm build     # when hosted under a sub-path
pnpm preview                            # preview the built gallery
```

`GALLERY_SITE` sets Astro's `site` option. Hosted, the gallery is read-only:
there is no control server, so it shows the CLI commands instead of starting
dev servers (ADR-013).

## The showcase: gallery + live demos as one site

`pnpm build:showcase` (that is, `pnpm protoyard showcase --site https://protoyard.app`) builds **one static
site**, written to `artifacts/showcase/`. It contains the gallery and its
marketplace, the hosted blueprint playground, the prebuilt player runtime, and
live demos of every product type:

- every prototype's own static build at `<base>p/<slug>/app/`;
- every template as a demo at `<base>t/<name>/app/`, built with the same
  `template-demo-<name>` storage namespace as `protoyard dev <template>`, so
  visitors' demo data never shares the template's own namespace.
  `--no-templates` leaves the templates out (`--include-templates` is still
  accepted and changes nothing, since templates are bundled by default).
- the blueprint playground at `<base>play/`, with its framed player under
  `<base>player/`.

Blueprints are listed in the marketplace with their `protoyard generate`
command, but they have no app until they are generated, so they are not
bundled. In the published site, each marketplace page
(`<base>marketplace/<kind>/<slug>/`) plays its bundled demo under **Try it**.
Live preview iframes, **Open** links and `?scenario=<id>` links work with no
local control server. **Use this template** and **Remix** show the exact CLI
command, because the hosted site is read-only. Every demo still passes its own
isolation check and keeps its own performance budget. DevTools are included,
because a showcase is a demo site. Preview it with
`pnpm protoyard showcase --base /protoyard/ --serve`, then open
`http://127.0.0.1:4500/protoyard/`.

### Canonical links, social cards and the sitemap

`--site <origin>` (or `PROTOYARD_SITE_URL`) names the public origin, such as
`https://protoyard.app`. It accepts an https origin only (http only for
localhost); the path belongs to `--base`. With it, every gallery page gets a
canonical link, Open Graph and Twitter card tags with absolute URLs, and
`sitemap.xml` lists every page and live demo; `robots.txt` points at it. The
`/play/` landing page, `/docs/` and every published guide are in the sitemap.
Share fragments are not sent to the server, and the page marks fragment-bearing
visits `noindex`.
Every page shares one social card, `apps/gallery/public/og-image.jpg`
(1200×630), so a shared link always shows the brand. The favicon set
(`favicon.ico`, `favicon-96x96.png`, `apple-touch-icon.png`, `icon-192.png`,
`icon-512.png`, a maskable icon and `site.webmanifest`) sits next to it.
404, compare and create pages are `noindex`. Without `--site` the tags use relative URLs, the sitemap is
empty and `robots.txt` has no `Sitemap:` line. `pnpm build:showcase` passes
`--site https://protoyard.app`, the official site. A fork hosted elsewhere
changes that script or runs `pnpm protoyard showcase --site <its origin>`.

The standalone player is copied to `<base>player/`. Its CSP and framing rules
are merged into the showcase root `_headers` under `<base>player/*` so
Cloudflare Pages applies them; the player build's nested `_headers` alone is
not read from that location.

The official showcase is served by Cloudflare Pages from this repository:
build command `pnpm build:showcase`, output directory `artifacts/showcase`,
environment `NODE_VERSION=24.20.0` and `PNPM_VERSION=11.23.0`, and the custom
domain `protoyard.app`.

Avatar images are shared: every app is built with `PROTOYARD_AVATAR_BASE` set
to `<base>avatars/`, so no app carries its own copy, and the library is copied
once to the site root (350 files, 513,196 B, reported as `avatars` in the
`--json` result). Measured on 2026-10-19 with 26 demos: the site grew from
1,412 files and 42,202,092 B to 1,762 files and 42,715,288 B, exactly the one
shared copy, where per-app copies would have added about 13.3 MB. A standalone
`build` or `export` keeps its own copy, so it stays relocatable: the
`crm-demo` ZIP grows from 62 files (610 KB) to 412 files (1.1 MB).

The `--json` result lists every demo in `targets`: kind, slug, `appPath`, its
`marketplacePath`, the `storageNamespace` of template demos, and whether it
built (`ok`) with its size.

`--target artifact` packs the showcase for one private Claude artifact
instead ([The showcase as one artifact](#the-showcase-as-one-artifact)).

### Publish the showcase to Cloudflare Pages

Publish the built gallery and every prototype and template demo as one Pages project:

```bash
pnpm protoyard showcase --publish cloudflare --dry-run
pnpm protoyard showcase --publish cloudflare --project protoyard-showcase --branch team-review
```

The first command builds and verifies the showcase, then prints the exact
Wrangler command without contacting Cloudflare. Review it before running the
second command with authorized Wrangler credentials. Deploys use the preview
branch by default; `--branch` selects a named preview. The build refuses to
publish if any selected prototype or template fails to build or fails its
isolation check.
`--comments [d1|kv]` (with `--publish cloudflare`) builds every demo with the
http review adapter and writes **one** comments worker and `_routes.json` at
the site root. All demos share it: comments are keyed by slug
(`/api/comments/<slug>`). The dry run prints the same one-time setup as
`publish --comments`, for the showcase project
(`protoyard-showcase-comments`, for example).
The local `.protoyard-showcase` ownership marker is restored after publishing
and is never included in the uploaded site. This one-project option is useful
for team review; per-prototype projects remain available through `protoyard
publish --all`.

### Hosting the showcase on GitHub Pages

1. One time: **Settings → Pages → Source: GitHub Actions**.
2. **Actions → pages → Run workflow.** `base` defaults to `/protoyard/`, the
   project path. Use `/` for a user or organization site, or a custom domain.
3. The workflow ([.github/workflows/pages.yml](../.github/workflows/pages.yml))
   runs `pnpm protoyard showcase --base <base>` and deploys with
   `actions/deploy-pages`. **It never runs on push.** Publishing a public site
   is an explicit, manual decision.

The build fails if any prototype fails to build or fails the isolation
check, so a broken demo is never deployed silently. Every visitor's data
lives in their own browser (IndexedDB per origin, one database set per
prototype namespace), and nothing is shared between visitors.

## Offline (optional)

Set `"build": { "offline": true }` in `protoyard.json`, or build with
`--offline`, to add a small service worker
([`@protoyard/offline`](../packages/offline/README.md)) to the export. After
one online visit, the app shell (HTML, JS, CSS, images) loads with no
network. Prototype data was already local in IndexedDB.

- HTML is network-first. Content-hashed assets are cache-first.
- Each deploy gets a new version, which waits until every tab is closed (or
  until `window.__protoyardOffline.applyUpdate()` is called).
- `?offline=0` unregisters the service worker for that scope only.
- The build's `avatars/` images are precached with the shell (350 files,
  about 0.5 MB). In `showcase --offline`, avatars live in the shared
  `<base>avatars/` folder outside each app's scope, so they are not precached
  and need the network.

The static `@protoyard/player` is built with this flag enabled. Its manifest
advertises a standalone install, and its worker precaches the complete player
build, including lazy screen chunks, so a previously opened `#bp=` link can
reopen offline while its simulated data remains in IndexedDB. The first visit
must be online; `?offline=0` unregisters only the player scope and clears only
its caches. Claude artifact exports continue to reject offline builds.

It requires HTTPS or localhost, and the first visit must be online. Browsers
(especially Safari) may still evict caches and storage, so export snapshots
of anything worth keeping.

## Snapshots and published builds

A published build is a different origin from your dev server, so it starts
with its own data. To show a published prototype in a specific state:

1. In dev, set up the world and download a snapshot (DevTools → Snaps).
2. Open the published URL, then DevTools → Snaps → import → **Import &
   restore**. This needs a build with DevTools (`--include-devtools`).

Snapshots are matched by the manifest `id`, not by URL, so files move freely
between dev, preview and any host of the same prototype. A reproducible link
(`?scenario=…&actor=…&seed=…`) works on any build without DevTools, but only
sets up a seeded world, never edits. See
[SCENARIOS.md](SCENARIOS.md#snapshots).
