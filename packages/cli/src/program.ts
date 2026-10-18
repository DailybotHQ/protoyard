import { Command, CommanderError, Option } from 'commander';
import { affectedCommand } from './commands/affected.ts';
import { budgetCommand } from './commands/budget.ts';
import { buildCommand } from './commands/build.ts';
import { ciCheckCommand, ciInitCommand } from './commands/ci.ts';
import { devCommand } from './commands/dev.ts';
import { doctorCommand } from './commands/doctor.ts';
import { exportCommand } from './commands/export.ts';
import { indexCommand } from './commands/index-cmd.ts';
import { listCommand } from './commands/list.ts';
import { newCommand } from './commands/new.ts';
import { previewCommand } from './commands/preview.ts';
import { publishCommand } from './commands/publish.ts';
import { reviewIndexCommand } from './commands/review-index.ts';
import {
  scenarioBenchCommand,
  scenarioListCommand,
  scenarioValidateCommand,
} from './commands/scenario.ts';
import { controlServerCommand, galleryCommand } from './commands/serve.ts';
import { showcaseCommand } from './commands/showcase.ts';
import { snapshotListCommand } from './commands/snapshot.ts';
import {
  themeCreateCommand,
  themeExportCommand,
  themeImportCommand,
  themeListCommand,
} from './commands/theme.ts';
import { validateCommand } from './commands/validate.ts';
import { action, type RunnerEnv } from './lib/command.ts';
import { CliError, ExitCode, errorEnvelope, processStreams } from './lib/output.ts';
import { CLI_VERSION } from './lib/workspace.ts';
import { PROVIDER_IDS } from './publish/index.ts';

const EXAMPLES = `
Examples:
  $ pnpm protoyard list --kind template
  $ pnpm protoyard new my-crm --template blank --name "My CRM"
  $ pnpm protoyard dev my-crm --host
  $ pnpm protoyard validate my-crm --build
  $ pnpm protoyard export my-crm --base ./
  $ pnpm protoyard publish my-crm --provider cloudflare --dry-run
  $ pnpm protoyard publish --all --provider cloudflare --dry-run
  $ pnpm protoyard affected --since HEAD~1 --format csv
  $ pnpm protoyard ci init --with check,build --dry-run
  $ pnpm protoyard list --json | jq '.data.entries[].slug'

Every command accepts --json and returns { ok, command, data?, error? }.
Exit codes: 0 ok · 1 failure · 2 usage · 3 not found · 4 validation · 5 provider/auth.`;

