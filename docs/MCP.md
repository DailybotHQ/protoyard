# Model Context Protocol (MCP)

Protoyard includes a local MCP server in the `protoyard` CLI. It lets an MCP-capable agent call a fixed set of Protoyard operations in the workspace where the server runs. It is a stdio process, not a hosted service: Protoyard does not expose a network endpoint, create an account, or depend on DeepWorkPlan (DWP).

## Start the server

Install the Protoyard CLI, open the workspace you want the agent to work in, then start:

```sh
protoyard mcp
```

From a clone of the Protoyard repository, before any npm release, run the same server through the workspace script:

```sh
pnpm --silent protoyard mcp
```

Register it with command `pnpm`, arguments `--silent`, `protoyard` and `mcp`, and the clone as the working directory.

In a client configuration, register `protoyard` as a stdio server with command `protoyard` and argument `mcp`. Configure the client's working directory to the Protoyard workspace. The server resolves that workspace when it starts; relative file arguments resolve from it, and all file arguments must remain inside it. Keep the client configuration local to the machine and connect only to a server you intend to run.

For example, in an MCP host that uses an `mcpServers` map:

```json
{
  "mcpServers": {
    "protoyard": {
      "command": "protoyard",
      "args": ["mcp"]
    }
  }
}
```

The process reads one newline-delimited JSON-RPC message from stdin at a time and writes each protocol response as one JSON line to stdout. Diagnostics go to stderr. End stdin to stop the server. Stdout is reserved for protocol messages.

## Protocol versions and handshake

The primary protocol revision is **`2026-07-28`**. It is stateless: each request carries its protocol version in `params._meta["io.modelcontextprotocol/protocolVersion"]`. Send `server/discover` to discover the server and its tools capability, then use `tools/list`, `tools/call`, and `ping` as needed. Every request is self-contained; there is no initialize session to preserve.

For clients that still use **`2025-11-25`**, the server supports the initialize handshake:

1. Send `initialize` with `params.protocolVersion` set to `2025-11-25`, plus the client's `capabilities` and `clientInfo`.
2. The server responds with the negotiated protocol version, its tool capability, and server information.
3. Send the `notifications/initialized` notification, then call `tools/list`, `tools/call`, and `ping`.

The server supports only those two revisions. A request that negotiates or names another revision receives a JSON-RPC protocol error (`-32022`) with the supported versions in `error.data.supported`. The legacy flow is retained for existing clients and can be removed after its deprecation window.

## Tools

`tools/list` returns these eleven tools. Their input objects are strict: unknown fields are rejected. String lengths and numeric ranges are checked before dispatch.

