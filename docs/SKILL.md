# Protoyard skill

Protoyard's distributable agent skill lives in `skills/protoyard/` in the
repository.
Its router directs prototype work to focused local sub-skills for quick
exploration, full prototype creation, iteration, reusable kits, review, export
and publishing, installation, and upgrades. The sub-skills and their references
ship with the pack so an agent can follow them without fetching instructions at
runtime.

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

## Validate the distributable skill

From the Protoyard repository, validate every skill frontmatter file before
cutting or smoke-installing a release:

```bash
pnpm tsx scripts/validate-skill-frontmatter.ts
```

The validator enforces the namespaced skill names, quoted SemVer, canonical
documentation URL, allowed tools, and OpenClaw metadata shape. It reports the
file and field for every failure and exits nonzero when any file is invalid.

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