export function createProgram(env: RunnerEnv): Command {
  const streams = env.streams ?? processStreams;
  const program = new Command('protoyard')
    .description('Build prototypes that feel real. Real behavior. Fake infrastructure.')
    .version(CLI_VERSION, '-v, --version')
    .option('--json', 'machine-readable output: one JSON envelope on stdout')
    .option('-y, --yes', 'never prompt; accept documented defaults (implied by CI=1)')
    .option('--cwd <dir>', 'run as if started in <dir>')
    .option(
      '--root <dir>',
      'workspace root (default: nearest pnpm-workspace.yaml; env PROTOYARD_ROOT)'
    )
    .option('-q, --quiet', 'only print essential output')
    .option('--no-color', 'disable colors (also NO_COLOR=1)')
    .showHelpAfterError('(run with --help for usage)')
    .configureOutput({
      writeOut: (s) => streams.stdout(s),
      writeErr: (s) => streams.stderr(s),
    })
    .addHelpText('after', EXAMPLES);

  const def = (name: string, handler: Parameters<typeof action>[1]) => action(name, handler, env);

  program
    .command('doctor')
    .description(
      'check Node, pnpm, dependencies, layout, templates, git, Playwright and provider CLIs'
    )
    .option('--offline', 'skip provider authentication checks (no network)')
    .action(def('doctor', doctorCommand));

  program
    .command('list')
    .description('list prototypes and templates from the registry')
    .addOption(
      new Option('--kind <kind>', 'prototype, template or all')
        .choices(['prototype', 'template', 'all'])
        .default('all')
    )
    .option('--tag <tag>', 'only entries with this tag')
    .option('--category <category>', 'only this category')
    .option('--platform <platform>', 'desktop, mobile or responsive')
    .option('--search <text>', 'match name, slug, description, tags…')
    .addOption(
      new Option('--sort <field>', 'name or modified').choices(['name', 'modified']).default('name')
    )
    .action(def('list', listCommand));

  program
    .command('index')
    .description('scan protoyard.json manifests (no code runs) and write .protoyard/registry.json')
    .option('--force', 'ignore the incremental cache')
    .action(def('index', indexCommand));

  program
    .command('affected')
    .description(
      'list prototype slugs affected by changes since a git ref (for selective CI builds)'
    )
    .requiredOption(
      '--since <ref>',
      'git ref to diff against (left side of <ref>...HEAD), e.g. HEAD~1 or origin/main'
    )
    .addOption(
      new Option('--format <fmt>', 'text summary or bare csv of slugs for shell use')
        .choices(['text', 'csv'])
        .default('text')
    )
    .action(def('affected', affectedCommand));

  program
    .command('new')
    .description('create prototypes/<slug> from a template')
    .argument('<slug>', 'lowercase kebab-case folder name')
    .requiredOption('-t, --template <name>', 'template to copy (see `list --kind template`)')
    .option('--name <name>', 'display name (default: from the slug)')
    .option('--description <text>', 'one-line description')
    .option('--force', 'reuse an EXISTING EMPTY folder (never overwrites files)')
    .option('--no-install', 'skip `pnpm install` (link the package later)')
    .action(def('new', newCommand));

  program
    .command('dev')
    .description("start ONLY that prototype's Vite dev server")
    .argument('<slug>')
    .option('-p, --port <port>', 'preferred port (the next free one is used if busy)', '5173')
    .option('--host', 'listen on the LAN and print a URL for phones')
    .action(def('dev', devCommand));

  program
    .command('validate')
    .description('check manifest, folder contract, package, scenarios, schema version and types')
    .argument('<slug>')
    .option('--skip-typecheck', 'skip svelte-check')
    .option('--build', 'also run a production build')
    .action(def('validate', validateCommand));

  const buildOptions = (cmd: Command) =>
    cmd
      .option('--base <path>', 'public base: ./ (relocatable, default) or /sub/path/')
      .option('--include-devtools', 'ship the DevTools panel in the build')
      .option('--offline', 'add the opt-in offline service worker (sets PROTOYARD_OFFLINE=1)');

  buildOptions(
    program
      .command('build')
      .description('production build of one prototype (or --all) into artifacts/<slug>/dist')
      .argument('[slug]')
      .option('--all', 'build every prototype sequentially')
      .option(
        '--out <dir>',
        'custom output folder: under artifacts/ or tmp/, or a new/empty folder'
      )
      .option(
        '--allow-external-out',
        'permit an --out outside the workspace (must be new or empty)'
      )
  ).action(def('build', buildCommand));

  program
    .command('budget')
    .description('check initial JavaScript and CSS bundle sizes against configured budgets')
    .argument('[slug]', 'prototype slug (or use --all)')
    .option('--all', 'check every prototype sequentially')
    .option('--skip-build', 'read the existing build-manifest.json')
    .action(def('budget', budgetCommand));

  const ci = program.command('ci').description('scaffold and manage CI workflow templates');
  ci.command('init')
    .description(
      'render versioned workflow templates into .github/workflows/ (never changes repository settings)'
    )
    .addOption(new Option('--provider <id>', 'CI host').choices(['github']).default('github'))
    .option(
      '--with <list>',
      'comma-separated workflows: check,build,e2e,preview (default check,build)',
      'check,build'
    )
    .option('--deploy <target>', 'preview deploy target (sets {{PROVIDER}}; cloudflare)')
    .option(
      '--prototypes <csv>',
      'comma-separated prototype slugs for {{PROTOTYPES}} (default: all indexed prototypes)'
    )
    .option('--dry-run', 'print paths and unified diffs; write nothing')
    .option('--force', 'overwrite existing workflow files')
    .action(def('ci init', ciInitCommand));
  ci.command('check')
    .description(
      'report scaffolded workflows that are outdated or edited since `ci init` (reads only)'
    )
    .addOption(new Option('--provider <id>', 'CI host').choices(['github']).default('github'))
    .option('--strict', 'exit 4 when any workflow drifted')
    .action(def('ci check', ciCheckCommand));

  buildOptions(
    program
      .command('export')
      .description('build and zip a prototype into artifacts/<slug>/<slug>.zip')
      .argument('<slug>')
      .option('--skip-build', 'zip the existing build (verified against build-manifest.json)')
  ).action(def('export', exportCommand));

  program
    .command('preview')
    .description('serve artifacts/<slug>/dist like a static host (SPA fallback)')
    .argument('<slug>')
    .option('-p, --port <port>', 'preferred port', '4173')
    .option('--strict-port', 'fail instead of picking another port')
    .option('--host', 'listen on the LAN')
    .action(def('preview', previewCommand));

  buildOptions(
    program
      .command('publish')
      .description('build, verify and deploy one or many prototypes to a static host')
      .argument('[slugs...]', 'one or more prototypes (or use --all / --tag)')
      .option('--all', 'every prototype, one after another')
      .option('--tag <tag>', 'every prototype with this tag')
      .addOption(
        new Option('--provider <id>', 'hosting provider (required unless --history)').choices([
          ...PROVIDER_IDS,
        ])
      )
      .option('--history', 'print the last recorded publishes (artifacts/publish/ledger.jsonl)')
      .option('--limit <n>', 'with --history: how many entries (default 20)')
      .option('--project <name>', 'provider project/site name (default protoyard-<slug>)')
      .option('--branch <name>', 'Cloudflare preview branch (lowercase letters, digits and dashes)')
      .option('--preview', 'preview deployment (default)')
      .option('--production', 'production deployment (requires --yes)')
      .option('--dry-run', 'build and verify, print the exact command, contact no provider')
      .option(
        '--ensure-project',
        'Cloudflare: create the Pages project when missing (shown on dry-run; run on real publish)'
      )
  ).action(def('publish', publishCommand));

  const scenario = program.command('scenario').description("inspect a prototype's scenarios");
  scenario
    .command('list')
    .argument('<slug>')
    .option('--details', 'load names/groups/seeds from src/prototype.ts (runs local code)')
    .action(def('scenario list', scenarioListCommand));
  scenario
    .command('validate')
    .description(
      'run the generator for every scenario and check referential integrity (runs local code)'
    )
    .argument('<slug>')
    .option('-s, --scenario <id>', 'only this scenario')
    .action(def('scenario validate', scenarioValidateCommand));
  scenario
    .command('bench')
    .description('benchmark generation and integrity validation for one or all scenarios')
    .argument('<slug>')
    .option('-s, --scenario <id>', 'only this scenario')
    .option('--runs <count>', 'runs per scenario', '3')
    .option('--check', 'fail when median generation plus validation exceeds the budget')
    .action(def('scenario bench', scenarioBenchCommand));

  const theme = program.command('theme').description('create, list, export and import themes');
  theme
    .command('list')
    .description('list built-in and library themes')
    .action(def('theme list', themeListCommand));
  theme
    .command('create')
    .description('write a typed theme into a prototype from a seed or JSON file')
    .argument('<slug>', 'prototype slug')
    .option('--id <id>', 'theme id (lowercase kebab-case; required with --seed)')
    .option('--name <name>', 'theme display name')
    .option('--seed <hex>', 'brand color seed (#rgb or #rrggbb)')
    .option('--secondary <hex>', 'optional secondary brand color')
    .option('--from <file>', 'theme JSON file to import')
    .option('--force', 'overwrite src/theme.ts')
    .option('--dry-run', 'show the generated file without writing')
    .action(def('theme create', themeCreateCommand));
  theme
    .command('export')
    .description('export a theme as CSS variables, Tailwind tokens or W3C design tokens')
    .argument('[id]', 'built-in or library theme id; use --from for custom JSON themes')
    .option('--from <file>', 'custom theme JSON file')
    .addOption(
      new Option('--format <format>', 'css, tailwind or tokens')
        .choices(['css', 'tailwind', 'tokens'])
        .default('css')
    )
    .action(def('theme export', themeExportCommand));
  theme
    .command('import')
    .description('write a validated JSON theme into a prototype')
    .argument('<slug>', 'prototype slug')
    .argument('<file>', 'path to a theme JSON file')
    .option('--force', 'overwrite src/theme.ts')
    .option('--dry-run', 'show the generated file without writing')
    .action(def('theme import', themeImportCommand));

  const snapshot = program
    .command('snapshot')
    .description('snapshot files committed with a prototype');
  snapshot.command('list').argument('<slug>').action(def('snapshot list', snapshotListCommand));

  program
    .command('review-index')
    .description(
      'one static page for reviewers: every published prototype with scenario and persona links'
    )
    .option('--out <dir>', 'output folder (default artifacts/review)')
    .option('--allow-external-out', 'permit an --out outside the workspace (must be new or empty)')
    .option('--from-ledger', 'only prototypes with a recorded real deploy')
    .option('--slugs <list>', 'only these prototypes (comma-separated)')
    .option('--base <path>', "public base of the review page ('./' or /sub/path/)")
    .option('--title <text>', 'page title (default "Prototype review")')
    .option('--publish <provider>', 'publish the review site with cloudflare, netlify or vercel')
    .option('--project <name>', 'provider project name (default protoyard-review)')
    .option('--dry-run', 'print the provider command without contacting or deploying')
    .option('--production', 'deploy to the provider production target (requires --yes)')
    .option(
      '--provider <id>',
      'provider named in the publish command for undeployed prototypes (default cloudflare)'
    )
    .option('--no-personas', 'skip persona links (they run each generator in a child process)')
    .option('--ledger <file>', 'read this deploy ledger instead of artifacts/publish/ledger.jsonl')
    .option('--serve', 'serve the page on 127.0.0.1 after writing it')
    .option('--port <n>', 'with --serve: port (default 4520, or the next free one)')
    .option('--strict-port', 'with --serve: fail instead of picking another port')
    .action(def('review-index', reviewIndexCommand));

  program
    .command('showcase')
    .description('ONE static site: the gallery + every prototype build at <base>p/<slug>/app/')
    .option('--out <dir>', 'output folder', 'artifacts/showcase')
    .option(
      '--allow-external-out',
      'permit an --out outside the workspace (must be new, empty or a previous showcase)'
    )
    .option('--base <path>', 'absolute public base of the site', '/')
    .option('--no-devtools', 'leave the DevTools panel out of the bundled prototypes')
    .option('--include-templates', 'also bundle templates at <base>t/<name>/app/')
    .option('--offline', 'build every bundled prototype with the offline service worker')
    .option('--publish <provider>', 'publish the completed showcase (Cloudflare Pages only)')
    .option('--project <name>', 'Cloudflare Pages project (default protoyard-showcase)')
    .option('--branch <name>', 'Cloudflare Pages preview branch')
    .option('--dry-run', 'print the Cloudflare command without contacting the provider')
    .option('--serve', 'serve the site after building (multi-page, 404.html fallback)')
    .option('--skip-build', 'with --serve: serve the existing showcase')
    .option('-p, --port <port>', 'port for --serve', '4500')
    .option('--strict-port', 'fail instead of picking another port')
    .option('--host', 'listen on the LAN')
    .action(def('showcase', showcaseCommand));

  program
    .command('gallery')
    .description('index, start the control server and run the gallery (what `pnpm dev` runs)')
    .option('-p, --port <port>', 'gallery port', '4321')
    .option('--control-port <port>', 'control server port', '4300')
    .option('--allow-origin <origins>', 'extra comma-separated origins for the control API')
    .action(def('gallery', galleryCommand));

  program
    .command('control-server')
    .description('only the local control API (127.0.0.1) the gallery uses to start dev servers')
    .option('-p, --port <port>', 'port', '4300')
    .option('--gallery-port <port>', 'gallery port allowed as Origin', '4321')
    .option('--allow-origin <origins>', 'extra comma-separated allowed origins')
    .action(def('control-server', controlServerCommand));

  return program;
}

