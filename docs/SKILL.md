# Protoyard skill

Protoyard's distributable agent skill lives in `skills/protoyard/` in the
repository.
Its router directs prototype work to focused local sub-skills for quick
exploration, full prototype creation, iteration, reusable kits, review, export
and publishing, installation, and upgrades. The sub-skills and their references
ship with the pack so an agent can follow them without fetching instructions at
runtime.

The documentation site renders this guide at `/docs/skill/`; every skill file's
`documentation_url` is the docs root, `https://protoyard.app/docs/`.

## At a glance

| Topic | Where |
| --- | --- |
| Supported hosts and their skill folders | [Supported hosts](#supported-hosts) |
| Install a pinned release | [Install a tagged release](#install-a-tagged-release), [Install with `setup.sh`](#install-with-setupsh) |
| What the skill may and may not do | [Trust and consent](#trust-and-consent), the pack's [`TRUST.md`](../skills/protoyard/TRUST.md) |
| Check that files match a release | [Install with `setup.sh`](#install-with-setupsh) (`--verify`), [Release artifacts](#release-artifacts) |
| Upgrade an installed skill | [Upgrade the skill](#upgrade-the-skill) |
| What a release contains, and how to cut one | [Release artifacts](#release-artifacts) |
| Repository checks for the skill | [Validate the distributable skill](#validate-the-distributable-skill), [Check skill-local links](#check-skill-local-links) |

## Supported hosts

`setup.sh --list-hosts` prints the same map, and the pack's
[host installation reference](../skills/protoyard/references/hosts.md) is the
canonical copy. The folder is where Protoyard copies the skill; whether a host
discovers it there is the host's behavior, so check its own documentation.

| Host | `setup.sh --host` | User-level skill folder |
| --- | --- | --- |
| Claude Code | `claude` | `~/.claude/skills/protoyard/` |
| Cursor | `cursor` | `~/.cursor/skills/protoyard/` |
| OpenAI Codex | `codex` | `~/.codex/skills/protoyard/` |
| Gemini CLI | `gemini` | `~/.gemini/skills/protoyard/` |
| GitHub Copilot | `copilot` | `~/.copilot/skills/protoyard/` |
| OpenCode | `opencode` | `~/.config/opencode/skills/protoyard/` |
| Windsurf | `windsurf` | `~/.codeium/windsurf/skills/protoyard/` |

OpenClaw installs from its own registry (`openclaw skills install protoyard`)
rather than a copied folder; confirm the registry release matches the tag you
want.

Every install route is pinned to a release tag; none follows `main`:

| Route | Command | Notes |
| --- | --- | --- |
| Skills CLI | `npx skills add https://github.com/DailybotHQ/protoyard/tree/vX.Y.Z --skill protoyard` | Project scope by default; records the tag in `skills-lock.json` |
| `setup.sh` from a tagged checkout | `skills/protoyard/setup.sh --host <host>` | Copies into the host folder; refuses to overwrite without `--replace` |
| OpenClaw registry | `openclaw skills install protoyard` | Registry-based; check it matches the tag |
| Manual copy | copy `skills/protoyard/` from a tagged checkout | Keep the whole folder together |

## Install a tagged release

Install the `protoyard` skill from a versioned repository tree with the skills
CLI:

```bash
npx skills add https://github.com/DailybotHQ/protoyard/tree/vX.Y.Z --skill protoyard
```

Replace `vX.Y.Z` with the desired Protoyard release tag. The pinned URL keeps
the skill aligned with that release's CLI. The router is the `protoyard`
entrypoint; the `install` sub-skill contains host-specific installation and
verification steps. See the [installation reference](../skills/protoyard/references/install.md)
for the pinned routes, and the [host installation reference](../skills/protoyard/references/hosts.md)
for supported hosts, manual destinations, OpenClaw-native installation, and
discovery checks.

The agent skill and the Protoyard CLI are separate installs. Check `protoyard
--help` and `protoyard --version` before following CLI examples; available
commands depend on the CLI release. See the [Protoyard documentation](https://protoyard.app/docs/)
for product guides and the release-specific skill instructions for trust,
integrity, and upgrade details.

## Explore a disposable idea

For a quick local exploration from a brief or blueprint, use the
[`protoyard-quick` sub-skill](../skills/protoyard/quick/SKILL.md). It checks
`protoyard quick --help` first and distinguishes the current quick command from
planned variants, screenshots, feedback, validation, pruning, and promotion
features. Its [quick reference](../skills/protoyard/references/quick.md) lists
the supported options and current promotion path. Quick output stays on disk;
`quick.json` stores the original brief unless `--no-store-brief` is passed.

## Create a full prototype

To turn a brief, a blueprint or a quick exploration into a full prototype
under `prototypes/<slug>/`, use the
[`protoyard-new` sub-skill](../skills/protoyard/new/SKILL.md). It covers:
- the command sequences (`blueprint new`, `blueprint validate`, `generate`,
  `quick promote` and `new --template`);
- the template choice;
- validation of the result (`spec --write`, the prototype's tests,
  `validate --build`).

Its [blueprint reference](../skills/protoyard/references/blueprints.md)
summarizes the format, the brief archetypes, how an exploration and the
prototype generated from it share one blueprint, and what regeneration may
change.

## Install with `setup.sh`

The pack ships its own installer, `skills/protoyard/setup.sh`. It runs on Bash
3.2 (the macOS default) and needs no Node. From a tagged checkout:

```bash
git clone --branch vX.Y.Z --depth 1 https://github.com/DailybotHQ/protoyard.git
protoyard/skills/protoyard/setup.sh --list-hosts           # hosts and destinations
protoyard/skills/protoyard/setup.sh --host claude --dry-run
protoyard/skills/protoyard/setup.sh --host claude          # copy into ~/.claude/skills/protoyard/
```

`--host` takes one of `claude`, `cursor`, `codex`, `gemini`, `copilot`,
`opencode` and `windsurf`, the same map as the
[host installation reference](../skills/protoyard/references/hosts.md).
OpenClaw uses its native registry instead.

The behavior is predictable:
- **Nothing at the destination:** the pack is copied (or symlinked with
  `--link`, for development).
- **The same pack is already there:** no change.
- **Another Protoyard version is there:** the script refuses unless you pass
  `--replace`. The old copy then moves to
  `~/.protoyard/skill-backups/<host>-<UTC stamp>/protoyard`, outside the skills
  directory.
- **Anything else (an unrelated skill, a file):** always refused, and left
  untouched.

The copy is staged next to the destination and moved into place, so a failed
install leaves the previous state. `--home <dir>` installs under another home,
which is how the tests avoid the real one. `--dry-run` prints the plan and
writes nothing. Exit codes: 0 done, 1 failed, 2 usage, 3 refused.

`setup.sh --verify` checks the pack without installing anything. It confirms
the required files, then checks every file against a `SHA256SUMS`, for the
pack or an installed copy given with `--dir <dir>`. The release's sums file is
the root `SHA256SUMS` of the tagged checkout, outside `skills/protoyard/`, so
pass it with `--sums` (without it, `--verify` looks for `SHA256SUMS` inside the
skill folder, finds none in a release checkout, fails and says so):

```bash
protoyard/skills/protoyard/setup.sh --verify --sums protoyard/SHA256SUMS
protoyard/skills/protoyard/setup.sh --verify --dir ~/.claude/skills/protoyard --sums protoyard/SHA256SUMS
```

A changed, missing or unlisted file fails, and unsafe paths in the sums file
are refused.

The installer never fetches anything, edits host configuration or installs the
Protoyard CLI. Installing the skill is still a consent checkpoint
([`TRUST.md`](../skills/protoyard/TRUST.md)): show the host, destination and
tag first. `pnpm vitest run packages/cli/tests/skill-setup.test.ts` runs every
host against a temporary home under `/bin/bash`.

## Release artifacts

A Protoyard release is a `vX.Y.Z` tag. What it provides for the skill today:

| Artifact | Where | Use |
| --- | --- | --- |
| The skill pack | `skills/protoyard/` in the tagged tree (`…/tree/vX.Y.Z`) | What every install route copies |
| `SHA256SUMS` | the root of the tagged tree, and attached to the GitHub Release | One sorted line per file of `skills/protoyard/`; verify a checkout or an installed copy with it |
| Stamped versions | `version:` in every skill file's frontmatter | Equal to the tag; the release workflow refuses a tag whose skill versions differ |
| npm packages | `@protoyard/*` on npm, once published (nothing is published yet; see [PUBLISHING](PUBLISHING.md#releasing-the-packages-to-npm)) | The CLI and libraries, a separate install from the skill |
| GitHub Release | the tag's release page | Release notes from `CHANGELOG.md` and the `SHA256SUMS` asset |

The release workflow verifies the skill against the committed root
`SHA256SUMS` (`scripts/verify-skill-integrity.sh`, so a stale file fails the
release), smoke-installs the skill from the tag, verifies again in the release
job, then attaches that `SHA256SUMS` to the GitHub Release. There is no attached skill archive:
install from the tagged tree, and verify with `SHA256SUMS` from that tree or from
the release. The checksums show the files are the ones that tag lists; they are
not a signature and make no publisher-identity claim.

Cutting a release, the skill steps run before tagging, from the repository:

```bash
pnpm exec tsx scripts/stamp-skill-version.ts 1.2.3        # every skill version = the release
bash scripts/generate-skill-checksums.sh                  # root SHA256SUMS for skills/protoyard/
pnpm check:skill                                          # frontmatter, CLI alignment, links, checksums
bash scripts/verify-skill-integrity.sh                    # the same checksums, through setup.sh --verify
```

`scripts/verify-skill-integrity.sh --dir <skill-dir> --sums <file>` checks a
staged or installed copy the same way. The manifest lists sorted paths
relative to the skill directory, and both scripts accept `shasum` or
`sha256sum`. Regenerate `SHA256SUMS` after any edit under `skills/protoyard/`
and commit it with the change: `pnpm check:skill` fails while it is stale.

The tag release workflow smoke-installs the exact versioned GitHub tree with
the skills CLI, pinned to one exact npm version in
`scripts/smoke-install-skill.sh`, in a temporary home, then checks the router's stamped version
and the expected sub-skills. It does not publish the skill or alter a real
agent home. The GitHub Release attaches the same `SHA256SUMS` file so an
installed copy can be verified against the tagged tree.

## Validate the distributable skill

From the Protoyard repository, check the skill before cutting or
smoke-installing a release. CI runs the same command in the `check` job:

```bash
pnpm check:skill
```

It runs four checks in order and exits nonzero at the first that finds a problem:

- **Frontmatter** (`scripts/validate-skill-frontmatter.ts`): the skill names,
  quoted SemVer, canonical documentation URL, allowed tools and OpenClaw
  metadata shape. The router is named `protoyard`, and each sub-skill is
  `protoyard-<folder>` (`kits/SKILL.md` is `protoyard-kits`). Every failure
  names the file and field.
- **CLI alignment** (`scripts/check-skill-cli.ts`): the truth source is the
  real command tree, the one `protoyard --help` prints, read from
  `createProgram()`. Every `protoyard …` or `pnpm protoyard …` command in the
  skill's Markdown must name a real command and only flags that command or
  the global options accept. The check reads shell code blocks and inline
  code that starts with the command, and never reads other tools
  (`npx skills`, `pnpm --filter`, `git`). Sections whose heading says the
  commands are planned or not implemented are skipped. The reference
  (`references/cli.md`) is strict: one row per real command, each row lists
  exactly that command's flags, and the global options table lists exactly
  the program's options. A command still listed as planned fails once it
  exists, so move it to the current-release table when it lands. Every failure is
  printed as `file:line: message`.
- **Links** (`scripts/validate-skill-links.ts`): every relative Markdown link
  in `skills/protoyard/` resolves and stays inside the skill directory (see
  [Check skill-local links](#check-skill-local-links)).
- **Checksums** (`scripts/verify-skill-integrity.sh`): the skill files match the
  root `SHA256SUMS` exactly, so a stale manifest fails until
  `bash scripts/generate-skill-checksums.sh` is rerun and committed.

The unit tests are `pnpm vitest run tests/scripts/validate-skill-frontmatter.test.ts`,
`pnpm vitest run packages/cli/tests/check-skill-cli.test.ts`,
`pnpm vitest run tests/scripts/validate-skill-links.test.ts` and
`pnpm vitest run tests/scripts/skill-docs.test.ts` (this guide's commands
against the scripts and the CLI).

Before creating a release tag, stamp every skill frontmatter version from the
selected package release version, then verify the result:

```bash
pnpm exec tsx scripts/stamp-skill-version.ts 1.2.3
pnpm exec tsx scripts/stamp-skill-version.ts 1.2.3 --check
```

Use the package version, including its prerelease suffix when applicable
(for example `1.2.3-rc.1`). The release workflow checks that every stamped
version matches the pushed `v*` tag before building release artifacts.

## Upgrade the skill

The `upgrade` sub-skill (`skills/protoyard/upgrade/SKILL.md`) replaces an
installed skill with another release tag in three ordered phases:

1. **Check (read-only):** read the installed `version:` from the router's
   frontmatter, then list release tags with `git ls-remote` (a network read the
   agent announces) and pick the highest stable `vX.Y.Z`, or the tag the
   developer names.
2. **Consent:** show the exact pinned tree URL
   (`https://github.com/DailybotHQ/protoyard/tree/vX.Y.Z`), the install method,
   the one directory that will be replaced, what stays untouched (other skills,
   host settings, `AGENTS.md`, prototypes, the CLI), any local edits a
   replacement would discard, and the rollback. Nothing changes until the
   developer explicitly confirms.
3. **Upgrade and verify:** rerun the same pinned install (skills CLI, OpenClaw,
   or a manual tagged checkout with a backup kept outside the skills
   directory), restart the host, and check that the new `version:` and the
   `skills-lock.json` entry name the confirmed tag.

A failed upgrade is rolled back by reinstalling the previous tag the same way
or restoring the manual backup. The flow never follows `main` or `latest` and
never runs a downloaded shell script.

For a copy installed with `setup.sh`, the release's
[`scripts/upgrade-skill.sh`](../scripts/upgrade-skill.sh) runs the check and
the replacement against a local checkout of the selected tag
(`git clone --branch vX.Y.Z --depth 1 …`); it never fetches anything itself:

```bash
bash scripts/upgrade-skill.sh --host claude --from /tmp/protoyard-vX.Y.Z --tag vX.Y.Z         # report only
bash scripts/upgrade-skill.sh --host claude --from /tmp/protoyard-vX.Y.Z --tag vX.Y.Z --yes   # after consent
```

Without `--yes` it reports the installed and selected versions, verifies the
selected skill against its `SHA256SUMS`, lists installed files that differ,
prints the exact `setup.sh --replace` command, and changes nothing. A
checksum failure or a version that does not match `--tag` stops it (exit 1),
and a downgrade is refused (exit 3) unless `--allow-downgrade`. Only `--yes`
replaces, never `CI=1`. The replacement moves the old copy to
`~/.protoyard/skill-backups/` and leaves host settings and other skills alone,
then checks the installed version and checksums. The options are in the
skill's [`references/upgrade.md`](../skills/protoyard/references/upgrade.md);
the behavior is covered by `tests/scripts/upgrade-skill.test.ts`.

## Reusable kits

The `kits` sub-skill (`skills/protoyard/kits/SKILL.md`) tells an agent to pick
a layout, shell, view, chart, analytics, SaaS, AI, avatar or UI kit before
writing a screen by hand, to load kits from their own lazy subpaths, and to
keep writes in the prototype's services. Its catalog
(`skills/protoyard/references/kits.md`) maps needs to kits and links each
family to its guide: [LAYOUTS](LAYOUTS.md), [SHELLS](SHELLS.md),
[VIEWS](VIEWS.md), [CHARTS](CHARTS.md), [ANALYTICS](ANALYTICS.md),
[SAAS_KITS](SAAS_KITS.md), [AI_KITS](AI_KITS.md) and [AVATARS](AVATARS.md). The
catalog is a map, not an API reference; the guides and package READMEs stay
authoritative.
## Trust and consent

The skill routes to local instructions and does not fetch instructions or
publish by itself. Prototype generation may write files in the workspace the
developer asked to change; keep those edits scoped and report them. Installing
or upgrading the skill changes host-level files and requires explicit approval
after showing the pinned source and target paths. Package-manager installs and
other network actions must be identified before they run.

Provider publishing and npm releases are separate from local building and
export. Run a provider dry run first when available, then show the exact target
and obtain explicit approval before a live upload. Do not run `npm publish` or
trigger a release workflow without explicit approval for that release. Never
ask for or expose credentials. See the skill's [`TRUST.md`](../skills/protoyard/TRUST.md),
the [repository security model](SECURITY.md), and the [publishing guide](PUBLISHING.md).

## Check skill-local links

Run `pnpm tsx scripts/validate-skill-links.ts` to check Markdown links in
`skills/protoyard/`. The check reports missing targets and links that resolve
outside the distributable skill directory. Explicit external URLs are allowed
and are not fetched.
