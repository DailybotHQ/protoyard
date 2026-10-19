/** One `@` mention or `#` reference offered while typing. */
export interface EditorSuggestion {
  id: string;
  /** Inserted after the trigger: `@marta.ruiz`, `#DEAL-42`. */
  value: string;
  /** Shown next to the value: a person's name, a record title. */
  label: string;
  description?: string;
}
