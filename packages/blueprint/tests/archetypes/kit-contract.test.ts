// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ARCHETYPE_KIT_ENTRY_POINTS,
  ArchetypeSchema,
  type BlueprintArchetypeInput,
} from '../../src/archetypes/index.ts';

const ROOT = fileURLToPath(new URL('../../../..', import.meta.url));
const archetypes: BlueprintArchetypeInput[] = [
  {
    id: 'assistant',
    kits: ['@protoyard/ai', '@protoyard/ai-ui'],
    entities: { conversations: 'conversation', messages: 'message' },
    screens: [{ kind: 'assistant-workspace', path: '/assistant' }],
  },
  {
    id: 'team-chat',
    kits: ['@protoyard/ai', '@protoyard/ai-ui'],
    entities: { rooms: 'room', messages: 'message', members: 'member' },
    screens: [{ kind: 'team-chat', path: '/chat' }],
  },
  {
    id: 'saas-onboarding',
    kits: ['@protoyard/saas', '@protoyard/saas-ui'],
    entities: { workspaces: 'workspace', members: 'member' },
    screens: [{ kind: 'saas-onboarding', path: '/onboarding' }],
  },
  {
    id: 'analytics',
    kits: [
      '@protoyard/analytics',
      '@protoyard/analytics-ui/grid',
      '@protoyard/analytics-ui/date-range',
    ],
    entities: { events: 'event', metrics: 'metric' },
    screens: [{ kind: 'analytics-dashboard', path: '/analytics' }],
  },
];

function packageRoot(name: string): string {
  return resolve(ROOT, 'packages', name);
}

function exportTarget(name: string, subpath = '.'): string {
  const root = packageRoot(name);
  const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
    exports: Record<string, string | Record<string, string>>;
  };
  const target = manifest.exports[subpath];
  if (typeof target === 'string') return resolve(root, target);
  const conditionalTarget = target?.svelte ?? target?.default;
  if (!conditionalTarget) throw new Error(`Missing public export ${name}/${subpath}`);
  return resolve(root, conditionalTarget);
}

function source(name: string, subpath = '.'): string {
  return readFileSync(exportTarget(name, subpath), 'utf8');
}

describe('archetype kit integration contract', () => {
  it('maps each archetype to only its declared, public package entry points', () => {
    const expectedByArchetype = {
      assistant: ['@protoyard/ai', '@protoyard/ai-ui'],
      'team-chat': ['@protoyard/ai', '@protoyard/ai-ui'],
      'saas-onboarding': ['@protoyard/saas', '@protoyard/saas-ui'],
      analytics: [
        '@protoyard/analytics',
        '@protoyard/analytics-ui/grid',
        '@protoyard/analytics-ui/date-range',
      ],
    } as const;

    for (const input of archetypes) {
      const archetype = ArchetypeSchema.parse(input);
      expect(archetype.kits).toEqual(expectedByArchetype[archetype.id]);
      for (const entryPoint of archetype.kits) {
        expect(ARCHETYPE_KIT_ENTRY_POINTS).toContain(entryPoint);
        const [, packageName, ...subpath] = entryPoint.split('/');
        const manifest = JSON.parse(
          readFileSync(resolve(packageRoot(packageName as string), 'package.json'), 'utf8')
        ) as { exports: Record<string, unknown> };
        expect(Object.keys(manifest.exports)).toContain(
          subpath.length > 0 ? `./${subpath.join('/')}` : '.'
        );
      }
    }
  });

  it('keeps AI integration on its public engine and UI entries with callback persistence', () => {
    expect(source('ai')).toContain('createAiEngine');
    expect(source('ai')).toContain('AI_MODELS');
    expect(source('ai-ui')).toContain('AssistantWorkspace');
    expect(
      readFileSync(
        resolve(packageRoot('ai-ui'), 'src/components/AssistantWorkspace.svelte'),
        'utf8'
      )
    ).toContain('onSend: (conversationId: string, input: AssistantSendInput) => unknown');
    const uiReadme = readFileSync(resolve(packageRoot('ai-ui'), 'README.md'), 'utf8');
    expect(uiReadme).toContain('Mutations are callback props');
    expect(uiReadme).toContain('does not persist changes');
    expect(readFileSync(resolve(packageRoot('ai'), 'src/models.ts'), 'utf8')).toContain(
      'simulated: true'
    );
  });

  it('keeps onboarding on the public simulated SaaS engine and lazy route contract', () => {
    expect(source('saas')).toContain('generateSaasWorld');
    expect(source('saas')).toContain('SAAS_DEMO_PASSWORD');
    expect(source('saas-ui')).toContain('saasRoutes');
    const routes = readFileSync(resolve(packageRoot('saas-ui'), 'src/routes.ts'), 'utf8');
    expect(routes).toContain("onboarding: () => import('./screens/Onboarding.svelte')");
    expect(routes).toContain('load: loader');
    expect(
      readFileSync(
        resolve(packageRoot('saas-ui'), 'src/screens/onboarding/OnboardingWizard.svelte'),
        'utf8'
      )
    ).toContain('onComplete?: () => void');
    const docs = readFileSync(resolve(packageRoot('saas-ui'), 'README.md'), 'utf8');
    expect(docs).toContain('Simulation, not security');
  });

  it('keeps analytics on only the public engine and declared UI subpaths', () => {
    expect(source('analytics')).toContain('aggregate');
    expect(source('analytics-ui', './grid')).toContain('DashboardGrid');
    expect(source('analytics-ui', './date-range')).toContain('DateRangePicker');
    expect(
      readFileSync(resolve(packageRoot('analytics-ui'), 'src/grid/DashboardGrid.svelte'), 'utf8')
    ).toContain('onchange?: (layout: DashboardLayout) => unknown');
    expect(
      readFileSync(
        resolve(packageRoot('analytics-ui'), 'src/date-range/DateRangePicker.svelte'),
        'utf8'
      )
    ).toContain('onchange: (value: DateRangeValue) => void');
    const readme = readFileSync(resolve(packageRoot('analytics-ui'), 'README.md'), 'utf8');
    expect(readme).toContain("prototype's service promise");
    expect(readme).toContain('onchange');
  });
});
