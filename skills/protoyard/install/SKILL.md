---
name: protoyard-install
description: Install or verify the version-pinned Protoyard agent skill for a supported coding agent without conflating it with the Protoyard CLI.
version: "1.1.0"
documentation_url: https://protoyard.app/docs/
user-invocable: true
metadata:
  openclaw:
    emoji: "📦"
    homepage: https://protoyard.app/docs/
    requires:
      anyBins:
        - git
allowed-tools: Bash, Read, Grep, Glob
---

# Install the Protoyard skill

Use this sub-skill when the developer asks to install, verify, update, or
choose a host location for the Protoyard agent skill. The skill is a local
Markdown instruction pack. Installing it does not install the Protoyard CLI,
and installing the CLI does not install this skill.

## First run

1. Choose the exact Protoyard release tag to install, such as `vX.Y.Z`.
2. Install with the skills CLI, OpenClaw's native registry, or the manual
   pinned checkout described in [`../references/install.md`](../references/install.md).
3. Restart or reload the host agent so it discovers the new skill.
4. Confirm the installed `version` in the skill's `SKILL.md` and confirm the
   host can route the `protoyard` skill.
5. If the workflow needs CLI commands, install the Protoyard CLI separately
   using the release's CLI instructions, then run `protoyard --version`.

## Recommended: skills CLI

The cross-agent skills CLI can install the tagged tree into the current
workspace or, with its documented global option, into a host's user skills
directory. Always pass the skill name and a versioned GitHub tree URL:

```bash
npx skills add https://github.com/DailybotHQ/protoyard/tree/vX.Y.Z --skill protoyard
```

Use `-g` / `--global` when the skill should be available to the current user
across workspaces. Use the CLI's agent-selection option when autodetection is
not appropriate. Keep the resulting `skills-lock.json` when installing at
project scope so the team can reproduce the selected release.

## OpenClaw native route

When the host is OpenClaw and the Protoyard skill has been published to its
registry, use the native route:

```bash
openclaw skills install protoyard
```

Use the registry entry for the release you selected and verify the installed
skill version after installation. For a strict Git tag pin independent of the
registry, use the versioned skills CLI command or the manual tagged checkout.
OpenClaw can discover a project-local `skills/protoyard/` or a user-level
`~/.openclaw/skills/protoyard/` installation; see the reference for the full
host path table.

## Verify before use

Find the installed skill directory for the host, then inspect its frontmatter:

```bash
sed -n '/^version:/p' <skill-directory>/SKILL.md
```

The value must match the release tag selected for installation. Also check
that `<skill-directory>/install/SKILL.md` exists, then restart the host and
ask it to identify the available `protoyard` skill. A successful skill
installation can still have no `protoyard` executable; verify the CLI
separately with:

```bash
protoyard --version
```

If the skill version and CLI version differ, follow the release-specific
compatibility notes before using CLI examples.

## Updates and rollback

Updates are replacements, not an instruction to follow the latest release
implicitly. Select a new tag, run the same pinned install flow, restart the
host, and verify the new frontmatter version. To roll back, reinstall the
previous tag using its versioned tree URL or restore the previous manual
checkout. Do not run a remote shell installer or copy a floating branch when a
tagged release is available.
