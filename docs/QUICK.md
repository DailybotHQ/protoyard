# Quick explorations

`protoyard quick` creates a disposable, local prototype from a brief or a
validated blueprint. It writes a marked folder in `.protoyard/quick/` by
default, uses the prebuilt player, and does not install dependencies or build
the application. Treat the saved brief and blueprint as local data that may
contain sensitive product ideas; review them before sharing the folder.

Inside the Protoyard repository run every command as `pnpm protoyard …`.
Check `protoyard quick --help` on an installed CLI first: the subcommands
below are in this repository's CLI.

## The loop

An idea goes from a sentence to evidence in one folder, and only becomes a
real prototype when someone decides it should:

```bash
protoyard quick "A climbing gym books classes and tracks members" --slug gym --variants 3   # brief → exploration + v1–v3
protoyard quick shot gym --phone                       # PNGs of the base and each variant (needs Playwright)
protoyard quick serve gym --open                       # play it at a local URL; reviewers can comment
protoyard quick iterate gym --patch change.json        # change the blueprint with a JSON Patch
protoyard quick undo gym                               # take the last change back
protoyard quick feedback gym                           # served comments → REVIEW.md
protoyard quick report gym --import metrics.json       # validation sessions → REPORT.md
protoyard quick promote gym gym-desk                   # keep it: a full prototype in prototypes/gym-desk
protoyard quick prune --older-than 14d                 # list old explorations (add --yes to remove)
```

Each step writes into `.protoyard/quick/<slug>/` and records what it did in
that folder's `quick.json`. Every command takes `--json`.

### 1. Brief or blueprint → exploration

```bash
protoyard quick "A climbing gym books classes and tracks members" --slug gym
echo "A small clinic books patient appointments" | protoyard quick - --slug clinic
protoyard quick --blueprint blueprints/quick/analytics.json --slug pulse --seed 7
```

The brief is turned into a blueprint offline (the same synthesizer as
`blueprint new --from-brief`), validated, and written with a launcher
(`index.html`) and `quick.json`. `--no-store-brief` keeps only the brief's
sha256 in `quick.json`. `--standalone` copies the player into the folder
instead of sharing it, and `--out <dir>` writes elsewhere (standalone);
`--force` replaces an exploration with the same slug.

**Decks, pages and docs.** An exploration can hold any blueprint kind
(`kind: "app"` by default, or `kind: "deck"`, `kind: "page"`, `kind: "doc"`):

```bash
protoyard quick --blueprint blueprints/decks/lumen-launch.json --slug launch --variants 3
protoyard quick "A ten-slide talk introducing a fictional climbing gym" --kind deck --slug gym-talk
```

- `--blueprint` reads a deck, page or doc through the untrusted document loader
  (the kind's limits and body schema). Apps keep the ordinary app loader.
- A brief makes whatever the synthesizer detects, or what `--kind app|deck|page|doc`
  asks for. A drafted deck, page or doc is validated like any untrusted
  document and refused with its issues when it does not pass. `--kind` is
  refused together with `--blueprint` (the file already declares its kind).
- The launcher opens the player's page for that kind (`deck.html`,
  `page.html` or `doc.html`). A shared player built before those pages
  existed opens `index.html`, which runs every kind.
- Every JSON result (`quick`, `quick iterate`, `quick undo`, `quick export`,
  `quick list`) carries `kind`, and `quick index` labels deck, page and doc
  cards.
- **Variants** for a deck kind change only `deck.style` (theme, transition,
  density, font pair). A page or doc varies brand theme and density. Blocks
  and copy stay fixed; the same seed always yields the same variants
  (`deriveKindVariants` in `@protoyard/blueprint`).
- **Iterate** uses `applyContentPatch`: JSON Patch, then the untrusted
  document loader. A patch that changes `kind` is refused and writes nothing.
  There is no entity migration; `world` stays schema v1.
