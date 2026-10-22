/**
 * What the site says Protoyard does: the feature areas on the home page and
 * /features/, and the measured numbers /features/ cites. Data only, so tests
 * can hold every claim to the guides (each area links a published guide, and
 * each number quotes its source doc verbatim).
 */

export interface FeatureArea {
  id: string;
  title: string;
  /** One sentence for the home page card. */
  summary: string;
  /** The longer story on /features/. */
  points: readonly string[];
  /** The /docs/<slug>/ guides that document it (the first is the card's link). */
  guides: readonly { slug: string; label: string }[];
}

export const FEATURE_AREAS: readonly FeatureArea[] = [
  {
    id: 'quick',
    title: 'From a brief to a playable app',
    summary:
      '`protoyard quick` turns a sentence into a running exploration in about 1.5 s, with variants to compare side by side.',
    points: [
      '`quick "<brief>" --variants 3` writes a disposable exploration plus deterministic variants and a compare page.',
      '`quick serve` plays it on 127.0.0.1, and `quick iterate --patch` changes the blueprint with a JSON Patch while the open tab live-reloads with its data kept. `quick undo` takes a change back.',
      '`quick feedback` gathers reviewers’ comments into REVIEW.md, `quick report` turns timed validation sessions into REPORT.md, and `quick shot` captures PNGs.',
      '`quick promote` turns the keeper into a full prototype.',
    ],
    guides: [{ slug: 'quick', label: 'Quick explorations guide' }],
  },
  {
    id: 'player',
    title: 'A player with nothing to install',
    summary:
      'Open a blueprint from a share link, a file or a pasted document. No build, and each blueprint keeps its own browser storage.',
    points: [
      'Share links carry the whole blueprint in the URL fragment, so it is never sent to a server.',
      'An embedding page can load or replace the blueprint over a strict, origin-checked postMessage protocol (`connectPlayer`).',
      'Installed from a secure origin, the player works offline after one visit.',
      'Every blueprint gets its own content-derived IndexedDB namespace, so two blueprints never share data.',
    ],
    guides: [{ slug: 'player', label: 'Player guide' }],
  },
  {
    id: 'content',
    title: 'Slide decks, landing pages and documents',
    summary:
      'Ask for a deck on any topic and get slides you can click through, present and share: designed layouts, live charts and interactive blocks, from one JSON file.',
    points: [
      '`quick "<topic>" --kind deck` writes a deck from a sentence, offline; `--kind page` and `--kind doc` do the same for a landing page or a document.',
      '21 designed slide layouts with large display type, per-deck themes, fonts and gradient backgrounds. Slides fit and center at any screen size, and content reveals step by step.',
      'A presenter view with the next slide and notes, an overview grid, print to PDF, and Deck Studio to restyle a deck live.',
      'Interactive blocks work in the slide itself: polls, quizzes, a what-if calculator, explorable charts with a data table, and a working app embedded in a slide.',
      'Landing pages have a hero, pricing, steps and forms that store responses; documents have a reading layout with one table of contents.',
      'Every kind runs at both levels: instantly in the player from a share link, or as a full prototype from `protoyard generate`. Links, single-file exports and private Claude artifacts work for all of them.',
    ],
    guides: [
      { slug: 'decks', label: 'Decks guide' },
      { slug: 'pages', label: 'Pages and documents guide' },
      { slug: 'blocks', label: 'Blocks guide' },
      { slug: 'kinds', label: 'Blueprint kinds guide' },
    ],
  },
  {
    id: 'prototypes',
    title: 'Full prototypes from blueprints',
    summary:
      'When an idea is worth keeping, generate a real Vite + Svelte 5 app from its data-only blueprint, or start from a template.',
    points: [
      'Two levels: the player runs a blueprint with no build or generated code; `protoyard generate` writes a full app in prototypes/<slug>/ with its own code and tests.',
      'Both render the blueprint through the same app model, so moving between levels keeps entities, screens and scenarios. `quick promote` moves an exploration up; Open in player on a gallery entry moves it down.',
      '`blueprint new --from-brief` turns prose into a validated blueprint offline, with no model call; 27 templates and 40 catalog blueprints are ready to start from.',
      'Every prototype carries an AGENTS.md and docs/ spec whose generated regions stay in sync with the code.',
    ],
    guides: [
      { slug: 'generator', label: 'Generator guide' },
      { slug: 'brief_to_prototype', label: 'Brief to prototype guide' },
      { slug: 'specs', label: 'Specs guide' },
      { slug: 'quickstart', label: 'Quickstart' },
    ],
  },
  {
    id: 'engine',
    title: 'Real behavior, fake infrastructure',
    summary:
      'A persistent browser database, deterministic scenarios, personas and simulated time, all under an in-app DevTools panel.',
    points: [
      'IndexedDB through Dexie: typed tables, migrations, transactions and live queries that survive reloads.',
      'Deterministic scenarios: the same seed rebuilds the same world, from an empty workspace to a dense, busy one.',
      'Personas and roles enforced in services, not just hidden in the UI; simulated time, offline mode, latency and errors.',
      'DevTools switch scenario, persona, time, environment and theme, and save or restore snapshots.',
    ],
    guides: [
      { slug: 'scenarios', label: 'Scenarios guide' },
      { slug: 'database', label: 'Database guide' },
    ],
  },
  {
    id: 'kits',
    title: 'Kits beyond CRUD',
    summary:
      'Themes, layouts and device shells, plus rich views, charts, analytics, SaaS flows and scripted AI assistants.',
    points: [
      'A 64-theme library on top of six built-in themes, twelve shared page layouts, and device and host shells.',
      'Rich views: board, calendar, timeline, a virtualized data grid, trees, an offline map, files and activity.',
      'Charts and an analytics kit with KPIs, funnels, cohorts and an editable dashboard over deterministic events.',
      'Simulated SaaS flows (sign-in, phone sign-up, SSO, MFA, onboarding, billing), scripted AI assistants and agents with no model API, and 175 portraits of fictional people.',
      'A workflow editor with simulated runs, gamification (points, levels, badges, missions and streaks), a rich text editor and a command palette.',
    ],
    guides: [
      { slug: 'themes', label: 'Themes guide' },
      { slug: 'layouts', label: 'Layouts guide' },
      { slug: 'shells', label: 'Shells guide' },
      { slug: 'views', label: 'Views guide' },
      { slug: 'charts', label: 'Charts guide' },
      { slug: 'analytics', label: 'Analytics guide' },
      { slug: 'saas_kits', label: 'SaaS kits guide' },
      { slug: 'ai_kits', label: 'AI kits guide' },
      { slug: 'avatars', label: 'Avatars guide' },
    ],
  },
  {
    id: 'review',
    title: 'Review comments',
    summary:
      'Reviewers pin comments to screens of a built prototype or a served exploration; an agent can plan from the result.',
    points: [
      'Comments are opt-in and anchored to the element they describe, with threads, resolve and reopen.',
      'They are stored locally, on Cloudflare Pages, on your own endpoint, or in a Claude artifact.',
      '`comments pull` (and `quick feedback` for explorations) turns them into a REVIEW.md.',
    ],
    guides: [{ slug: 'review_comments', label: 'Review comments guide' }],
  },
  {
    id: 'share',
    title: 'Export, publish and share',
    summary:
      'A relocatable static export, a single HTML file, a private Claude artifact, or a deploy through the publish adapters.',
    points: [
      '`protoyard export` builds a static site and a ZIP with checksums, plus an isolation check that no other prototype leaked in.',
      '`quick export --single-file` inlines the player and the blueprint into one HTML file.',
      '`export --target artifact` packs one prototype for a private Claude artifact and checks every artifact rule.',
      '`protoyard publish` deploys to Cloudflare Pages with a true --dry-run; the Netlify and Vercel adapters are experimental.',
    ],
    guides: [{ slug: 'publishing', label: 'Publishing guide' }],
  },
  {
    id: 'agents',
    title: 'Built for coding agents',
    summary:
      'A distributable agent skill, a local MCP server, a DeepWorkPlan addon and a versioned machine interface.',
    points: [
      'The protoyard agent skill routes an agent through quick exploration, full prototypes, iteration, review, export and publishing.',
      '`protoyard mcp` is a local stdio MCP server over a fixed set of CLI operations; there is no hosted endpoint.',
      'The DeepWorkPlan addon packet lets a plan turn an idea into explorations, compare them and record the decision with evidence.',
      'Every CLI command takes --json, and `--version --json` and `doctor --json` expose a versioned machine interface.',
    ],
    guides: [
      { slug: 'skill', label: 'Agent skill guide' },
      { slug: 'mcp', label: 'MCP guide' },
      { slug: 'dwp', label: 'DeepWorkPlan guide' },
      { slug: 'interface', label: 'Machine interface guide' },
      { slug: 'agent_guide', label: 'Agent guide' },
    ],
  },
  {
    id: 'packages',
    title: 'Packages',
    summary:
      'Every library is a publish-ready npm package with typed ESM exports. Not on npm yet: today you run Protoyard from its repository.',
    points: [
      'The packages build to dist/ with types, lint clean as packed tarballs, and install in a clean consumer project.',
      'No version has been published to npm yet; `npm create protoyard` comes with the first release.',
    ],
    guides: [{ slug: 'packages', label: 'Packages guide' }],
  },
];

