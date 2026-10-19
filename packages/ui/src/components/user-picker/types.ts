export interface PickerUser {
  id: string;
  name: string;
  subtitle?: string;
  /** Image URL (for a persona, `avatarImage(persona.avatar).src` from @protoyard/renderer-svelte). */
  avatarUrl?: string;
  /** Optional `srcset` for the image (`avatarImage(persona.avatar).srcset`). */
  avatarSrcset?: string;
}
