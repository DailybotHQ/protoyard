---
name: texuli-upgrade
description: Check whether a newer Texuli skill release exists and, only after the developer explicitly accepts, download that exact skill-vX.Y.Z release, verify it against the release SHA256SUMS and replace the installed copy with setup.sh --replace (the old copy is kept as a backup). Use when the developer asks to upgrade, update or check the Texuli skill. Not for installing Texuli packages.
version: "0.3.4"
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
  `component`, `validate`, `example`, `theme`) are deprecated aliases until
  `0.10.0`; move host prompts and allowlists to the `group.verb` tools
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
  alias through `0.9.x`, removed in `0.10.0`.

New APIs in `0.9.0` are marked "new in `0.9.0`" in
[`../router/packages.md`](../router/packages.md); the full notes are in
`docs/RELEASE.md` of the Texuli repository ("0.9.0").

## Texuli packages 0.8.0: breaking changes

This sub-skill never upgrades packages; moving an app from `^0.7.0` to
`^0.8.0` is the developer's install ([`../components/SKILL.md`](../components/SKILL.md)).
`0.8.0` publishes `@texuli/forms`, `@texuli/canvas` and `@texuli/sheets`
for the first time; an app that does not use them sees only these changes.
Before the move, check the app for:

- **Spec 0.8.0:** validated drafts carry `spec: "0.8.0"`; a host that
  compares the string must accept it. A `0.8.0` envelope with a `$source`
  binding or a `schema-form`, `canvas`, `spreadsheet` or dashboard node is
  refused by `0.7.0` validators, so upgrade the validating side first.
- **A new catalog hash:** the new ids change the catalog hash; a host that
  pins `catalogHash` refuses envelopes written for the `0.7.0` catalog
  (`catalog-mismatch`) until it pins the new hash.
- **`aria-required` inside a `Field`:** it lands only on roles that
  support it; a `DatePicker`, `DateRangePicker`, `TimeField` or `Slider`
  gets native `required` on its inputs, and a `ColorPicker` drops it. A
  test or selector that expected it on every control needs an update.
- **Component labels from one catalog:** `texuli` and
  `@texuli/primitives` labels resolve through `@texuli/core/i18n`; the
  English defaults stay and label props still win, but check labels an
  app set another way.

Not breaking: `validateDraft` takes `checkForm`, `checkCanvas` and
`checkSheet`; the player takes `formHost`, `canvasHost`, `sheetHost`,
`sourceRegistry` or `sourceLoader`, and `print`.

New APIs in `0.8.0` (none of them in `0.7.0`) are listed in
[`../build-ui/references/imports.md`](../build-ui/references/imports.md).

## Texuli packages 0.7.0: breaking changes

This sub-skill never upgrades packages; moving an app from `^0.6.0` to
`^0.7.0` is the developer's install ([`../components/SKILL.md`](../components/SKILL.md)).
`0.7.0` publishes `@texuli/document` and `@texuli/pages` for the first time;
an app that does not use them sees only these changes. Before the move,
check the app for:

- **Spec 0.7.0:** validated drafts carry `spec: "0.7.0"`; a host that
  compares the string must accept it. A `0.7.0` envelope with node keys or
  a `document` node is refused by `0.6.0` validators, so upgrade the
  validating side first.
- **A new catalog hash:** the `document` id changes the catalog hash; a
  host that pins `catalogHash` refuses envelopes written for the `0.6.0`
  catalog (`catalog-mismatch`) until it pins the new hash.
- **`EditOp` gains `patchDocument`:** an exhaustive `switch` over `EditOp`
  or `EditOpKind` (`@texuli/catalog/edit`) needs a branch;
  `applyEditOps` and `applyEditOp` take an optional third argument, and
  without its `patchDocument` patcher that op is refused (`invalid-op`).

Not breaking: nodes may carry an optional `key` (unique in the tree),
`RenderNode` carries it, the player takes a `documentHost`, and the
`texuli` bin gains a `document` command.

New APIs in `0.7.0` (none of them in `0.6.0`) are listed in
[`../build-ui/references/imports.md`](../build-ui/references/imports.md);
agent documents are stage I of [`../blueprints/SKILL.md`](../blueprints/SKILL.md).

## Texuli packages 0.6.0: breaking changes

This sub-skill never upgrades packages; moving an app from `^0.5.0` to
`^0.6.0` is the developer's install ([`../components/SKILL.md`](../components/SKILL.md)).
Under 0.x a new minor may break. Before that move, check the app for:

