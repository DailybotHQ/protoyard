# Texuli skill — supported hosts

`setup.sh --list-hosts` prints the same map. The folder is where Texuli copies
the skill; whether a host discovers it there is the host's behavior.

| Host | `setup.sh --host` | User-level skill folder |
| --- | --- | --- |
| Claude Code | `claude` | `~/.claude/skills/texuli/` |
| Cursor | `cursor` | `~/.cursor/skills/texuli/` |
| OpenAI Codex | `codex` | `~/.codex/skills/texuli/` |
| Gemini CLI | `gemini` | `~/.gemini/skills/texuli/` |
| GitHub Copilot | `copilot` | `~/.copilot/skills/texuli/` |
| OpenCode | `opencode` | `~/.config/opencode/skills/texuli/` |
| Windsurf | `windsurf` | `~/.codeium/windsurf/skills/texuli/` |

OpenClaw uses its native registry (`openclaw skills install texuli`) rather
than a copied folder when that registry entry exists.

## Install from a checkout

```bash
# List destinations (no writes)
./skills/texuli/setup.sh --list-hosts

# Dry run
./skills/texuli/setup.sh --host claude --dry-run

# Install (explicit approval)
./skills/texuli/setup.sh --host claude

# Verify integrity against SHA256SUMS
./skills/texuli/setup.sh --verify
```

`--replace` is required to overwrite another Texuli skill version (previous
copy moved under `~/.texuli/skill-backups/`). Unrelated files at the destination
are never overwritten.

To install one exact release and verify it against that release's
`SHA256SUMS` first, follow [`../setup/pinned-install.md`](../setup/pinned-install.md)
(`--expect-version` refuses any other version).
