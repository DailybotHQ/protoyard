/** The validated props type of a layout schema (its `parse` output), without importing zod. */
export type PropsOf<S extends { parse: (input: unknown) => unknown }> = ReturnType<S['parse']>;
