# Quick explorations

`protoyard quick` creates a disposable, local prototype from a brief or a
validated blueprint. It writes a marked folder in `.protoyard/quick/` by
default, uses the prebuilt player, and does not install dependencies or build
the application. Treat the saved brief and blueprint as local data that may
contain sensitive product ideas; review them before sharing the folder.

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

See [the CLI reference](../skills/protoyard/references/quick.md) for current
commands and options, and [Security](SECURITY.md) for filesystem and browser
trust boundaries.
