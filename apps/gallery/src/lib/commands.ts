/** Terminal commands shown in the gallery — the same ones the CLI documents. */

export function devCommand(slug: string) {
  return `pnpm protoyard dev ${slug}`;
}

export function commandsFor(slug: string) {
  return [
    { label: 'Run it (dev server, live reload)', command: devCommand(slug) },
    { label: 'Open on your phone (same Wi-Fi)', command: `pnpm protoyard dev ${slug} --host` },
    { label: 'Check it', command: `pnpm protoyard validate ${slug}` },
    { label: 'Static build', command: `pnpm protoyard build ${slug}` },
    { label: 'Portable ZIP', command: `pnpm protoyard export ${slug}` },
    { label: 'Serve the build locally', command: `pnpm protoyard preview ${slug}` },
    {
      label: 'Publish (dry run first)',
      command: `pnpm protoyard publish ${slug} --provider cloudflare --dry-run`,
    },
  ];
}

export function newCommand(input: {
  slug: string;
  template: string;
  name?: string;
  description?: string;
}) {
  const parts = [
    'pnpm protoyard new',
    input.slug || '<slug>',
    '--template',
    input.template || '<template>',
  ];
  if (input.name?.trim()) parts.push('--name', shellQuote(input.name.trim()));
  if (input.description?.trim()) parts.push('--description', shellQuote(input.description.trim()));
  return parts.join(' ');
}

/** POSIX single-quote quoting so a copied command is safe to paste. */
export function shellQuote(value: string): string {
  return /^[\w@%+=:,./-]+$/.test(value) ? value : `'${value.replace(/'/g, `'\\''`)}'`;
}

export function agentPrompt(input: { slug: string; template: string; idea: string }) {
  const slug = input.slug || '<slug>';
  const template = input.template || '<template>';
  const idea = input.idea.trim() || '<describe the product, its users and the key flows>';
  return [
    `Create a new Protoyard prototype in this repository.`,
    ``,
    `1. Run: pnpm protoyard new ${slug} --template ${template}`,
    `2. Read prototypes/${slug}/src/prototype.ts first, then AGENTS.md for the rules.`,
    `3. Build this idea: ${idea}`,
    `4. Model the domain in src/database/schema.ts, write services in src/domain/ that`,
    `   validate input, check permissions with session.assert() and run inside`,
    `   environment.run() and a transaction.`,
    `5. Add scenarios (lifecycle, roles, empty/dense data, offline) in src/scenarios/ and`,
    `   keep generators deterministic (ctx.rng, ctx.faker, ctx.ids, ctx.time — never Math.random/Date.now).`,
    `6. Verify: pnpm protoyard validate ${slug} && pnpm protoyard scenario validate ${slug} && pnpm protoyard build ${slug}`,
  ].join('\n');
}
