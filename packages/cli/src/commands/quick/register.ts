import type { Command } from 'commander';
import type { Handler } from '../../lib/command.ts';
import { quickExportCommand } from './export.ts';
import { quickCommand } from './index.ts';
import { quickPromoteCommand } from './promote.ts';
import { quickServeCommand } from './serve.ts';

type Def = (name: string, handler: Handler) => (...args: unknown[]) => Promise<void>;

/**
 * Registers the `quick` command group (ADR-031). `protoyard quick "<brief>"`
 * runs the parent action; later subcommands (`quick serve`, `quick list`, …)
 * register here too, so program.ts stays one call.
 */
export function registerQuick(program: Command, def: Def): Command {
  const quick = program
    .command('quick')
    .description('a disposable, playable exploration from a brief or a blueprint, with no build')
    .argument('[brief]', 'the idea in a sentence or two, or "-" to read it from stdin')
    .option('--blueprint <file>', 'start from a blueprint JSON file instead of a brief')
    .option('--slug <slug>', 'folder name (default: from the blueprint name)')
    .option('--name <name>', 'product name for a brief (default: a fictional name)')
    .option('--out <dir>', 'write somewhere other than .protoyard/quick/<slug>/ (self-contained)')
    .option('--allow-external-out', 'permit an --out outside the workspace (must be new or empty)')
    .option('--seed <n>', 'scenario seed the launcher opens the world with (whole number)')
    .option(
      '--variants <n>',
      'also write N deterministic variants (1-8) in v1/..vN/, with compare.html'
    )
    .option('--standalone', 'copy the player into the folder instead of sharing it')
    .option('--no-store-brief', 'keep only the brief’s sha256 in quick.json, not its text')
    .option('--force', 'replace an existing exploration with the same slug')
    .action(def('quick', quickCommand));
  quick
    .command('serve')
    .description('serve an exploration on 127.0.0.1 until Ctrl+C (player needs http, not file://)')
    .argument('<target>', 'the exploration: its slug, or the folder `protoyard quick` printed')
    .option('--port <port>', 'first port to try (default 4180; a busy port falls back to the next)')
    .option('--strict-port', 'fail instead of falling back when the port is busy')
    .option('--open', 'open the exploration in the default browser')
    .action(def('quick serve', quickServeCommand));
  quick
    .command('export')
    .description('export an exploration as one self-contained HTML file that opens from file://')
    .argument('<target>', 'the exploration: its slug, or its folder')
    .option('--single-file', 'inline the player and the blueprint into one HTML file')
    .option('--out <file>', 'write under artifacts/ or tmp/ instead of <exploration>/<slug>.html')
    .option('--force', 'replace an existing export')
    .action(def('quick export', quickExportCommand));
  quick
    .command('promote')
    .description('turn an exploration into a full prototype in prototypes/<slug> (via generate)')
    .argument('<target>', 'the exploration: its slug, or its folder')
    .argument('<slug>', 'the new prototype slug (never an existing prototype)')
    .option('--variant <id>', 'promote one of the exploration variants (v1..v8) instead')
    .option('--no-install', 'skip pnpm install after generating')
    .action(def('quick promote', quickPromoteCommand));
  return quick;
}
