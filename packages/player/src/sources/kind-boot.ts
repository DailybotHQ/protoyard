/**
 * The kind boot loader on its own: the per-kind pages (`deck.html`,
 * `page.html`, `doc.html`) import only this, so their module graph never
 * names the app boot (CRUD shell, Faker, world worker). `boot-any.ts`, which
 * routes apps too, is imported by `index.html` alone.
 */
export const loadKindBoot = () => import('../boot-kind.ts');
