# Customize: theme, tokens and component hooks

Back to [`../SKILL.md`](../SKILL.md).

Change as little as possible, from the outside in.

## 1. Pick a theme

`texuli theme list` searches about 210 themes. `texuli theme preview <id>`
prints the key tokens and the WCAG AA report for light or dark. `texuli theme
apply <id>` switches the app's stylesheet and `data-tx-theme`. Choose a theme
whose report passes.

## 2. Override tokens

Components read `--tx-*` custom properties. Theme rules live in
`@layer tx.base`, so a plain rule in the app wins:

```css
:root[data-tx-theme] {
  --tx-radius: 0.25rem;
  --tx-font-sans: 'Inter', system-ui, sans-serif;
}

[data-tx-mode='dark'] {
  --tx-ring: #8ab4ff;
}
```

Re-check contrast after changing any color token (`texuli theme preview`
reports the theme's own pairs, not your overrides).

## 3. Style one component through its hooks

Component styles live in `@layer tx.components`. Unlayered app CSS beats
them, and every component exposes stable hooks:
- a `class` prop, merged with Texuli's classes through `cx`;
- `data-tx-<component>` on its root;
- `data-variant` and `data-size` where it has variants.

```svelte
<script lang="ts">
  import { Button } from 'texuli/button';
</script>

<Button class="checkout" variant="default" size="lg">Pay now</Button>

<style>
  :global([data-tx-button][data-variant='default'].checkout) {
    min-inline-size: 12rem;
    border-radius: var(--tx-radius);
  }
</style>
```

Use logical properties (`inline-size`, `padding-inline`), and keep focus
styles visible.

## 4. Build variants of your own

Compose classes with Texuli's helpers, never `clsx` or `tailwind-merge`:

```ts
import { cx, variants } from 'texuli/cx';

const tag = variants({
  base: 'app-tag',
  variants: { tone: { info: 'app-tag--info', warn: 'app-tag--warn' } },
  defaultVariants: { tone: 'info' },
});

export const tagClass = (tone: 'info' | 'warn', extra?: string) => cx(tag({ tone }), extra);
```

## 5. Edit a copy (last resort)

When markup or behavior must change, copy the component with `texuli add`
and edit the copy. Keep the provenance block. Keep the changes small and
local, so `texuli update` can merge Texuli's later changes around them.