| Tool | Arguments | Behavior |
| --- | --- | --- |
| `quick` | Exactly one of `brief` (1–65,536 characters) or `blueprint` (workspace path, 1–2,048 characters); optional `slug` (1–80), `name` (1–120), `seed` (integer 0–4,294,967,295), `variants` (integer 1–8), `standalone` (boolean), `kind` (enum: app, deck, page, doc; only with `brief`) | Create a disposable prototype from a brief or blueprint. `kind` forces the synthesizer kind when a brief is given (CLI `--kind`). |
| `iterate` | Required `dir` and `patchFile` (workspace paths, 1–2,048 characters each); optional `allowDrop` (boolean) | Apply a validated patch to an existing quick exploration. |
| `validate_blueprint` | Required `file` (workspace path, 1–2,048 characters) | Validate blueprint JSON without generating a prototype. The envelope `data` includes the kind summary (`kind`, and kind-specific counts such as slides or sections). |
| `blueprint_schema` | No arguments | Return the published Protoyard blueprint JSON Schema (the kind union: app, deck, page and doc branches under oneOf). |
| `screenshot` | Required `dir` (workspace path, 1–2,048 characters) | Capture screenshots for an existing quick exploration. |
| `promote` | Required `dir` (workspace path, 1–2,048 characters) and `slug` (1–80); optional `variant` (`v1`–`v8`) and `noInstall` (boolean) | Promote a quick exploration to a full prototype. |
| `doctor` | Optional `offline` (boolean) | Check the local CLI environment and machine interface. Offline checking is the default. |
| `ds_create` | Required `id` (lowercase kebab-case, at most 64 characters); optional single-line `name` (1–80), `brief` (1–2,048), `brand`, `secondary`, `accent` (1–64 each), `font`, `headingFont`, `monoFont` (1–120 each), `shape` (sharp, rounded, pill), `radius` (0–64), `density` (dense, compact, comfortable, spacious), `motion` (none, subtle, standard, expressive), `contrast` (AA, AAA), `fromTheme` (theme id), `out` (workspace path), `force`, `dryRun` (booleans) | `ds new`: create a Texuli design system from a brief, inputs or a theme, validate and compile it, and write `design-systems/<id>.json`. Values reach the CLI as `--flag=value`, so one that starts with `-` stays a value. |
| `ds_validate` | Required `file` (workspace path, 1–2,048 characters) | `ds validate`: validate an untrusted design-system document with Texuli and compile it; the envelope carries the contrast result per mode and the hash. |
| `ds_export` | Required `file` (workspace path); optional `format` (css, tailwind, json) | `ds export`: CSS variables, a Tailwind preset or compiled JSON. |
| `ds_use` | Required `slug` (1–80) and `file` (workspace path); optional `force`, `dryRun` (booleans) | `ds use`: write `src/design-system.ts`, add it to `definePrototype({ themes })`, set `defaultTheme`; `data.next` names the spec refresh and validate steps. |

Tool calls use the same command implementations and defaults as the CLI. They do not provide an arbitrary shell or general command execution tool.

## Result envelopes and errors

Each successful JSON-RPC `tools/call` result contains `content` with one text item. Its `text` is a JSON-serialized Protoyard CLI envelope, for example:

```json
{"ok":true,"command":"blueprint_schema","data":{"$schema":"https://json-schema.org/draft/2020-12/schema"}}
```

CLI and tool failures are returned in the same text envelope shape, with `ok: false` and an `error` containing `code` and `message` (and `hint` when available). The MCP tool result has `isError: true` for these failures. The JSON-RPC transport itself succeeds: clients should inspect both `isError` and the parsed Protoyard envelope rather than treating every tool failure as a transport failure.

Protocol errors are JSON-RPC errors instead of tool envelopes. Invalid JSON returns `-32700`; an invalid request returns `-32600`, and so does a request line over 320 KiB (the 256 KiB argument cap plus room for the envelope), which is refused with `id: null` before it is buffered or parsed, and the session keeps serving; malformed `tools/call` parameters return `-32602`; an unknown method returns `-32601`; and unsupported protocol versions return `-32022`. Tool names that are unknown, invalid tool arguments, unsafe paths, CLI validation failures, and operational errors are reported as `isError` tool results with Protoyard envelopes.

## Workspace and safety boundaries

The MCP server runs as a local child process with the permissions of the user who started it. MCP is not a sandbox, authentication boundary, or remote execution service. Use it only with clients and workspaces you trust. Protoyard remains an independent CLI; DWP is one possible client and is not required.