- **Field ids reach the focusable control:** `FileUpload`'s `id` lands on
  the file input and `TagsInput`'s on its text input (both were on the
  wrapper); `DatePicker`, `DateRangePicker` and `TimeField` put `id` on
  their first segment and, inside a `Field`, hide their own label (the
  Field's label names them).
- **`InputGroup`:** `id`, `aria-*`, `data-*` and handlers reach the input
  (`aria-*` and `data-*` were on the group).
- **Caller handlers on more parts:** menu items, the navigation menu, toast
  roots and viewports, the tree, splitter handles, the command input, the
  carousel and the input group run a caller's handler first, then their
  own unless the caller called `event.preventDefault()`; they no longer
  drop or replace it.
- **`texuli/avatar`:** `data-avatar` is `initials` after an image error.
- **Dates:** `@texuli/primitives/date-field` (and the styled date
  controls) report no value until the year has four digits.
- **Reduced motion is `0s`:** `base.css` and the player set durations and
  delays to `0s` (it was `0.01ms`), so no `transitionend` fires under
  reduced motion.
- **Motion through the runtime:** the toast, tooltip and slides stage CSS
  keyframes (`tx-toast-in`, `tx-toast-out`, `tx-tooltip-in`,
  `tx-deck-slide-*`) are gone; a closing overlay stays mounted, `inert`,
  until its exit ends (at most 1.2 s). Override with the `motion` prop or a
  `MotionProvider` from `texuli/motion`, not CSS keyframes; tests that
  expect an overlay to leave at once run under reduced motion or
  `motion={false}`.
- **`Toaster`:** no top-layer viewport while it has no toasts.
- **`@texuli/chat`:** the day separator is its own row above the avatar and
  bubbles; CSS on the old structure needs a look.
- **Types:** `FilterCondition.operator` widens to
  `FilterOperator | FilterCustomOperatorId` (add a default branch to an
  exhaustive `switch`); `AccordionRootProps` and `SliderRootProps` members
  are type aliases.
- **Spec 0.6.0:** validated drafts carry `spec: "0.6.0"`; a host that
  compares the string must accept it.

Not breaking: `DeckStage` now preloads its default renderers in server
builds, so the server render keeps slide content; `DateRangePicker`'s
`onInvalid` gains a third `{ side }` argument.

New APIs in `0.6.0` (none of them in `0.5.0`) are listed in
[`../build-ui/references/imports.md`](../build-ui/references/imports.md).

## Texuli packages 0.5.0: breaking changes

This sub-skill never upgrades packages; moving an app from `^0.4.0` to
`^0.5.0` is the developer's install ([`../components/SKILL.md`](../components/SKILL.md)).
Under 0.x a new minor may break. Before that move, check the app for:

- **`texuli/input`:** with `type="number"` or `type="range"`, `bind:value`
  holds a `number`, or `null` while empty (it was the field's text);
  `onValueChange` still receives the text. With `type="file"`, `files`
  starts as `null` and resets with `null`.
- **Caller handlers compose:** a handler passed to `Input`, `Textarea`,
  `InputGroup` and `TextCounter` (`oninput`), to `CopyButton` and to 14
  primitive parts (`onclick`, `onkeydown` and others) runs first and no
  longer replaces the built-in one; call `event.preventDefault()` in a click
  or key handler to skip the built-in behavior.
- **`Tag`:** the remove button is named "Remove {label}" (it was
  "Remove: {label}"); a `removeLabel` prefix gets the label appended
  without a colon.
- **`toast`:** the store owns the auto-dismiss timers; they count from
  publication, with or without a mounted `Toaster`, and each toast settles
  exactly once (`onSettle(reason)`).
- **`DeckStage`:** the default renderer tables load on first use, so the
  first stage paints a polite loading status (`aria-busy`) for one chunk,
  also on the server. Await `loadDefaultDeckRenderers()` (or, with
  `defaultRenderers={false}`, `loadBuiltinDeckBlocks()`) before mounting to
  paint at once.
- **`texuli/layouts/content`:** `TocItem.level` and `TocHeading.level`
  widen from `2 | 3` to `2 | 3 | 4 | 5 | 6`; exhaustive checks need the new
  levels.
- **Callback names:** `onStop`, `onCopy`, `onCopyError` and `onSettle` are
  camelCase props, not the native DOM events.

New APIs in `0.5.0` (none of them in `0.4.0`) are listed in
[`../build-ui/references/imports.md`](../build-ui/references/imports.md);
`@texuli/editor` is published for the first time.
