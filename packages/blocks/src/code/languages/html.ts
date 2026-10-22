import { type Grammar, sticky } from '../tokenizer.ts';
import { WHITESPACE } from './shared.ts';

/**
 * HTML markup: comments, doctype, tags, attributes and entities. Embedded
 * `<script>` and `<style>` bodies are not re-tokenized as JS or CSS.
 */
export const htmlGrammar: Grammar = {
  name: 'html',
  start: 'text',
  states: {
    text: [
      { re: sticky(String.raw`<!--[\s\S]*?(?:-->|(?![\s\S]))`), kind: 'comment' },
      { re: sticky('<![^>]*>?'), kind: 'keyword' },
      { re: sticky(String.raw`<\/?(?=[A-Za-z])`), kind: 'punctuation', next: 'tagName' },
      {
        re: sticky(String.raw`&(?:#\d{1,7}|#[xX][\da-fA-F]{1,6}|[A-Za-z][A-Za-z\d]{0,31});`),
        kind: 'constant',
      },
      { re: sticky('[^<&]+'), kind: 'plain' },
    ],
    tagName: [{ re: sticky(String.raw`[A-Za-z][\w:-]*`), kind: 'tag', next: 'tag' }],
    tag: [
      WHITESPACE,
      { re: sticky(String.raw`\/?>`), kind: 'punctuation', next: 'text' },
      { re: sticky(String.raw`"[^"]*(?:"|(?![\s\S]))`), kind: 'string' },
      { re: sticky(String.raw`'[^']*(?:'|(?![\s\S]))`), kind: 'string' },
      { re: sticky('='), kind: 'operator' },
      {
        re: sticky(String.raw`[^\s"'>/=]+`),
        kind: (_text, ctx) => (ctx.prev?.text === '=' ? 'string' : 'attr'),
      },
      { re: sticky('/'), kind: 'punctuation' },
    ],
  },
};
