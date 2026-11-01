---
name: texuli-upgrade
description: Check whether a newer Texuli skill release exists and, only after the developer explicitly accepts, download that exact skill-vX.Y.Z release, verify it against the release SHA256SUMS and replace the installed copy with setup.sh --replace (the old copy is kept as a backup). Use when the developer asks to upgrade, update or check the Texuli skill. Not for installing Texuli packages.
version: "0.3.9"
documentation_url: https://texuli.com/guides/
user-invocable: true
allowed-tools: Bash, Read, Grep, Glob
metadata: {"openclaw":{"emoji":"▣","homepage":"https://texuli.com/guides/","requires":{"anyBins":["bash","git"]}}}
---

# Texuli skill — upgrade

Keep an installed Texuli skill current, in three strictly ordered phases:
**check** (read-only), **consent** (nothing downloads without an explicit
yes), **upgrade** (one pinned release, verified before it is installed).
This sub-skill upgrades the skill pack only. Texuli packages are a separate
decision ([`../components/SKILL.md`](../components/SKILL.md)).

## Trust boundary

- Phase 1 makes one read-only network call (the list of skill tags) and
  writes nothing. Say so before running it; if the developer declines, stop
  with the installed version as the answer.
- Phase 3 starts only after the developer accepts one exact version. It
  downloads two files of that release, verifies them, and replaces the
  installed folder through `setup.sh`, which keeps the previous copy.
- Never install a moving ref (`main`, `latest`), never use the
  `owner/repo@ref` shorthand of the skills CLI (it can install the default
  branch instead of the ref), and never pipe a download into a shell.
- In a Texuli repository checkout, `.agents/skills/texuli/` is a mirror the
  repository maintains (`pnpm exec tsx scripts/check-skill.ts --refresh-mirror`).
  Do not upgrade it with this sub-skill.

The full contract is [`../TRUST.md`](../TRUST.md).

## Phase 1 — Check (read-only)

1. **Installed version.** Find the folder this file was read from (for
   example `~/.claude/skills/texuli/`) and read the quoted `version:` of its
   `SKILL.md`, or print it:

   ```bash
   ~/.claude/skills/texuli/setup.sh --version
   ```

2. **Latest release.** With the developer's go-ahead for one read-only
   network call, list the skill tags:

   ```bash
   git ls-remote --tags --refs https://github.com/DailybotHQ/texuli.git 'skill-v*'
   ```

   Keep the stable `refs/tags/skill-vX.Y.Z` tags, sort them as versions and
   take the highest. Ignore pre-release tags (`skill-vX.Y.Z-next.N`) unless
   the developer asks for that channel. Tags named `vX.Y.Z` are npm package
   releases, not skill releases.
3. **Report and stop.** State the installed version, the latest release, and
   where the changes are listed (`CHANGELOG.md` in the pack and the GitHub
   Release of that tag). When they are equal, say the skill is current and
   end here. When no `skill-v` tag exists yet, say no skill release is
   published and end here.
4. **Offline or unreachable.** If the call fails, say so in one line, give
   the installed version, and end cleanly: no retry loop, no partial state.

## Phase 2 — Consent

Ask one question that names:

- the exact version (`skill-v<version>`) and the host folder it replaces;
- what is written: only that folder, after the old copy moves to
  `~/.texuli/skill-backups/<host>-<UTC stamp>/texuli`;
- what is not touched: the workspace, Texuli packages, other skills, agent
  settings;
- that local edits inside the installed folder are replaced (they stay in
  the backup).

Only an explicit yes for that version starts Phase 3. A decline, a different
version or silence ends the sub-skill with the Phase 1 report standing.

## Phase 3 — Upgrade (accepted)

1. **Download the two release files** into an empty folder:

   ```bash
   mkdir -p texuli-skill-<version>
   cd texuli-skill-<version>
   curl -fsSLO https://github.com/DailybotHQ/texuli/releases/download/skill-v<version>/texuli-skill-<version>.tar.gz
   curl -fsSLO https://github.com/DailybotHQ/texuli/releases/download/skill-v<version>/SHA256SUMS
   ```

