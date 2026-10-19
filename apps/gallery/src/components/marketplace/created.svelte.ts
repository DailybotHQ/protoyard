/**
 * The prototype the create flow just started, shared between the side-column
 * CreateFlow island and the full-width CreatedPreview island on the same page
 * (islands on one page share this module instance).
 */
export interface CreatedPrototype {
  slug: string;
  name: string;
  shell: string;
  platform: string;
}

export const created = $state<{ current: CreatedPrototype | null }>({ current: null });
