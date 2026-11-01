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

## MCP

The same operations are MCP tools (`catalog.search`, `component.get`,
`blueprint.validate`, `theme.preview`, `deck.run` …; the list is generated
from the registry in `@texuli/tools/ops` and published in the server card
at `https://texuli.com/.well-known/mcp/server-card.json`). Two servers, the
same tools:

| Server | How a host connects | Tools | Status |
| --- | --- | --- | --- |
| Local, stdio | `npx -y @texuli/mcp` (bin `texuli-mcp`); offline once installed | every operation | `@texuli/mcp` is on npm from `0.9.0` (in development) |
| Remote, Streamable HTTP | `https://texuli.com/mcp` (POST JSON-RPC, no key) | the edge operations (not `document.export`) and the `site` tools | Live from `0.9.0`; CI compares its tool list with the registry after every deploy |

Claude Code, for example:

```text
claude mcp add texuli -- npx -y @texuli/mcp
```

Other hosts take the same command in their `mcp.json`, or the URL as a
Streamable HTTP server:

```json
{ "mcpServers": { "texuli": { "command": "npx", "args": ["-y", "@texuli/mcp"] } } }
```

The remote server needs the network, so use it only when the developer
chose it; the skill's own loops use the local server or the CLI. Without
MCP, `texuli <group> <verb>` (the `texuli` bin of `@texuli/tools`) runs the
same operations from a shell: `texuli help` lists them.

To install one exact release and verify it against that release's
`SHA256SUMS` first, follow [`../setup/pinned-install.md`](../setup/pinned-install.md)
(`--expect-version` refuses any other version).
