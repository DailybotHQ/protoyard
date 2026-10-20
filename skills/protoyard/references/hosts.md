# Protoyard skill host installation paths

This reference is the canonical host map for the Protoyard skill's manual
installation instructions and host-aware setup flow. The paths below are
user-level skill directories. A host may also discover project-local skills;
use the host's current documentation to confirm that behavior for a workspace.

## Supported manual host paths

These hosts are in the first-release support set for manual installation. The
path is a destination convention, not a claim that the host has a native
Protoyard installer. Copy the complete `skills/protoyard/` directory so the
router, sub-skills, and references remain together.

| Host | Manual skill directory |
| --- | --- |
| Claude Code | `~/.claude/skills/protoyard/` |
| Cursor | `~/.cursor/skills/protoyard/` |
| OpenAI Codex | `~/.codex/skills/protoyard/` |
| Gemini CLI | `~/.gemini/skills/protoyard/` |
| GitHub Copilot | `~/.copilot/skills/protoyard/` |
| OpenCode | `~/.config/opencode/skills/protoyard/` |
| Windsurf | `~/.codeium/windsurf/skills/protoyard/` |

These seven names are the approved first-release host map for the repository's
setup flow. The paths are Protoyard's manual copy destinations; they do not
change or guarantee a host's skill discovery or loading behavior. Check the
host's current documentation for native discovery and project-local paths.

## OpenClaw native installation

OpenClaw has a separate native route when Protoyard is available in its skill
registry:

```bash
openclaw skills install protoyard
```

Confirm that the selected registry release matches the intended Protoyard
release. The native command is registry-based; for an exact Git tag, use the
versioned skills CLI or the manual tagged-checkout route in
[`install.md`](install.md). OpenClaw can also use a workspace
`skills/protoyard/` or user-level `~/.openclaw/skills/protoyard/` directory.

## Verify discovery and version

After installation, restart or reload the host and check that it discovers the
`protoyard` skill. Inspect the installed manifest version and required files:

```bash
sed -n '/^version:/p' <skill-directory>/SKILL.md
test -f <skill-directory>/install/SKILL.md
test -f <skill-directory>/references/install.md
```

The manifest version should match the selected release tag. A successful skill
install does not install the Protoyard CLI; verify that separately with
`protoyard --version` when the workflow needs CLI commands.

For a manual install, keep the selected tag in setup notes. For a
project-scoped skills CLI install, inspect `skills-lock.json` as well as the
installed manifest. If the host does not discover the skill, check the exact
directory, preserve the `protoyard/` folder nesting, then restart the host.
