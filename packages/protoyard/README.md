# protoyard

The Protoyard command line under its short name. `protoyard` is a thin
wrapper that runs [`@protoyard/cli`](../cli/README.md) at exactly the same
version (lockstep, [ADR-028](../../docs/DECISIONS.md)):

```bash
npx protoyard --version
npx protoyard doctor --json
npm install --save-dev protoyard   # then: npx protoyard <command>
```

Every command, flag and `--json` envelope is the CLI's own. The wrapper loads
`@protoyard/cli` in the same process, so arguments, standard input and output,
signals and the exit code pass through unchanged. If `@protoyard/cli` is
missing, the wrapper says so and exits 1.

Inside the Protoyard repository, use `pnpm protoyard <command>`. That root
script runs the CLI from source, and no workspace package installs a second
`protoyard` bin.

See the [Protoyard documentation](https://protoyard.app/docs/) for the commands.
