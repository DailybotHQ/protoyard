/** Text helpers for the brief synthesizer: tokens, singular/plural and identifier casing. */

/** Lowercase words of a brief, letters only (`"Track SLA's!"` → `['track', 'sla', 's']`). */
export function words(text: string): string[] {
  return text.toLowerCase().match(/[a-z]+/g) ?? [];
}

/** True when `phrase` (one or more words) occurs in `text` as whole words. */
export function hasPhrase(normalized: string, phrase: string): boolean {
  return ` ${normalized} `.includes(` ${phrase} `);
}

/** `"Track invoices, fast!"` → `"track invoices fast"`: words joined by single spaces. */
export function normalize(text: string): string {
  return words(text).join(' ');
}

const IRREGULAR: Record<string, string> = {
  people: 'person',
  children: 'child',
  men: 'man',
  women: 'woman',
  data: 'data',
  news: 'news',
  analyses: 'analysis',
  statuses: 'status',
  classes: 'class',
  businesses: 'business',
  addresses: 'address',
  quizzes: 'quiz',
};

export function singular(word: string): string {
  if (IRREGULAR[word]) return IRREGULAR[word] as string;
  if (word.endsWith('ies') && word.length > 4) return `${word.slice(0, -3)}y`;
  if (/(ches|shes|xes|sses|zes)$/.test(word)) return word.slice(0, -2);
  if (word.endsWith('s') && !word.endsWith('ss') && !word.endsWith('us') && word.length > 3) {
    return word.slice(0, -1);
  }
  return word;
}

export function plural(word: string): string {
  const back = Object.entries(IRREGULAR).find(([, one]) => one === word);
  if (back && back[0] !== word) return back[0];
  if (/[^aeiou]y$/.test(word)) return `${word.slice(0, -1)}ies`;
  if (/(s|x|z|ch|sh)$/.test(word)) return `${word}es`;
  return `${word}s`;
}

/** `['due', 'date']` → `dueDate`. */
export function camel(parts: readonly string[]): string {
  return parts
    .map((part, i) => (i === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join('');
}

/** `support-ticket` → `Support tickets` style labels are left to the UI; this title-cases words. */
export function titleCase(text: string): string {
  return text.replace(
    /(^|[\s-])([a-z])/g,
    (_, sep: string, c: string) => `${sep}${c.toUpperCase()}`
  );
}