- Tools expose a fixed allow-list and validate each argument against a closed schema. There is no `exec` or arbitrary command tool.
- **Paths.** Path arguments must resolve inside the current workspace. Parent traversal, shell metacharacters, control characters and symlinks that escape the workspace are rejected. The CLI receives the canonical absolute path that passed this check, not the caller's spelling.
- **Argument order.** The server passes values to the CLI as argument data, never by interpolating a shell command. The argv is the command, then every option, then a single `--`, then the positionals (a brief, a folder, a slug). A value that starts with `-` is therefore always data, never an option. Slugs are checked in the schema like the CLI checks them.
- **No stdin.** Over MCP, stdin is the JSON-RPC channel. A `brief` or `patchFile` of `-` (read stdin) is refused as invalid arguments, and in-process CLI runs read an empty stdin.
- **Size limits.** Encoded tool arguments are limited to 256 KiB, and a returned CLI envelope to 512 KiB.
- **Timeouts cancel.** A tool call is bounded to 30 seconds, and the timeout cancels the operation rather than only replying. Child processes it started (`pnpm install`, a browser) are stopped, no new one starts, and later steps (installing dependencies, recording a promotion, the next screenshot) do not run. Work already written before the timeout stays: check the target folder before retrying a timed-out `promote`.
- **Output strings.** Credential-shaped output fields are redacted. Every control character is removed from returned strings except tab and newline: those keep multi-line messages readable, and JSON encodes them as `\t` and `\n`, so they cannot break the one-message-per-line framing. Do not send credentials, real personal data, or other sensitive input to tools.
- `quick`, `iterate`, and `promote` can write files in the workspace through their normal CLI behavior. Review the requested operation and generated files as you would when running those CLI commands yourself.

The server does not fetch a remote service as part of the MCP transport. Individual CLI operations retain their documented behavior and workspace requirements. For the broader CLI trust model, see [the CLI guide](../packages/cli/README.md#trust-model); for machine-readable interface compatibility, see [the machine interface guide](INTERFACE.md).

## Examples

After connecting with the modern revision, list the tools:

```json
{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28"}}}
```

Call `quick` with a bounded brief:

```json
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"quick","arguments":{"brief":"A fictional field service team schedules equipment inspections and tracks visits.","seed":42,"variants":2},"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28"}}}
```

The server returns the command's JSON envelope in the tool result's text content. The CLI also remains usable directly without MCP; see the [CLI guide](../packages/cli/README.md).

## Texuli's MCP server alongside

Protoyard screens are built Texuli-first, so an agent often needs Texuli's component props, themes or blueprint rules. Texuli publishes its own read-only MCP server for that, `@texuli/mcp` (new in Texuli 0.9.0). Register it as a second server next to `protoyard`; the two stay separate processes and Protoyard does not bundle or proxy it:

```json
{
  "mcpServers": {
    "protoyard": { "command": "protoyard", "args": ["mcp"] },
    "texuli": { "command": "npx", "args": ["-y", "@texuli/mcp@0.12.3"] }
  }
}
```

- `npx -y` downloads the package from npm on first use, so that start uses the network. Pin the version Protoyard installs (`0.12.3` today) so the server describes the same Texuli as your workspace.
- Its tools are read-only `group.verb` operations (`catalog.search`, `component.get`, `catalog.validate`, `example.search`, `theme.get`, `theme.search`, `deck.run`, `document.run`, `document.export` and others). Texuli 0.10.0 removed the seven 0.8 names (`deck`, `document`, `catalog`, `component`, `validate`, `example`, `theme`); call the `group.verb` names.
- Checked with `@texuli/mcp` 0.11.1 (2026-11-01): over stdio, a client that only sent `server/discover` got `-32600` ("Server not initialized: send initialize, then notifications/initialized, before other requests"). Texuli 0.10 added the stateless `2026-07-28` revision to `createMcpHandler` (gap G124), but the stdio companion still needs the initialize handshake, so the initialize flow remains the choice for this server too.
- Texuli's remote endpoint (`https://texuli.com/mcp`) serves the same read-only operations plus site search. Use it only if sending queries to texuli.com is acceptable.

Protoyard's own tools, envelopes and limits above are unchanged; nothing on this page depends on the Texuli server.

## Keeping this page true

`pnpm exec tsx scripts/validate-integrations.ts` checks this page against the server's own tool registry
(`MCP_TOOLS` in `packages/cli/src/mcp/tools.ts`):
- the tool table lists exactly the registered tools, each with exactly its
  argument names;
- every `tools/call` example names a real tool with real arguments;
- every `protoyard` command on the page exists in the CLI.

The test that proved removing a tool or an argument fails the check was
removed in PLAN_009; `pnpm check:integrations` still runs the check itself.
