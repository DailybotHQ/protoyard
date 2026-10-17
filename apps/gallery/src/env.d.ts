/// <reference types="astro/client" />

declare module 'virtual:protoyard-registry' {
  import type { Registry } from '@/lib/types';
  export const registry: Registry | null;
  export const registryError: string | null;
  /** `${kind}:${slug}` → base-relative URL of the copied thumbnail. */
  export const thumbnails: Record<string, string>;
}

interface ImportMetaEnv {
  /** Set by `protoyard gallery`: where the local control server listens. */
  readonly PUBLIC_PROTOYARD_CONTROL_URL?: string;
}
