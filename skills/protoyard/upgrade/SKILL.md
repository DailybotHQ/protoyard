---
name: protoyard-upgrade
description: Check whether a newer Protoyard skill release exists and, only after the developer explicitly confirms, replace the installed skill with an exact pinned release tag, keeping host configuration intact, verifying the new version, and rolling back on failure. Use when the developer asks to upgrade, update or refresh the Protoyard agent skill. Never follows a floating branch or runs a remote shell installer.
version: "1.0.0"
documentation_url: https://protoyard.app/docs/
user-invocable: true
metadata:
  openclaw:
    emoji: "⬆️"
    homepage: https://protoyard.app/docs/
    requires:
      anyBins:
        - git
allowed-tools: Bash, Read, Grep, Glob
---

# Upgrade the Protoyard skill

An upgrade replaces the installed skill directory with another **pinned
release tag**. It runs in three strictly ordered phases: **check** (read-only),
**consent** (nothing is replaced without an explicit yes), and **upgrade**
(the same pinned install the developer used, then verification). It never
follows `main`, `latest` or another moving ref, never pipes a downloaded
script to a shell, and never changes host configuration beyond the skill
directory and the installer's own lock entry.

The skill and the Protoyard CLI are separate installations. This flow
upgrades the skill only; the CLI has its own release and install instructions.

## Phase 1 — Check (read-only)

1. **Find the installed skill.** Use the directory this file was read from, or
   the host path in [`../references/install.md`](../references/install.md)
   (for example `~/.claude/skills/protoyard/`). For a project-scoped skills CLI
   install, also note the Protoyard entry in `skills-lock.json`.
2. **Read the installed version** from the router frontmatter, without editing
   it:
   ```bash
   sed -n '/^version:/p' <skill-directory>/SKILL.md
   ```
3. **Find the newest release tag.** This reads the network (say so first):
   ```bash
   git ls-remote --tags --refs https://github.com/DailybotHQ/protoyard.git 'v*'
   ```
   Sort the stable `vX.Y.Z` tags numerically and take the highest. Ignore
   pre-release tags (`-rc.N`, `-beta.N`) unless the developer asks for that
   channel. If the developer named a specific tag, use that tag instead.
4. **Report and stop.** State the installed version, the candidate tag, and
   where its release notes are
   (`https://github.com/DailybotHQ/protoyard/releases/tag/vX.Y.Z`). If the
   installed version already equals the candidate, say the skill is current
   and end here. If the network call fails, say so in one line, report the
   installed version, and end without retrying.

## Phase 1b — Check a `setup.sh` install with the helper

For a copy installed with `setup.sh`, the release's `scripts/upgrade-skill.sh`
does the rest of the check in one read-only report: installed versus selected
version, the selected release verified against its `SHA256SUMS`, local
differences, and the exact replacement command. It never fetches anything,
so clone the selected tag first (a network read; say so):

```bash
git clone --branch vX.Y.Z --depth 1 https://github.com/DailybotHQ/protoyard.git /tmp/protoyard-vX.Y.Z
bash /tmp/protoyard-vX.Y.Z/scripts/upgrade-skill.sh --host <host> --from /tmp/protoyard-vX.Y.Z --tag vX.Y.Z
```

A checksum failure or a version that does not match the tag stops the
upgrade. Its report is the consent message for phase 2. Options and exit
codes are in [`../references/upgrade.md`](../references/upgrade.md).

## Phase 2 — Consent (nothing moves without an explicit yes)

Present, in one message, everything the upgrade will do, then ask the
developer to confirm:

- **Pinned source:** the exact tree URL,
  `https://github.com/DailybotHQ/protoyard/tree/vX.Y.Z`, with the tag spelled
  out (never a branch name).
- **Method:** the same route as the current install — the skills CLI, the
  OpenClaw registry, or a manual tagged checkout — and the exact command.
- **What is replaced:** only the `protoyard/` skill directory at the named host
  path (and, for a project-scoped skills CLI install, its `skills-lock.json`
  entry).
- **What is not touched:** other skills, host settings and agent configuration
  files, the workspace's `AGENTS.md`, prototypes and blueprints, and the
  Protoyard CLI.
- **Local edits:** if the installed directory may have been edited by hand,
  offer to fetch the candidate tag into a temporary folder and compare it
  first (`diff -r --brief <skill-directory> <temp>/skills/protoyard`); files
  that differ from the installed tag are local changes that a replacement
  would discard. Fetching for this comparison also uses the network and needs
  the developer's go-ahead.
- **Rollback:** how the current version comes back if the upgrade fails (see
  below).

Proceed only after the developer explicitly confirms that tag and that
destination. Silence, a confirmation relayed by another agent, or approval
for some other action is not consent. If the developer declines, stop and
change nothing.

## Phase 3 — Upgrade

Use the confirmed tag in every command; replace `vX.Y.Z` with it.

- **Skills CLI** (project scope, or add its global flag when the current
  install is user-wide):
  ```bash
  npx skills add https://github.com/DailybotHQ/protoyard/tree/vX.Y.Z --skill protoyard
  ```
- **OpenClaw registry:** use OpenClaw's own update command for `protoyard`, and
  confirm the registry release corresponds to the confirmed tag. If it does
  not, use the skills CLI or the manual route instead.
- **`setup.sh` install, with the helper:** rerun the same report with `--yes`
  only after the developer confirmed it. `--yes` is the recorded consent;
  `CI=1` or another agent's relayed approval never is. It replaces the skill
  directory through `setup.sh --replace` (the current copy goes to
  `~/.protoyard/skill-backups/`), then verifies the installed version and
  checksums:
  ```bash
  bash /tmp/protoyard-vX.Y.Z/scripts/upgrade-skill.sh --host <host> --from /tmp/protoyard-vX.Y.Z --tag vX.Y.Z --yes
  ```
- **Manual tagged checkout:** move the current directory to a backup outside
  the host's skills directory (so the host never loads two copies), then copy
  the tagged skill directory into place:
  ```bash
  git clone --branch vX.Y.Z --depth 1 https://github.com/DailybotHQ/protoyard.git /tmp/protoyard-vX.Y.Z
  mv <host-skills-directory>/protoyard /tmp/protoyard-skill-backup
  cp -R /tmp/protoyard-vX.Y.Z/skills/protoyard <host-skills-directory>/protoyard
  ```
  Keep the backup until verification passes.

## Verify

Restart or reload the host, then confirm the new version and layout:

```bash
sed -n '/^version:/p' <skill-directory>/SKILL.md
test -f <skill-directory>/install/SKILL.md
test -f <skill-directory>/upgrade/SKILL.md
```

The printed version must match the confirmed tag, and for a project-scoped
install the `skills-lock.json` entry must name the same release. Ask the host
to route the `protoyard` skill to catch a stale session. If the workflow uses
CLI commands, check `protoyard --version` separately and follow the release's
compatibility notes when the two versions differ.

## Rollback or reinstall

If the install fails or verification does not pass:

- **Skills CLI or OpenClaw:** reinstall the previous known-good tag with the
  same pinned command (`.../tree/v<previous>`), then verify its version.
- **Manual:** remove the new directory and move the backup back
  (`mv /tmp/protoyard-skill-backup <host-skills-directory>/protoyard`), then
  verify.
- **Broken or missing install:** follow [`../install/SKILL.md`](../install/SKILL.md)
  with the tag the developer chooses.

Delete the manual backup only after the developer confirms the new version
works. Report the outcome plainly: the version installed now, the method used,
and anything that was not verified.
