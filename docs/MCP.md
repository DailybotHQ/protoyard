# Model Context Protocol

Protoyard exposes a local MCP server through the CLI:

```bash
pnpm protoyard mcp
```

Configure an MCP client to start `protoyard mcp` as a child process and use
stdio. Messages are newline-delimited JSON-RPC: protocol responses go to stdout,
and diagnostics go to stderr. Closing stdin shuts down the server. MCP runs with
the permissions and current working directory of the CLI process; it does not
open a network listener.

## Protocol versions

The server supports both the stateless `2026-07-28` revision and the
initialize-based `2025-11-25` revision. Modern clients send
`io.modelcontextprotocol/protocolVersion` in each request's `_meta` and may use
`server/discover` to read the supported versions and tool capability. Legacy
clients send `initialize` with `protocolVersion: "2025-11-25"`, then
`notifications/initialized` before listing or calling tools. Requests that ask
for an unsupported version receive JSON-RPC error `-32022` with the supported
versions and the requested version.

## Tools

`tools/list` advertises strict JSON input schemas. Every `tools/call` validates
its arguments and returns the CLI's structured envelope as JSON text content;
failed operations set `isError: true` while the JSON-RPC transport succeeds.

| Tool | Input | CLI operation |
| --- | --- | --- |
| `quick` | Exactly one of `brief` or `blueprint`; optional `slug`, `name`, `seed`, `variants`, `standalone` | `protoyard quick` |
| `iterate` | `dir`, `patchFile`; optional `allowDrop` | `protoyard quick iterate` |
| `validate_blueprint` | `file` | `protoyard blueprint validate` |
| `blueprint_schema` | No fields | Published `@protoyard/blueprint/schema.json` |
| `screenshot` | `dir` | `protoyard quick shot` |
| `promote` | `dir`, `slug`; optional `variant`, `noInstall` | `protoyard quick promote` |
| `doctor` | Optional `offline` (defaults to true) | `protoyard doctor` |

Calls run through the normal CLI command handlers so tool results match the
CLI's JSON envelopes. A tool whose corresponding CLI subcommand is unavailable
returns that command's ordinary structured CLI error; MCP does not emulate an
operation that the CLI has not implemented.

## Trust boundary

This is a local-code interface, not a sandbox. Only connect to a server you
intend to run. Treat workspace paths and generated files with the same care as
when invoking the CLI directly. The MCP server accepts only the listed tools;
it does not expose arbitrary command execution.