2. **Verify before installing.** Check the archive, unpack it, then check
   every file and the pinned version. On Linux, `sha256sum -c` replaces
   `shasum -a 256 -c`.

   ```bash
   grep ' texuli-skill-<version>.tar.gz$' SHA256SUMS | shasum -a 256 -c -
   tar -xzf texuli-skill-<version>.tar.gz
   shasum -a 256 -c SHA256SUMS
   ./texuli/setup.sh --verify --dir ./texuli --expect-version <version>
   ```

   Any failure stops the upgrade: report the failing line and install
   nothing.
3. **Show the plan, then replace.** The dry run prints the destination, the
   installed version and the backup path:

   ```bash
   ./texuli/setup.sh --host <host> --expect-version <version> --replace --dry-run
   ./texuli/setup.sh --host <host> --expect-version <version> --replace
   ```

   A copy installed with the skills CLI upgrades through the same pinned
   form instead, then gets the same version check:

   ```bash
   npx --yes skills add https://github.com/DailybotHQ/texuli/tree/skill-v<version>/skills/texuli --skill texuli -y
   ```

4. **Close the loop.** Verify the installed copy, then tell the developer to
   reload the host:

   ```bash
   ~/.claude/skills/texuli/setup.sh --verify --expect-version <version>
   ```

   Report: old version → new version, the host folder, the backup path, and
   the verification result.

## Roll back

Move the backup back into the host's skills folder and verify it with
`--verify --dir <that folder> --expect-version <old-version>`
([`../setup/pinned-install.md`](../setup/pinned-install.md)).

## Guarantees

- **Read-only until accepted.** Phase 1 writes nothing.
- **One pinned version.** The download, both checks and the install name
  the same `<version>`; `--expect-version` refuses anything else.
- **No silent loss.** `setup.sh --replace` keeps the previous copy.
- **Offline-safe.** An unreachable network ends with a report, never a
  partial install.

## Texuli packages 0.10 → 0.11: breaking changes

This sub-skill never upgrades packages; moving an app from `^0.10.0` to
`^0.11.0` is the developer's install ([`../components/SKILL.md`](../components/SKILL.md)).
The blueprint spec stays `0.10.0`. Before the move, check the app for:

- **Core entries without the theme library (breaking):** the slides and
  pages core entries no longer load the theme library by default; a host
  that relied on it passes the loaders (the default entries behave as
  before). `@texuli/slides`: `DeckStageCore` (`stage-core`) and
  `DeckPrintViewCore` (`export-core`) take
  `loadTheme={loadDeckLibraryTheme}`, and `DeckStageCore` also
  `loadLibraryBase={loadDeckLibraryBase}` (both from `stage-core`).
  `@texuli/pages`: `PageReaderCore` (`reader-core`) takes
  `loadLibraryBase={loadPagesLibraryBase}`, and `host-core` is
  `createDocumentPlayerHostCore({ loadLibraryBase: loadPagesLibraryBase })`
  (exported by both entries).
- **Single-mode design systems:** `applyDesignSystem`,
  `designSystemStyle` and `designSystemAppearance` never throw for a mode
  that was not compiled; they paint the first compiled mode and write it as
  `data-tx-mode` (`pickDesignSystemMode`). `emitCss` puts a single mode on
  the base selector.
- **Player and pages cores never reject:** an error while applying a
  design system becomes a refusal (`design-system-refused` at
  `$.designSystem`) that drops the previous system and reaches
  `onDesignSystem`.
- **`DesignSystemProvider`:** never throws from its effect; a failed apply
  drops the previous system and calls `onapplyerror`.

New APIs in `0.11.0` are marked "new in `0.11.0`" in
[`../router/packages.md`](../router/packages.md); the full notes are in
`docs/RELEASE.md` of the Texuli repository ("0.11.0").

## Texuli packages 0.10.0: breaking changes

This sub-skill never upgrades packages; moving an app from `^0.9.0` to
`^0.10.0` is the developer's install ([`../components/SKILL.md`](../components/SKILL.md)).
`0.10.0` adds design systems ([`../design-systems/SKILL.md`](../design-systems/SKILL.md));
themes, scopes and every `--tx-*` read keep working, and an app that adopts
no design system loads none of it. Before the move, check the app for:

- **MCP tool names:** the seven 0.8 aliases are removed. A call is refused
  with the operation to use (`-32602` from `tools/call`,
  `unknown-operation` from `invoke()`), so move host prompts and
  allowlists: `deck` → `deck.run`; `document` → `document.run`, or
  `document.export` with `format: "pdf"` or `"docx"`; `catalog` →
  `catalog.search`; `component` → `component.get`; `validate` →
  `catalog.validate`; `example` → `example.search`; `theme` →
  `theme.search` or `theme.get` (with `id`).
