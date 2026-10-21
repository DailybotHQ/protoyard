import type { Command } from 'commander';
import type { Handler } from '../../lib/command.ts';
import { quickExportCommand } from './export.ts';
import { quickIterateCommand, quickUndoCommand } from './iterate.ts';
import { quickIndexCommand, quickListCommand, quickOpenCommand } from './list.ts';
import { quickPromoteCommand } from './promote.ts';
import { quickReportCommand } from './report.ts';
import { quickServeCommand } from './serve.ts';
import { quickShotCommand, quickWithScreenshotCommand } from './shot.ts';

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
    .option('--screenshot', 'also capture PNGs at 1280x800 (needs Playwright; skipped without it)')
    .option('--phone', 'with --screenshot: also capture a 390x844 phone size')
    .action(def('quick', quickWithScreenshotCommand));
  quick
    .command('serve')
    .description('serve an exploration on 127.0.0.1 until Ctrl+C (player needs http, not file://)')
    .argument('<target>', 'the exploration: its slug, or the folder `protoyard quick` printed')
    .option('--port <port>', 'first port to try (default 4180; a busy port falls back to the next)')
    .option('--strict-port', 'fail instead of falling back when the port is busy')
    .option('--open', 'open the exploration in the default browser')
    .action(def('quick serve', quickServeCommand));
  quick
    .command('shot')
    .description('capture a PNG of an exploration and each variant at 1280x800 (needs Playwright)')
    .argument('<target>', 'the exploration: its slug, or its folder')
    .option('--phone', 'also capture a 390x844 phone size')
    .action(def('quick shot', quickShotCommand));
  quick
    .command('export')
    .description(
      'export an exploration as one self-contained HTML file, or pack it as a Claude artifact page'
    )
    .argument('<target>', 'the exploration: its slug, or its folder')
    .option('--single-file', 'inline the player and the blueprint into one HTML file')
    .option(
      '--target <target>',
      'artifact: pack the single file as a Claude artifact page in <exploration>/artifact/ (never publishes)'
    )
    .option(
      '--url <url>',
      'with --target artifact: record the URL the Artifact tool returned in quick.json'
    )
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
  quick
    .command('iterate')
    .description('change an exploration with an RFC 6902 JSON Patch, atomically, with undo history')
    .argument('<target>', 'the exploration: its slug, or its folder')
    .option('--patch <file>', 'the JSON Patch file, or - to read it from stdin (512 KB at most)')
    .option(
      '--allow-drop',
      'accept a patch that drops entities or fields (the world loses that data)'
    )
    .action(def('quick iterate', quickIterateCommand));
  quick
    .command('undo')
    .description('restore the blueprint from before the last `quick iterate`, byte for byte')
    .argument('<target>', 'the exploration: its slug, or its folder')
    .action(def('quick undo', quickUndoCommand));
  quick
    .command('report')
    .description(
      'aggregate validation sessions per variant and task into report.json and REPORT.md'
    )
    .argument('<target>', 'the exploration: its slug, or its folder')
    .option(
      '--import <files...>',
      'protoyard-validation-metrics files the player downloaded (kept in <exploration>/metrics/)'
    )
    .action(def('quick report', quickReportCommand));
  quick
    .command('list')
    .description('list the explorations in the quick zone (marked folders only), newest first')
    .action(def('quick list', quickListCommand));
  quick
    .command('open')
    .description('serve an exploration on 127.0.0.1 and open it in the browser, by slug')
    .argument('<slug>', 'the exploration slug (see `protoyard quick list`)')
    .option('--port <port>', 'first port to try (default 4180; a busy port falls back to the next)')
    .option('--strict-port', 'fail instead of falling back when the port is busy')
    .action(def('quick open', quickOpenCommand));
  quick
    .command('index')
    .description('write a static index.html in the quick zone linking every exploration')
    .action(def('quick index', quickIndexCommand));
  return quick;
}
