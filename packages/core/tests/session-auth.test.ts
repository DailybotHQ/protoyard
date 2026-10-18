import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  definePrototype,
  type Principal,
  type PrototypeAuthOptions,
  PrototypeAuthOptionsSchema,
  type PrototypeDefinition,
  parseManifest,
  type SessionAuthState,
  type SessionController,
} from '../src/index.ts';

function definition(extra: Partial<PrototypeDefinition> = {}): PrototypeDefinition {
  return {
    manifest: parseManifest({
      id: 'example.auth',
      slug: 'auth-demo',
      name: 'Auth demo',
      version: '0.1.0',
      storage: { namespace: 'auth-demo', schemaVersion: 1 },
    }),
    database: { versions: [{ version: 1, stores: { notes: 'id' } }] },
    scenarios: [],
    generate: () => ({ organizations: [], personas: [], memberships: [], tables: {} }),
    ...extra,
  };
}

describe('signed-out session contract', () => {
  it('types the simulated sign-in methods on the session controller', () => {
    expectTypeOf<SessionAuthState>().toEqualTypeOf<'signed-in' | 'signed-out'>();
    expectTypeOf<SessionController['signIn']>().toEqualTypeOf<
      (personaId: string) => Promise<void>
    >();
    expectTypeOf<SessionController['signOut']>().toEqualTypeOf<() => Promise<void>>();
    expectTypeOf<SessionController['isSignedIn']>().toEqualTypeOf<() => boolean>();
    expectTypeOf<SessionController['authState']>().toEqualTypeOf<() => SessionAuthState>();
    // A signed-out session has no principal even when personas exist.
    expectTypeOf<ReturnType<SessionController['principal']>>().toEqualTypeOf<Principal | null>();
    expectTypeOf<PrototypeDefinition['auth']>().toEqualTypeOf<PrototypeAuthOptions | undefined>();
  });

  it('defaults to signed in and rejects unknown auth keys', () => {
    expect(PrototypeAuthOptionsSchema.parse({})).toEqual({ signedOutByDefault: false });
    expect(PrototypeAuthOptionsSchema.parse({ signedOutByDefault: true })).toEqual({
      signedOutByDefault: true,
    });
    expect(PrototypeAuthOptionsSchema.safeParse({ signedOut: true }).success).toBe(false);
    expect(PrototypeAuthOptionsSchema.safeParse({ signedOutByDefault: 'yes' }).success).toBe(false);
  });

  it('definePrototype keeps auth optional and fails loudly on invalid options', () => {
    expect(definePrototype(definition()).auth).toBeUndefined();
    expect(definePrototype(definition({ auth: { signedOutByDefault: true } })).auth).toEqual({
      signedOutByDefault: true,
    });
    expect(() => definePrototype(definition({ auth: { signedOutByDefault: 1 as never } }))).toThrow(
      /Invalid prototype "auth" options \(signedOutByDefault/
    );
  });
});
