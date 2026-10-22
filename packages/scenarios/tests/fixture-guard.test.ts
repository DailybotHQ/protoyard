import { describe, expect, it } from 'vitest';
import {
  ALLOWED_FIXTURE_EMAIL_DOMAINS,
  formatFixtureFinding,
  isAllowedFixtureEmailDomain,
  SECRET_PATTERNS,
  scanFixtureFiles,
  scanFixtureText,
  scanFixtureWorld,
} from '../src/fixture-guard.ts';

describe('isAllowedFixtureEmailDomain', () => {
  it('accepts reserved example domains and suffixes', () => {
    for (const d of ALLOWED_FIXTURE_EMAIL_DOMAINS) {
      expect(isAllowedFixtureEmailDomain(d)).toBe(true);
    }
    expect(isAllowedFixtureEmailDomain('piedpiper.example')).toBe(true);
    expect(isAllowedFixtureEmailDomain('mail.test')).toBe(true);
    expect(isAllowedFixtureEmailDomain('user.invalid')).toBe(true);
    expect(isAllowedFixtureEmailDomain('app.localhost')).toBe(true);
    expect(isAllowedFixtureEmailDomain('team.example.com')).toBe(true);
  });

  it('rejects ordinary public domains unless allow-listed', () => {
    expect(isAllowedFixtureEmailDomain('gmail.com')).toBe(false);
    expect(isAllowedFixtureEmailDomain('company.io')).toBe(false);
    expect(isAllowedFixtureEmailDomain('company.io', ['company.io'])).toBe(true);
  });
});

describe('scanFixtureText', () => {
  it('accepts documented fictional addresses', () => {
    expect(scanFixtureText('avery@piedpiper.example and ops@example.com')).toEqual([]);
    expect(scanFixtureText('hello@example.org, noreply@example.net')).toEqual([]);
    expect(scanFixtureText('bot@mail.test')).toEqual([]);
  });

  it('flags real-looking email domains with path and domain-only detail', () => {
    const findings = scanFixtureText('write to someone@gmail.com', { path: 'notes.body' });
    expect(findings).toEqual([
      expect.objectContaining({
        kind: 'real-email',
        path: 'notes.body',
        rule: 'real-email',
        detail: 'gmail.com',
      }),
    ]);
    expect(findings[0]?.message).toMatch(/gmail\.com/);
    expect(findings[0]?.message).toMatch(/example\.com/);
    expect(findings[0]?.message).not.toMatch(/someone@/);
  });

  it('detects representative secret shapes without echoing the secret', () => {
    const slack = ['token ', 'xox', 'b-1234567890-abcdef'].join('');
    const slackHit = scanFixtureText(slack, { path: 'config.token' });
    expect(slackHit[0]).toMatchObject({
      kind: 'secret',
      path: 'config.token',
      detail: 'Slack token',
    });
    expect(slackHit[0]?.message).not.toMatch(/xoxb/);
    expect(slackHit[0]?.message).toMatch(/Slack token/);

    // Synthetic id (not the public AWS docs example) so runners cannot strip it.
    const awsKey = `AKIA${'B'.repeat(16)}`;
    const aws = scanFixtureText(`key=${awsKey}`);
    expect(aws.some((f) => f.rule === 'secret:aws-access-key')).toBe(true);
    expect(aws[0]?.message).not.toContain(awsKey);

    const gh = scanFixtureText(`auth ${'ghp_'}${'a'.repeat(36)}`);
    expect(gh.some((f) => f.rule === 'secret:github-token')).toBe(true);

    const stripe = scanFixtureText(`pk_live_${'x'.repeat(20)}`);
    expect(stripe.some((f) => f.rule === 'secret:stripe-live-key')).toBe(true);

    const pem = scanFixtureText(['-----BEGIN ', 'PRIVATE KEY-----'].join(''));
    expect(pem.some((f) => f.rule === 'secret:private-key')).toBe(true);

    const jwt = [
      'eyJ',
      'hbGciOiJIUzI1NiJ9',
      '.',
      'eyJ',
      'zdWIiOiIxMjM0NTY3ODkwIn0',
      '.',
      'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
    ].join('');
    expect(scanFixtureText(jwt).some((f) => f.rule === 'secret:signed-jwt')).toBe(true);

    expect(SECRET_PATTERNS.length).toBeGreaterThanOrEqual(5);
  });
});

describe('scanFixtureWorld', () => {
  it('reports stable paths into nested rows and leaves the world untouched', () => {
    const world = {
      personas: [{ id: 'a', email: 'avery@example.com' }],
      tables: {
        notes: [{ id: 'n1', body: 'ping someone@company.io please' }],
      },
    };
    const before = JSON.stringify(world);
    const findings = scanFixtureWorld(world);
    expect(JSON.stringify(world)).toBe(before);
    expect(findings).toEqual([
      expect.objectContaining({
        kind: 'real-email',
        path: 'tables.notes[0].body',
        detail: 'company.io',
      }),
    ]);
    expect(formatFixtureFinding(findings[0]!)).toContain('tables.notes[0].body');
  });

  it('skips subtrees marked with $fixtureAllow and ignorePaths', () => {
    const world = {
      public: { email: 'ok@example.com' },
      planted: {
        $fixtureAllow: true,
        email: 'planted@gmail.com',
        token: ['xox', 'b-1234567890-abcdef'].join(''),
      },
      audit: { email: 'log@gmail.com' },
    };
    expect(scanFixtureWorld(world, { ignorePaths: ['audit'] })).toEqual([]);
    expect(
      scanFixtureWorld(world, { honorAllowMarkers: false }).some((f) => f.detail === 'gmail.com')
    ).toBe(true);
  });

  it('bounds output and accepts extra allowEmailDomains', () => {
    const world = {
      a: 'a@gmail.com',
      b: 'b@yahoo.com',
      c: 'c@corp.io',
    };
    const limited = scanFixtureWorld(world, { maxFindings: 2 });
    expect(limited).toHaveLength(2);
    expect(scanFixtureWorld({ email: 'ops@corp.io' }, { allowEmailDomains: ['corp.io'] })).toEqual(
      []
    );
  });
});

describe('scanFixtureFiles', () => {
  it('points diagnostics at file:path:line without rewriting content', () => {
    const text = "const email = 'lead@gmail.com';\nconst ok = 'ops@example.com';\n";
    const findings = scanFixtureFiles([{ path: 'src/scenarios/generators.ts', text }]);
    expect(findings).toEqual([
      expect.objectContaining({
        path: 'file:src/scenarios/generators.ts:1',
        detail: 'gmail.com',
      }),
    ]);
    expect(text).toContain('lead@gmail.com');
  });
});
