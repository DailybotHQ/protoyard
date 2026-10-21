# Protoyard quick reference

The `quick` skill explains the current exploration workflow. This file records
the installed command surface, the generated files and which broader workflow
ideas are still planned. Check `protoyard quick --help` before using a command;
the agent skill and CLI can be released at different times.

## Implemented commands

```text
protoyard quick [options] [brief]
protoyard quick serve <slug|dir> [--port <port>] [--strict-port] [--open]
protoyard quick iterate <slug|dir> --patch <file|-> [--allow-drop]
protoyard quick undo <slug|dir>
protoyard quick list
protoyard quick open <slug> [--port <port>] [--strict-port]
```

`quick serve` serves a marked exploration on 127.0.0.1 until Ctrl+C (port 4180
by default, falling back to the next free port unless `--strict-port`), and
`--open` opens it in the browser. It refuses folders without the
`.protoyard-quick` marker and a valid `quick.json`, and serves only that
exploration and its player.
- **Live reload.** While it runs, an open player follows changes to the
  blueprint. `quick iterate` applies a JSON Patch and keeps the history that
  `quick undo` reverses.
  - A safe change (nothing dropped) re-derives in place and keeps the rows.
  - A destructive one (`--allow-drop`) opens a fresh world.
- **Review comments.** The served player can post review comments, saved in
  the exploration's `review/comments.json`.
- **Find and open.** `quick list` lists the explorations, and `quick open`
  finds one by slug and serves it with `--open`.

Give exactly one brief (a positional string or `-` for stdin) or use
`--blueprint <file>`. The current help lists:

| Option | Current behavior |
| --- | --- |
| `--blueprint <file>` | Read a regular JSON file instead of a brief; symlinks are refused and input is limited to 256 KB before untrusted blueprint validation. |
| `--slug <slug>` | Choose the output folder name; otherwise it is derived from the blueprint name. |
| `--name <name>` | Set the generated product name when starting from a brief. |
| `--out <dir>` | Choose another output directory; this makes the output self-contained. |
| `--allow-external-out` | Allow a custom output outside the workspace, subject to the same marker and path guards. |
| `--seed <n>` | Set the scenario seed, an integer from 0 through 4294967295. |
| `--variants <n>` | Also write 1 to 8 deterministic variants (`v1/`…`vN/`) that change layout, theme, density and the first entity, plus `compare.html` to view them side by side. The same blueprint and seed give the same variants. |
| `--standalone` | Copy the player into the exploration rather than using the shared player folder. |
| `--no-store-brief` | Store the brief hash and length in `quick.json`, not the brief text. |
| `--force` | Replace an existing exploration only when it has Protoyard's `.protoyard-quick` marker. |

Brief input is capped at 64 KB; the offline synthesizer uses its first 5,000
characters. Blueprint input goes through `loadUntrustedBlueprint` with the
player's 256 KB cap. Neither path runs user-supplied code. Invalid input fails
with validation issues rather than producing a playable result.
When run outside a workspace, the default output is relative to the current
folder, but Protoyard refuses to use the home directory or a path containing
it as that base.

The output folder contains `blueprint.json`, `quick.json`, `index.html`, and
`.protoyard-quick`. `quick.json` is schema-validated and stores a brief's text
by default. A share link carries the blueprint in a URL fragment. If the link
is too large, or `--standalone` / `--out` is used, the player is copied beside
its blueprint. Default shared assets live in
`.protoyard/quick/_player/<version>/`. Quick requires a prebuilt player app:
the CLI's dependency provides one when installed from a release; in this
repository, build it with `pnpm --filter @protoyard/player build` if it is
missing. The app is loaded from `packages/player/dist/app/` and checked against
its `protoyard-player-assets.json` manifest; the embed client is under
`dist/embed/` and is not a substitute app bundle. `quick` does not build a
prototype or install dependencies itself.

The launcher is static and script-free. Open it with
`protoyard quick serve <slug> --open`, which serves it over loopback HTTP. Do not use `file://` or
expose the local server publicly. Before hosting or sharing any output, inspect
`blueprint.json` and `quick.json`: the latter contains the brief by default,
and the blueprint can carry details derived from it. These folders are local
exploration artifacts, not access-controlled deployments.

## Managing explorations

Screenshots (`quick shot`, `quick … --screenshot`), patches with undo
(`quick iterate`, `quick undo`), review feedback (`quick feedback`), validation
reports (`quick report`), browsing (`quick list`, `quick open`, `quick index`)
and cleanup (`quick prune`) are commands; see [cli.md](cli.md) for their flags.
The CLI's installed help is the source of truth.

`quick prune` only lists by default. Removing needs `--yes` typed on that
command (CI=1 alone never removes anything): show the developer the list and
the exact folders first, and ask before running it with `--yes`. It never
removes a promoted exploration, and keeps one whose comments are newer than
its REVIEW.md unless `--force`.