- **Promote** is app-only. For a deck, page or doc, `quick promote` refuses
  with the hint to run `protoyard generate <slug> --blueprint <file>`
  ([Generator](GENERATOR.md#generated-decks-pages-and-docs)).

### 2. Variants

`--variants <n>` (1 to 8) writes `v1/`…`vN/` and `compare.html`. The same
blueprint and seed always give the same variants. A deck varies only its
style (theme, transition, density and font pair in `deck.style`); a page or
doc varies its brand theme and density. Slides, sections, blocks and text
never change. See
[Variants and serving](#variants-and-serving).

### 3. Screenshots

```bash
protoyard quick shot gym
protoyard quick --blueprint blueprints/quick/analytics.json --slug pulse --screenshot --phone
```

One PNG per exploration and variant at 1280×800 (390×844 with `--phone`) in
`screenshots/`, recorded in `quick.json`, after the player is ready. Playwright
is optional: without it, or without its Chromium build, the run records why it
skipped (`playwright-unavailable` or `browser-unavailable`) and exits 0.

### 4. Play, share and browse

```bash
protoyard quick serve gym --open
protoyard quick open gym
protoyard quick list
protoyard quick index
protoyard quick export gym --single-file
```

- **Open it:** `protoyard quick serve <slug> --open` serves it on `127.0.0.1`
  (port 4180, or the next free one) until Ctrl+C. `quick open <slug>` does the
  same by slug. The player needs http; a launcher opened from `file://` does
  not run it.
- **Browse:** `quick list` lists the explorations, newest first; `quick index`
  writes `.protoyard/quick/index.html` linking each one, its variants, its
  compare page and its `REVIEW.md`.
- **One file:** `quick export <slug> --single-file` writes one HTML file
  (player and blueprint inlined) that opens from `file://` with no server, no
  network and no service worker. It embeds only the chunks its player page
  can reach: a deck, page or doc starts from `deck.html`, `page.html` or
  `doc.html` and carries no CRUD shell, Faker or app kits. `--target artifact`
  packs it as a Claude artifact page, titled from the blueprint name, with
  the kind's icon (`slides`, `page` or `document`; an app's comes from its
  category). It never publishes
  ([Publishing](PUBLISHING.md)).

### 5. Iterate and undo

```bash
protoyard quick iterate gym --patch change.json
cat change.json | protoyard quick iterate gym --patch -
protoyard quick undo gym
```

An RFC 6902 JSON Patch (512 KB at most) is applied in memory and validated
before anything is written; an invalid patch changes nothing. Each change is
kept in `history/NNNN.json`, and `quick undo` restores the previous blueprint
byte for byte. A patch that drops an entity or field needs `--allow-drop`. A
tab open through `quick serve` reloads the new blueprint in place and keeps
its world. Variants are not changed by an iterate.

### 6. Feedback

While the exploration is served, reviewers place comments in the player
(the comment controls are in DevTools); they land in `review/comments.json`.
`protoyard quick feedback gym` writes `REVIEW.md` and `REVIEW.json`;
`--import <file>` merges a comments file a reviewer exported from the browser.
See [Reports and review feedback](#reports-and-review-feedback) and
[Review comments](REVIEW_COMMENTS.md).

### 7. Validate

A blueprint with `validation.tasks` shows a task panel in the player: the
participant starts a task, works in the prototype, and succeeds, gives up or
runs out of time. Attempts (outcome, time, steps; nothing typed) stay in the
browser, and **Download metrics** saves a `protoyard-validation-metrics` file.
Which task is current resets when the page reloads; recorded attempts persist.
Add tasks to an exploration with `quick iterate` (a patch on `/validation`).

### 8. Report

```bash
protoyard quick report gym --import gym-validation-metrics.json
protoyard quick report gym
```

Per variant and task: attempts, success rate, median time and median steps
of successful attempts, in `report.json` and `REPORT.md`. Imports are
validated, kept in `metrics/` and counted once; the same inputs give the same
bytes.

### 9. Promote

```bash
protoyard quick promote gym gym-desk
protoyard quick promote gym gym-desk --variant v2 --no-install
```

Runs `generate` on the exploration's (or one variant's) blueprint into
`prototypes/<new-slug>`, checks it is the same app, and records `promotedTo`.
It promotes apps only. For a deck, page or doc it refuses and prints the
`protoyard generate <slug> --blueprint <file>` command to run instead.
It needs a workspace and never replaces a prototype. From there, follow
[Generator](GENERATOR.md#promoting-a-quick-exploration) and
[Brief to prototype](BRIEF_TO_PROTOTYPE.md).

**Workspace listing.** A workspace can limit its default listings to some
catalog categories with an optional `protoyard.workspace.json` at the root:

```json
{ "listing": { "include": { "category": ["sales"] }, "appliesTo": ["prototype"] } }
```

- **What it filters:** `protoyard list`, the gallery and marketplace, the
  showcase and the review index show only entries whose `protoyard.json`
  `category` is listed. With `appliesTo`, only the named kinds (`prototype`,
  `template`, `blueprint`) are filtered and the others are all shown.
- **What it leaves alone:** the registry file keeps every entry, and commands
  that name a slug (`dev`, `build`, `export`, `validate`, `showcase --slugs`)
  are never filtered.
- **A promoted exploration** is filtered like any prototype, by the
  `category` in its `protoyard.json`. If that category is not included, the
  new prototype exists and builds, but the listings above do not show it.
- **Seeing everything:** `protoyard list --all`, or `PROTOYARD_LISTING=all`
  for any command and for the gallery build. `list` reports how many entries
  were hidden.
- **No file:** with no file, or no `listing.include.category`, everything is
  listed. An invalid file is reported and lists everything.
- **Quick explorations are not filtered:** they are not registry entries, so
  `quick list` and `quick index` always show them all.

### 10. Prune

```bash
protoyard quick prune --older-than 14d
protoyard quick prune --older-than 2w --yes
```

Lists explorations not updated for the given age; only `--yes` typed on the
command removes them (`CI=1` alone never does). Promoted explorations are never
removed; one whose comments are newer than its `REVIEW.md` only with `--force`.

## Measured numbers

From [Performance](PERFORMANCE.md#quick-exploration-brief-to-ready-measured-2026-10-20)
and the commands' own measurements, on an Apple M1 Max under load from other
builds (numbers move with the load):

| What | Measured |
| --- | ---: |
| Brief → ready (`quick` CLI + player ready, no build) | 1,527 ms median (1,515–1,583 ms) |
| Second exploration (shared player reused) | 987 ms |
| Player initial JS | 178.8 KB gzip in 27 files |
| `quick export --single-file` over the 40 catalog blueprints | 3.25 MB (about 1.05 MB gzip), refused over 4 MiB |
| `quick export --single-file`, catalog deck, page and doc (2026-10-28, decks on the `@texuli/slides` stage) | 2.60 to 2.61 MB each, refused over 2.65 MiB |
| `quick shot` PNG, quick blueprints | 38–97 KB each (150 KB budget) |


## Variants and serving

`--variants <n>` writes deterministic variants and a `compare.html` page.
Until a blueprint can declare a broader supported-layout set, variants keep
the blueprint's app-model layout and vary only other compatible presentation
choices. Each blueprint gets its own content-derived browser-storage
namespace.

`protoyard quick serve <slug>` serves only that exploration and its matching
shared player version on `127.0.0.1`. Other exploration folders, player
versions and unknown paths return 404. Do not expose the local server publicly.

## The prebuilt player

The shared `.protoyard/quick/_player/<version>/` copy is reused only while its
files and its own manifest match the current player build exactly (same file
list and sha256). A player rebuilt under the same version replaces it, with a
temporary folder and a rename. In this repository, when a file under
`packages/player/src`, `packages/player/index.html` or
`packages/player/vite.config.ts` is newer than
`packages/player/dist/app/protoyard-player-assets.json`, `quick` still runs but
prints a warning (also in the JSON envelope's `data.warnings`) that names
`pnpm --filter @protoyard/player build`. Installed releases are never checked.

On a fresh clone of this repository, `packages/player/dist/app/` does not exist
yet, so the first `quick` builds it once: it prints `Building the player once
for quick (about 10 s): pnpm --filter @protoyard/player build`, runs that
command from the repository root, and continues. The line and the build output
go to stderr, so `quick --json` still prints one envelope on stdout. A failed
build stops `quick` with an error that names the command to run. Running the
build yourself first is optional. `quick` builds only in this layout: it never
builds in a consumer workspace or an installed `@protoyard/player`, and it never
rebuilds a stale build (that case keeps the warning above). The logic is in
`packages/cli/src/lib/quick/player-build.ts`.

## Reports and review feedback

`protoyard quick report <slug>` accepts validation metrics for the current
blueprint, the variants recorded in `quick.json`, and the earlier base
blueprints kept in the exploration's `quick iterate` history
(`history/NNNN.json`). A tab served by `quick serve` that live-reloads after
an iterate keeps its world, and so its metrics, under the namespace of the
blueprint it first opened; those rows go to the base group, marked as an
earlier version with the history entry they came from. Metrics for any other
namespace are refused and nothing is written. Explorations record no `keep-`
namespaces, so those are refused too. The generated `REPORT.md` states this
scope. Only the 1024 most recent history entries are read back.

`protoyard quick feedback <slug>` covers comments with the same rule: the
current blueprint, the recorded variants and earlier base blueprints from the
history, each earlier one in its own section marked as an earlier version.
The generated `REVIEW.md` states this scope. `quick undo` removes a history
entry, so after an undo the blueprint that change created no longer counts.
The review-comment controls are in the player's DevTools. Passing
`?devtools=0` hides DevTools and therefore hides those controls.

## Honest limits

- **Simulated, local data.** An exploration is a prototype on fictional data in
  one browser. Roles, sign-in and permissions are simulations, never security.
- **Storage follows the blueprint.** Each blueprint version gets its own
  content-derived namespace, so a changed blueprint opened fresh starts a new
  world; only a tab that live-reloaded keeps its world.
- **The player needs http.** Launchers do not run from `file://`; use
  `quick serve` or `quick export --single-file`.
- **Comments need DevTools.** `?devtools=0` hides the comment controls.
- **Screenshots need Playwright.** Without it they are skipped and recorded,
  and two captures can differ by anti-aliasing at rounded corners.
- **Iterate changes the base only.** Variants and `compare.html` keep the
  blueprint they were derived from.
- **Content-kind patches.** `quick iterate` on a deck, page or doc validates
  the result as an untrusted document and refuses a patch that changes
  `kind`. There is no migration, because content kinds share one store
  layout: `world` always reports schema v1, preserved.
- **`quick serve` is a local convenience.** It binds to `127.0.0.1` and is not
  authentication; do not expose it.

See [the CLI reference](../skills/protoyard/references/quick.md) for current
commands and options, [Security](SECURITY.md) for filesystem and browser
trust boundaries, and [Player](PLAYER.md) for the player itself.