/**
 * Parses argv and runs. Commander's own usage errors (unknown option, missing
 * argument) become exit code 2 and, with --json, an error envelope.
 */
export async function runCli(argv: readonly string[], env: RunnerEnv): Promise<void> {
  const streams = env.streams ?? processStreams;
  const program = createProgram(env);
  const wantsJson = argv.includes('--json');
  program.exitOverride();
  for (const cmd of allCommands(program)) cmd.exitOverride();
  if (wantsJson) {
    program.configureOutput({ writeOut: (s) => streams.stdout(s), writeErr: () => {} });
    for (const cmd of allCommands(program))
      cmd.configureOutput({ writeOut: (s) => streams.stdout(s), writeErr: () => {} });
  }
  try {
    await program.parseAsync([...argv], { from: 'user' });
  } catch (error) {
    if (error instanceof CommanderError) {
      // help / version are "errors" in commander's exitOverride model.
      if (
        error.code === 'commander.helpDisplayed' ||
        error.code === 'commander.version' ||
        error.code === 'commander.help'
      ) {
        env.setExitCode(ExitCode.Ok);
        return;
      }
      if (wantsJson) {
        const command = argv.find((a) => !a.startsWith('-')) ?? 'protoyard';
        const envelope = errorEnvelope(
          command,
          new CliError('usage', error.message.replace(/^error: /, ''))
        );
        streams.stdout(`${JSON.stringify(envelope, null, 2)}\n`);
      }
      env.setExitCode(ExitCode.Usage);
      return;
    }
    throw error;
  }
}

function allCommands(command: Command): Command[] {
  return command.commands.flatMap((c) => [c, ...allCommands(c)]);
}
