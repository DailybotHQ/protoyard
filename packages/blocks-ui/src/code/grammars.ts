import type { CodeGrammarLanguage, Grammar } from '@protoyard/blocks/code';

/**
 * One lazy chunk per grammar: a code block downloads only the grammar of its
 * own language (the shared tokenizer core stays in the code chunk). Each
 * `languages/*.ts` re-exports a single grammar so the bundler can split them.
 */
const LOADERS: Readonly<Record<CodeGrammarLanguage, () => Promise<{ grammar: Grammar }>>> = {
  ts: () => import('./languages/ts.ts'),
  js: () => import('./languages/js.ts'),
  json: () => import('./languages/json.ts'),
  bash: () => import('./languages/bash.ts'),
  python: () => import('./languages/python.ts'),
  html: () => import('./languages/html.ts'),
  css: () => import('./languages/css.ts'),
  sql: () => import('./languages/sql.ts'),
  yaml: () => import('./languages/yaml.ts'),
};

const cache = new Map<string, Promise<Grammar | null>>();

/** The grammar for a code block language, or `null` for `text` and unknown ids. Cached per language. */
export function loadGrammar(lang: string): Promise<Grammar | null> {
  const cached = cache.get(lang);
  if (cached) return cached;
  const load = Object.hasOwn(LOADERS, lang) ? LOADERS[lang as CodeGrammarLanguage] : undefined;
  const pending = load
    ? load().then(
        (module) => module.grammar,
        () => {
          cache.delete(lang);
          return null;
        }
      )
    : Promise.resolve(null);
  cache.set(lang, pending);
  return pending;
}
