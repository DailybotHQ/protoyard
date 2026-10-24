/**
 * `@protoyard/blocks/code` — thin re-export of `@texuli/blocks/code/tokenizer`
 * (and language resolution from `@texuli/blocks/code`). Tokenize source into
 * `{ kind, text }` tokens; renderers map kinds to theme classes and never
 * build HTML.
 *
 * ```ts
 * const lines = splitTokenLines(tokenizeCode('const a = 1;', 'ts'));
 * ```
 */

export {
  CODE_GRAMMAR_LANGUAGES,
  type CodeGrammarLanguage,
  resolveCodeLanguage,
} from '@texuli/blocks/code';
export {
  bashGrammar,
  CODE_TOKEN_KINDS,
  CODE_TOKENIZE_MAX_LENGTH,
  type CodeToken,
  type CodeTokenKind,
  countCodeLines,
  cssGrammar,
  type Grammar,
  type GrammarRule,
  type HighlightStep,
  htmlGrammar,
  javascriptGrammar,
  jsonGrammar,
  parseLineSpec,
  pythonGrammar,
  type RuleContext,
  resolveHighlightSteps,
  splitTokenLines,
  sqlGrammar,
  sticky,
  tokenize,
  tokenizeCode,
  typescriptGrammar,
  yamlGrammar,
} from '@texuli/blocks/code/tokenizer';
