# Pinned install, verify and upgrade

Install **one exact version** of the Texuli skill and prove the files are the
released ones before any host reads them. The two downloads in step 1 are
the only network use; everything after them runs offline.

The skill's version is the quoted `version:` in [`../SKILL.md`](../SKILL.md)
(`./skills/texuli/setup.sh --version` prints it). `--expect-version` makes
`setup.sh` refuse, with exit 1 and nothing changed, when the pack is any
other version.

## Releases

Skill releases are tagged `skill-vX.Y.Z` on the Texuli repository, apart
from the npm packages (tagged `vX.Y.Z`). Each skill release carries two
assets:

- `texuli-skill-<version>.tar.gz`: the pack only, unpacking to `texuli/`;
- `SHA256SUMS`: the SHA-256 of that archive and of every file of the
  unpacked pack (`texuli/<path>`).

Releases are **checksummed, not signed**. The pack's own `SHA256SUMS`
travels with the files it describes, so it proves integrity only; the
release's `SHA256SUMS` is the independent record. Take it from the same
release as the archive, never from anywhere else.

If the repository has no `skill-v` tag yet, no skill release is published:
install from a checkout and verify the pack's own `SHA256SUMS` (step 2's last
command, then step 3).

## 1. Download the release files

Into an empty folder:

```bash
mkdir -p texuli-skill-<version>
cd texuli-skill-<version>
curl -fsSLO https://github.com/DailybotHQ/texuli/releases/download/skill-v<version>/texuli-skill-<version>.tar.gz
curl -fsSLO https://github.com/DailybotHQ/texuli/releases/download/skill-v<version>/SHA256SUMS
```

## 2. Verify before installing

Check the archive, unpack it, then check every file against the release's
checksums and the pinned version. On Linux, `sha256sum -c` replaces
`shasum -a 256 -c`.

```bash
grep ' texuli-skill-<version>.tar.gz$' SHA256SUMS | shasum -a 256 -c -
tar -xzf texuli-skill-<version>.tar.gz
shasum -a 256 -c SHA256SUMS
./texuli/setup.sh --verify --dir ./texuli --expect-version <version>
```

`shasum -c` fails on any changed or missing file; `setup.sh --verify` also
fails on an unlisted file and on a version that is not the one you pinned.
In a Texuli checkout, verify the pack itself:

```bash
./skills/texuli/setup.sh --verify --expect-version <version>
```

## 3. Install the pinned version

Show the plan first, then install into one host (the destinations are in
[`../router/hosts.md`](../router/hosts.md)):

```bash
./texuli/setup.sh --host claude --expect-version <version> --dry-run
./texuli/setup.sh --host claude --expect-version <version>
```

From a checkout, run `./skills/texuli/setup.sh` with the same flags. Use
`--home <dir>` to install under another home. An existing different Texuli
version is refused unless you also pass `--replace`; an unrelated folder at
the destination is always refused.

With the skills CLI, pin the release by its tree URL, never with the
`owner/repo@ref` shorthand (the CLI can ignore that ref and install the
default branch):

```bash
npx --yes skills add https://github.com/DailybotHQ/texuli/tree/skill-v<version>/skills/texuli --skill texuli -y
```

## 4. Upgrade to a new pin

Repeat steps 1 and 2 for the new version, then replace explicitly. The
previous copy is kept as a backup:

```bash
./texuli/setup.sh --host claude --expect-version <new-version> --replace --dry-run
./texuli/setup.sh --host claude --expect-version <new-version> --replace
```

The [`../upgrade/SKILL.md`](../upgrade/SKILL.md) sub-skill runs these steps
for an agent, with a consent checkpoint before the download.

Backups go to `~/.texuli/skill-backups/<host>-<UTC stamp>/texuli`. To roll
back, move a backup into the host's skills folder, then verify it with
`--verify --dir <that folder> --expect-version <old-version>`.

## Check the pack's own checksums

The pack's `SHA256SUMS` lists one `sha256  path` line per file, relative to
the pack. Without `setup.sh`, the same check is:

```bash
cd texuli
shasum -a 256 -c SHA256SUMS
```

Maintainers regenerate the pack's own `SHA256SUMS` after an intentional edit
with `pnpm exec tsx scripts/check-skill.ts --write-sums`, and
`pnpm check:skill` validates the result.
