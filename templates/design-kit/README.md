# Design Kit

A working starting point for a product design system. It includes foundation pages, a searchable component catalog, source-derived prop tables, responsive demos, and local review status and notes.

Create a kit and start it with:

```bash
pnpm protoyard new my-kit --template design-kit
pnpm protoyard dev my-kit
```

## Included

- Foundation pages for color, typography, shape, motion, icons, brand and responsive behavior. Color swatches choose dark or light foreground ink from their luminance.
- Searchable component entries grouped by purpose. Each preview is loaded on demand, with desktop and phone frames shown together.
- Prop rows are extracted from `@prop name: type — description` comments in each demo's Svelte source. Add those comments to keep the table next to the component implementation.
- Review status and notes are saved per entry and active persona in IndexedDB. Review writes go through a permission checked service and remain local to this prototype.
- No remote media, font downloads or runtime network requests. Replace the sample palette and components with your own system.

## Extend the catalog

Add an entry to `src/catalog/entries.ts` and a matching Svelte file under `src/demos/components/`. The demo registry imports each file lazily. Put `@prop` annotations in the Svelte source to populate its API table. Search covers the name, group and summary.

Review writes in `src/domain/reviews.ts` follow the runtime path: permission assertion, input validation, simulated environment, then a Dexie transaction. Add a database migration if the review record shape changes after users have data.

## Validate

```bash
pnpm vitest run templates/design-kit
pnpm --filter @protoyard-template/design-kit typecheck
pnpm --filter @protoyard-template/design-kit build
```

The seeded designer can update reviews. The read-only stakeholder scenario can browse the catalog but cannot save review changes.