/** Guides /features/ links outside the areas (its honest-boundaries section). */
export const EXTRA_GUIDES: readonly { slug: string; label: string }[] = [
  { slug: 'security', label: 'Security guide' },
  { slug: 'accessibility', label: 'Accessibility guide' },
];

export interface MeasuredNumber {
  label: string;
  value: string;
  /** The guide that publishes it (`docs/<doc>`) and a heading anchor there. */
  doc: string;
  anchor: string;
  /** Text that appears verbatim in that guide, so the number stays sourced. */
  quote: string;
}

export const MEASURED_NUMBERS: readonly MeasuredNumber[] = [
  {
    label: 'Brief → playable exploration (`quick`, no build)',
    value: '1,527 ms median',
    doc: 'QUICK.md',
    anchor: 'measured-numbers',
    quote: '1,527 ms median (1,515–1,583 ms)',
  },
  {
    label: 'Second exploration (shared player reused)',
    value: '987 ms',
    doc: 'QUICK.md',
    anchor: 'measured-numbers',
    quote: '| Second exploration (shared player reused) | 987 ms |',
  },
  {
    label: 'Player initial JavaScript',
    value: '178.8 KB gzip',
    doc: 'QUICK.md',
    anchor: 'measured-numbers',
    quote: '| Player initial JS | 178.8 KB gzip in 27 files |',
  },
  {
    label: 'Player, first visit from a share link (crm blueprint)',
    value: '190 ms to ready',
    doc: 'PERFORMANCE.md',
    anchor: 'player-blueprint-to-ready-app-baseline-measured-2026-10-20',
    quote: '| crm | `#bp=` 1,902 chars | 190 ms (175 ms) | 99 ms | 58 ms | 9.2 ms |',
  },
  {
    label: 'Built prototype, first screen in a fresh browser (crm-demo)',
    value: '115 ms median',
    doc: 'PERFORMANCE.md',
    anchor: 'cold-start-built-prototypes',
    quote: '| `crm-demo` | **115 ms** (95 ms) |',
  },
  {
    label: 'Data grid, first render of 100,000 rows',
    value: '94 ms, 0 long tasks while scrolling',
    doc: 'PERFORMANCE.md',
    anchor: 'data-grid-at-100000-rows',
    quote: '| First render, 100,000 rows | **94 ms** (93–102 ms) | ≤ 500 ms |',
  },
  {
    label: 'Initial JavaScript of every built prototype',
    value: '≤ 250 KB gzip (budget passed for all 12)',
    doc: 'PERFORMANCE.md',
    anchor: 'views-kit',
    quote: '(initial JS ≤ 250 KB gzip each)',
  },
];

/** Where the numbers were measured, as the guides state it. */
export const MEASURED_ON =
  'Measured on an Apple M1 Max, often under load from other builds; numbers move with the machine and the load.';