- **Tree blocks:** `style` is removed; a `tree` block with `style` is
  refused, alone or next to `variant`. Send `variant` (`file-tree` or
  `org`).
- **Spec 0.10.0:** validated drafts carry `spec: "0.10.0"`;
  `validateDraft` migrates a `0.9.0` envelope (a stamp-only migration), and
  a host that compares the `spec` string must accept `"0.10.0"`.
- **Tokens CSS:** load `@texuli/tokens/base.css` or the new
  `@texuli/tokens/system.css` (the system token defaults without the
  reset). Component CSS reads the system tokens with no fallback, so a
  host with its own reset that loads neither renders controls with no size.
- **`@texuli/forms`:** an optional select shows a "None" choice that
  clears it (set `clearable: false` to keep the old list). The date, time,
  datetime, slider, tags, file, color and radio controls and the step
  progress load per type on first use, behind a same-size placeholder
  (`data-tx-pending`, `aria-busy`): pass `SCHEMA_FORM_CONTROLS` from
  `@texuli/forms/controls` as `controls` to paint them at once (server
  rendering), and let tests wait for them. `SchemaForm` focuses the
  summary or the confirmation after any finished submit, including
  `controller.submit()`.
- **`@texuli/sheets`:** the cell editor loads lazily on the first Enter
  (or F2); a host test awaits it before typing.
- **`@texuli/pages` core entries:** `editor-core`, `reader-core`,
  `paged-core`, `collab-core` and `host-core` have no default player
  loader; live embeds paint only with the host's `loadPlayer` (for example
  `() => import('@texuli/player')`). The default entries behave as before.

New APIs in `0.10.0` are marked "new in `0.10.0`" in
[`../router/packages.md`](../router/packages.md); the full notes are in
`docs/RELEASE.md` of the Texuli repository ("0.10.0").

## Texuli packages 0.9.0: breaking changes

This sub-skill never upgrades packages; moving an app from `^0.8.0` to
`^0.9.0` is the developer's install ([`../components/SKILL.md`](../components/SKILL.md)).
`0.9.0` publishes `@texuli/mcp` for the first time. Before the move, check
the app for:

- **Spec 0.9.0:** validated drafts carry `spec: "0.9.0"` (a stamp-only
  migration from `0.8.0`); a host that compares the string must accept it.
- **A new catalog hash:** a host that pins `catalogHash` refuses envelopes
  written for the 0.8 catalog (`catalog-mismatch`) until it pins the new
  hash.
- **MCP tool names:** the seven 0.8 names (`deck`, `document`, `catalog`,
  `component`, `validate`, `example`, `theme`) are deprecated aliases in
  `0.9.0` and removed in `0.10.0` (a call is refused with the name to
  use); move host prompts and allowlists to the `group.verb` tools
  ([`../router/hosts.md`](../router/hosts.md#mcp)). A stdio request before
  `initialize` now gets `-32600`, not `-32002`.
- **Token contract v2:** additive, `renames.json` is empty; component
  tokens are read with their registry default and never declared, so set
  them on a scope, and import `@texuli/tokens/base.css`, which declares the
  system defaults. Default variants and sizes come from
  `setDesignDefaults` (`texuli/defaults`); Select and Combobox follow them.
- **A pending Button** is `aria-disabled` (its click suppressed), not
  natively `disabled`; a test or selector that expected `disabled` needs an
  update.
- **Date controls** set `aria-invalid="true"` when a `Field` marks them
  invalid, not only from their own `error` prop.
- **Tree blocks** take `variant` (`file-tree` or `org`); `style` is an
  alias through `0.9.x` and is refused from `0.10.0`.

New APIs in `0.9.0` are marked "new in `0.9.0`" in
[`../router/packages.md`](../router/packages.md); the full notes are in
`docs/RELEASE.md` of the Texuli repository ("0.9.0").

## Earlier releases

The breaking changes of `0.8.0`, `0.7.0`, `0.6.0` and `0.5.0` (for an app
still on `^0.7.0` or older) are in
[`references/packages.md`](references/packages.md); read them in order,
oldest first, then the sections above.
