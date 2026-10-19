import type { ReviewAdapter } from '../store/index.ts';
import {
  type ArtifactCapability,
  type ArtifactClaude,
  type ArtifactDatabase,
  type ArtifactUser,
  createArtifactReviewAdapter,
} from './artifact.ts';

export interface ArtifactCommentsCapability {
  composer_only: true;
  openComposer(options: { element: Element }): void | Promise<void>;
}

export type ArtifactShellCapability = ArtifactDatabase | ArtifactUser | ArtifactCommentsCapability;

export interface ArtifactShellClaude {
  use(capability: ArtifactCapability | 'comments'): Promise<ArtifactShellCapability | null>;
}

export type ArtifactShellReviewMode = 'shared' | 'composer_only' | 'local';

export interface ArtifactShellReviewResult {
  adapter: ReviewAdapter;
  mode: ArtifactShellReviewMode;
  /** Call only from a viewer gesture. Returns false when the shell has no composer. */
  openComposer(element: Element): Promise<boolean>;
}

function isCommentsCapability(value: unknown): value is ArtifactCommentsCapability {
  return (
    typeof value === 'object' &&
    value !== null &&
    'composer_only' in value &&
    value.composer_only === true &&
    'openComposer' in value &&
    typeof value.openComposer === 'function'
  );
}

/**
 * Prefer shared artifact storage. When it is unavailable, use Claude's
 * write-only comments capability without pretending that it stores threads
 * for Protoyard to read back.
 */
export async function createArtifactShellReviewAdapter(
  fallback: ReviewAdapter,
  claude: ArtifactShellClaude | undefined = typeof window === 'undefined'
    ? undefined
    : (window as Window & { claude?: ArtifactShellClaude }).claude
): Promise<ArtifactShellReviewResult> {
  if (typeof claude?.use !== 'function') {
    return { adapter: fallback, mode: 'local', openComposer: async () => false };
  }

  const dbUserClaude: ArtifactClaude = {
    use: async (capability: ArtifactCapability): Promise<ArtifactDatabase | ArtifactUser | null> =>
      (await claude.use(capability)) as ArtifactDatabase | ArtifactUser | null,
  };
  const shared = await createArtifactReviewAdapter(fallback, dbUserClaude);
  if (shared !== fallback) {
    return { adapter: shared, mode: 'shared', openComposer: async () => false };
  }

  try {
    const comments = await claude.use('comments');
    if (isCommentsCapability(comments)) {
      return {
        adapter: fallback,
        mode: 'composer_only',
        openComposer: async (element) => {
          await comments.openComposer({ element });
          return true;
        },
      };
    }
  } catch {
    // Keep the local adapter when the optional shell capability is unavailable.
  }

  return { adapter: fallback, mode: 'local', openComposer: async () => false };
}
