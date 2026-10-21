# Model Context Protocol

Protoyard exposes a local MCP server through the CLI. It uses the MCP
`2025-11-25` handshake protocol over newline-delimited JSON-RPC on stdin and
stdout:

```bash
pnpm protoyard mcp
```

Configure an MCP client to start `protoyard mcp` as a child process and use
stdio. The server reserves stdout for protocol messages; diagnostics go to
stderr. It supports `initialize`, `notifications/initialized`, `ping`,
`tools/list` and `tools/call`. Every response is one JSON object followed by a
newline, so clients can process messages as they arrive. The process ends when
the client closes stdin.

The transport currently lists no tools. Tool definitions and their mappings to
Protoyard operations are added separately; a call for an unknown tool returns
a normal MCP tool result with `isError: true` and the CLI's structured error
envelope in its text content. This keeps a tool failure distinct from a JSON-RPC
transport failure.

MCP is a local interface to the same CLI and has the CLI's trust model: only
connect to a server you intend to run, and treat its workspace operations as
local code with the permissions of the current user. The stdio transport does
not open a network listener.
