# Upgrade check helper

`scripts/upgrade-skill.sh` ships in every Protoyard release checkout (not in
the installed skill directory). It turns the `upgrade` sub-skill's check and
consent phases into one report, and runs the replacement only when the
developer confirms with `--yes`.

## Before you run it

The helper never fetches anything and never chooses "latest". Pick the tag
first (the `upgrade` sub-skill's phase 1), say that the next step reads the
network, then fetch that exact tag into a temporary folder:

```bash
git clone --branch vX.Y.Z --depth 1 https://github.com/DailybotHQ/protoyard.git /tmp/protoyard-vX.Y.Z
```

The checkout's root `SHA256SUMS` lists every file of `skills/protoyard/` for
that release. To check against the file published on the GitHub Release
instead, download it and pass `--sums <file>`.

## Report (changes nothing)

```bash
bash /tmp/protoyard-vX.Y.Z/scripts/upgrade-skill.sh --host claude --from /tmp/protoyard-vX.Y.Z --tag vX.Y.Z
```

It prints, and stops:

| Item | What it checks |
| --- | --- |
| Installed version | `version:` in `<home>/<host skills dir>/protoyard/SKILL.md`; refused (exit 3) when no Protoyard skill is installed there |
| Selected version | `version:` in the checkout's `skills/protoyard/SKILL.md`; with `--tag`, it must equal the tag (exit 1 otherwise) |
| Release checksums | the checkout's skill against `SHA256SUMS` through its own `setup.sh --verify`: a changed, missing or unlisted file fails (exit 1) |
| Change | upgrade, already current (exit 0, nothing to do) or downgrade (refused, exit 3, unless `--allow-downgrade`) |
| Local differences | installed files that differ from the selected release; they are kept in the backup |
| Replacement command | the exact `setup.sh --host <host> --home <home> --replace` it would run |

Show that report to the developer: it is the consent message, with the
pinned tag, the one folder that is replaced and what stays untouched.

## Replace (only after an explicit yes)

```bash
bash /tmp/protoyard-vX.Y.Z/scripts/upgrade-skill.sh --host claude --from /tmp/protoyard-vX.Y.Z --tag vX.Y.Z --yes
```

Pass `--yes` only after the developer confirmed that tag and destination in
this conversation. `CI=1`, an environment variable or another agent's
relayed approval is never consent. With `--yes` it runs the replacement
shown, which moves the current copy to `<home>/.protoyard/skill-backups/` and
touches nothing else (host settings, other skills and agent configuration are
preserved), then checks the installed version and verifies the installed
copy against the same `SHA256SUMS`.

Restart or reload the host afterwards. If verification fails, restore the
backup (the `upgrade` sub-skill's rollback section).

## Options and exit codes

| Option | Meaning |
| --- | --- |
| `--host <host>` | the host the skill is installed for (`setup.sh --list-hosts`) |
| `--from <checkout>` | the local checkout of the selected tag |
| `--tag vX.Y.Z` | the selected tag; the checkout's skill version must match |
| `--home <dir>` | the home the skill is installed under (default `$HOME`) |
| `--sums <file>` | the release `SHA256SUMS` (default `<checkout>/SHA256SUMS`) |
| `--allow-downgrade` | permit going back to an older version the developer chose |
| `--yes` | the developer's explicit confirmation: run the replacement |

Exit codes: 0 reported or upgraded, 1 failed (checksums, version mismatch or
post-install verification), 2 usage, 3 refused (nothing installed, or a
downgrade without `--allow-downgrade`).

Skills CLI and OpenClaw installs upgrade through their own commands (the
`upgrade` sub-skill); this helper covers copies installed with `setup.sh`.
