---
name: texuli-upgrade
description: Check whether a newer Texuli skill release exists and, only after the developer explicitly accepts, download that exact skill-vX.Y.Z release, verify it against the release SHA256SUMS and replace the installed copy with setup.sh --replace (the old copy is kept as a backup). Use when the developer asks to upgrade, update or check the Texuli skill. Not for installing Texuli packages.
version: "0.2.3"
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
