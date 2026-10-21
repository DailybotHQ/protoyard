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

## Reports and review feedback

`protoyard quick report <slug>` accepts validation metrics for the current
blueprint and the variants recorded in `quick.json`. The generated `REPORT.md`
clearly states this scope. Metrics saved under namespaces from an earlier
`quick iterate` history entry or a `keep` namespace are not included.

`protoyard quick feedback <slug>` likewise covers comments for the current
blueprint and recorded variants; comments from earlier iterations or `keep`
namespaces are not included. The generated `REVIEW.md` states this limitation.
The review-comment controls are in the player's DevTools. Passing
`?devtools=0` hides DevTools and therefore hides those controls.

See [the CLI reference](../skills/protoyard/references/quick.md) for current
commands and options, and [Security](SECURITY.md) for filesystem and browser
trust boundaries.
