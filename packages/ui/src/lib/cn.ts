import { type ClassInput, cx } from 'texuli/cx';

/**
 * Joins class names: strings, arrays and `{ class: condition }` objects, with
 * falsy values dropped. An alias of Texuli's `cx` (`texuli/cx`), kept so
 * existing imports of `cn` from `@protoyard/ui` keep working.
 *
 * It does **not** resolve Tailwind conflicts any more (it used to run
 * tailwind-merge): `cn('p-4', 'p-2')` keeps both classes, and which one wins
 * is decided by the stylesheet, not by their order here. To override a
 * component's look, pass a class that does not collide with its defaults, or
 * use Tailwind's important modifier (`p-2!`). Texuli's components put their
 * own styles in `@layer tx.components`, so any Tailwind utility you pass
 * already wins over them.
 */
export function cn(...inputs: ClassInput[]): string {
  return cx(...inputs);
}
