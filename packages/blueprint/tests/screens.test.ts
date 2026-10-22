import { describe, expect, it } from 'vitest';
import {
  type BlueprintInput,
  type BlueprintScreen,
  blueprintJsonSchema,
  dashboardWidgets,
  deriveAppModel,
  parseBlueprint,
  SCREEN_TYPES,
  safeParseBlueprint,
  screenPath,
} from '../src/index.ts';

/** A fictional agency workspace with one screen of every kind except map (no geo field yet). */
function fixture(): BlueprintInput {
  return {
    formatVersion: 1,
    name: 'Studio projects',
    entities: [
      {
        name: 'client',
        plural: 'clients',
        fields: [{ name: 'name', kind: 'text', required: true }],
        titleField: 'name',
      },
      {
        name: 'project',
        plural: 'projects',
        fields: [
          { name: 'title', kind: 'text', required: true },
          { name: 'stage', kind: 'enum', values: ['lead', 'active', 'done'], default: 'lead' },
          { name: 'budget', kind: 'money', min: 0 },
          { name: 'hours', kind: 'integer', min: 0 },
          { name: 'billable', kind: 'boolean' },
          { name: 'startOn', kind: 'date' },
          { name: 'endOn', kind: 'date' },
          { name: 'kickoffAt', kind: 'datetime' },
          { name: 'location', kind: 'json' },
          { name: 'client', kind: 'relation', to: 'client' },
          { name: 'lead', kind: 'persona' },
          { name: 'brief', kind: 'file' },
        ],
        titleField: 'title',
        ownerField: 'lead',
        features: { audit: true, files: true, notifications: true },
      },
      {
        name: 'task',
        plural: 'tasks',
        fields: [
          { name: 'title', kind: 'text', required: true },
          { name: 'project', kind: 'relation', to: 'project', onDelete: 'cascade' },
        ],
        titleField: 'title',
      },
    ],
    roles: [{ name: 'owner', permissions: { '*': ['*'] } }],
    screens: [
      { type: 'list', entity: 'project', columns: ['title', 'stage'] },
      {
        type: 'detail',
        entity: 'project',
        tabs: ['overview', 'related:task', 'activity', 'files', 'audit'],
      },
      { type: 'form', entity: 'project' },
      {
        type: 'board',
        entity: 'project',
        groupBy: 'stage',
        cardFields: ['client', 'budget'],
        sumField: 'budget',
        nav: { label: 'Pipeline', icon: 'kanban', order: 1 },
      },
      {
        type: 'calendar',
        entity: 'project',
        dateField: 'startOn',
        endField: 'endOn',
        colorBy: 'stage',
      },
      {
        type: 'timeline',
        entity: 'project',
        startField: 'startOn',
        endField: 'endOn',
        groupBy: 'lead',
      },
      {
        type: 'analytics',
        entity: 'project',
        dateField: 'createdAt',
        measures: [{ label: 'Projects' }, { aggregate: 'sum', field: 'budget' }],
        dimensions: ['stage', 'client', 'lead', 'billable'],
      },
      {
        type: 'dashboard',
        path: '/',
        title: 'Overview',
        metrics: [{ label: 'Projects', entity: 'project', aggregate: 'count' }],
        widgets: [
          { kind: 'kpi', label: 'Avg hours', entity: 'project', aggregate: 'avg', field: 'hours' },
          {
            kind: 'kpi',
            label: 'Active budget',
            entity: 'project',
            aggregate: 'sum',
            field: 'budget',
            filter: { field: 'stage', op: 'eq', value: 'active' },
          },
          {
            kind: 'chart',
            label: 'New projects',
            entity: 'project',
            chart: 'line',
            bucket: { field: 'createdAt', unit: 'week' },
            span: 2,
          },
          { kind: 'chart', label: 'By stage', entity: 'project', chart: 'donut', groupBy: 'stage' },
          {
            kind: 'chart',
            label: 'Budget by month',
            entity: 'project',
            chart: 'bar',
            aggregate: 'sum',
            field: 'budget',
            bucket: { field: 'startOn', unit: 'month' },
          },
          {
            kind: 'list',
            label: 'Next kickoffs',
            entity: 'project',
            sort: { field: 'kickoffAt', direction: 'asc' },
            filter: { field: 'stage', op: 'in', value: ['lead', 'active'] },
          },
          { kind: 'board-summary', label: 'Pipeline', entity: 'project', groupBy: 'stage' },
          {
            kind: 'kpi',
            label: 'Latest kickoff',
            entity: 'project',
            aggregate: 'max',
            field: 'kickoffAt',
          },
        ],
      },
      {
        type: 'settings',
        sections: ['profile', 'workspace', 'appearance', 'notifications', 'danger'],
      },
    ],
  };
}

type Mutable = Record<string, unknown> & {
  entities: Array<Record<string, unknown> & { fields: Array<Record<string, unknown>> }>;
  screens: Array<Record<string, unknown>>;
};

/** Applies a mutation to a fresh fixture and returns its issues as `path: message`. */
function issuesAfter(mutate: (bp: Mutable) => void): string[] {
  const bp = fixture() as unknown as Mutable;
  mutate(bp);
  const result = safeParseBlueprint(bp);
  if (result.success) return [];
  return result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
}

/** The fixture screen of a type (mutable). */
const screen = (bp: Mutable, type: string) =>
  bp.screens.find((s) => s.type === type) as Record<string, unknown>;
const widgets = (bp: Mutable) => screen(bp, 'dashboard').widgets as Array<Record<string, unknown>>;

describe('blueprint screens', () => {
  it('parses one screen of every kind and applies defaults', () => {
    const bp = parseBlueprint(fixture());
    // Every kind but map: its geoField needs the `geo` field kind (T-gen-blueprint-geo-field).
    expect(bp.screens.map((s) => s.type).sort()).toEqual(
      SCREEN_TYPES.filter((type) => type !== 'map').sort()
    );
    const byType = Object.fromEntries(bp.screens.map((s) => [s.type, s])) as {
      [K in BlueprintScreen['type']]: Extract<BlueprintScreen, { type: K }>;
    };
    expect(byType.calendar.view).toBe('month');
    expect(byType.timeline.zoom).toBe('month');
    expect(byType.board.nav).toEqual({
      label: 'Pipeline',
      icon: 'kanban',
      order: 1,
      hidden: false,
    });
    expect(byType.analytics.measures[0]).toEqual({ label: 'Projects', aggregate: 'count' });
    const list = byType.dashboard.widgets.find((w) => w.kind === 'list');
    expect(list).toMatchObject({ limit: 5, sort: { field: 'kickoffAt', direction: 'asc' } });
  });

  it('keeps formatVersion 1 files with only the old screen kinds valid', () => {
    const bp = parseBlueprint({
      ...fixture(),
      screens: [
        { type: 'list', entity: 'project' },
        { type: 'detail', entity: 'project' },
        { type: 'board', entity: 'project', groupBy: 'stage' },
        {
          type: 'dashboard',
          metrics: [{ label: 'Projects', entity: 'project', aggregate: 'count' }],
        },
      ],
    });
    expect(bp.formatVersion).toBe(1);
    expect(bp.screens).toHaveLength(4);
  });

  it('defaults settings sections', () => {
    const bp = parseBlueprint({ ...fixture(), screens: [{ type: 'settings' }] });
    expect(bp.screens[0]).toMatchObject({ sections: ['profile', 'workspace', 'appearance'] });
  });
});

describe('dashboardWidgets', () => {
  it('turns legacy metrics into kpi widgets placed first', () => {
    const bp = parseBlueprint(fixture());
    const dashboard = bp.screens.find((s) => s.type === 'dashboard');
    if (dashboard?.type !== 'dashboard') throw new Error('fixture has a dashboard');
    const all = dashboardWidgets(dashboard);
    expect(all).toHaveLength(9);
    expect(all[0]).toEqual({
      kind: 'kpi',
      label: 'Projects',
      entity: 'project',
      aggregate: 'count',
    });
    expect(all[1]).toMatchObject({ kind: 'kpi', label: 'Avg hours' });
  });

  it('returns only widgets when there are no metrics', () => {
    const bp = parseBlueprint({
      ...fixture(),
      screens: [{ type: 'dashboard', widgets: [{ kind: 'kpi', label: 'All', entity: 'task' }] }],
    });
    const dashboard = bp.screens[0];
    if (dashboard?.type !== 'dashboard') throw new Error('expected a dashboard');
    expect(dashboardWidgets(dashboard)).toEqual([
      { kind: 'kpi', label: 'All', entity: 'task', aggregate: 'count' },
    ]);
  });
});

describe('screenPath', () => {
  const entities = [{ name: 'project', plural: 'projects' }];
  it.each([
    [{ type: 'list', entity: 'project' }, '/projects'],
    [{ type: 'detail', entity: 'project' }, '/projects/:id'],
    [{ type: 'form', entity: 'project' }, '/projects/new'],
    [{ type: 'board', entity: 'project' }, '/projects/board'],
    [{ type: 'calendar', entity: 'project' }, '/projects/calendar'],
    [{ type: 'timeline', entity: 'project' }, '/projects/timeline'],
    [{ type: 'map', entity: 'project' }, '/projects/map'],
    [{ type: 'analytics', entity: 'project' }, '/projects/analytics'],
    [{ type: 'dashboard' }, '/dashboard'],
    [{ type: 'settings' }, '/settings'],
    [{ type: 'board', entity: 'project', path: '/pipeline' }, '/pipeline'],
    [{ type: 'board', entity: 'ghost' }, null],
  ] as const)('%j → %s', (input, expected) => {
    expect(screenPath(input, entities)).toBe(expected);
  });
});

describe('screen cross-reference checks', () => {
  it('accepts the fixture', () => {
    expect(issuesAfter(() => {})).toEqual([]);
  });

  it.each([
    [
      'unknown screen entity',
      (bp: Mutable) => {
        screen(bp, 'calendar').entity = 'ghost';
      },
      'screens.4.entity: unknown entity "ghost"',
    ],
    [
      'duplicate default paths',
      (bp: Mutable) => {
        bp.screens.push({ type: 'board', entity: 'project', groupBy: 'stage' });
      },
      'screens.9.path: path "/projects/board" is already used by screens.3',
    ],
    [
      'an explicit path that collides with a default',
      (bp: Mutable) => {
        screen(bp, 'settings').path = '/projects';
      },
      'screens.8.path: path "/projects" is already used by screens.0',
    ],
    [
      'a reserved path',
      (bp: Mutable) => {
        screen(bp, 'settings').path = '/members';
      },
      'screens.8.path: path "/members" is reserved by the generated app',
    ],
    [
      'board card field unknown',
      (bp: Mutable) => {
        screen(bp, 'board').cardFields = ['owner'];
      },
      'screens.3.cardFields.0: unknown field "owner" on "project"',
    ],
    [
      'board sumField not numeric',
      (bp: Mutable) => {
        screen(bp, 'board').sumField = 'title';
      },
      'screens.3.sumField: sumField "title" must be a number, integer or money field of "project"',
    ],
    [
      'calendar dateField not a date',
      (bp: Mutable) => {
        screen(bp, 'calendar').dateField = 'title';
      },
      'screens.4.dateField: dateField "title" must be a date or datetime field of "project"',
    ],
    [
      'calendar endField equal to dateField',
      (bp: Mutable) => {
        screen(bp, 'calendar').endField = 'startOn';
      },
      'screens.4.endField: endField must differ from dateField',
    ],
    [
      'calendar colorBy not an enum',
      (bp: Mutable) => {
        screen(bp, 'calendar').colorBy = 'lead';
      },
      'screens.4.colorBy: colorBy "lead" must be an enum field of "project"',
    ],
    [
      'timeline endField missing',
      (bp: Mutable) => {
        screen(bp, 'timeline').endField = 'finishOn';
      },
      'screens.5.endField: unknown field "finishOn" on "project"',
    ],
    [
      'timeline endField equal to startField',
      (bp: Mutable) => {
        screen(bp, 'timeline').endField = 'startOn';
      },
      'screens.5.endField: endField must differ from startField',
    ],
    [
      'timeline groupBy on a boolean',
      (bp: Mutable) => {
        screen(bp, 'timeline').groupBy = 'billable';
      },
      'screens.5.groupBy: groupBy "billable" must be an enum, relation or persona field of "project"',
    ],
    [
      'map geoField not a geo field',
      (bp: Mutable) => {
        bp.screens.push({ type: 'map', entity: 'project', geoField: 'location' });
      },
      'screens.9.geoField: geoField "location" must be a geo field of "project"',
    ],
    [
      'map colorBy not an enum',
      (bp: Mutable) => {
        bp.screens.push({ type: 'map', entity: 'project', geoField: 'location', colorBy: 'title' });
      },
      'screens.9.colorBy: colorBy "title" must be an enum field of "project"',
    ],
    [
      'analytics dateField not a date',
      (bp: Mutable) => {
        screen(bp, 'analytics').dateField = 'hours';
      },
      'screens.6.dateField: dateField "hours" must be a date or datetime field of "project" (or createdAt / updatedAt)',
    ],
    [
      'analytics measure sum without a numeric field',
      (bp: Mutable) => {
        screen(bp, 'analytics').measures = [{ aggregate: 'sum', field: 'title' }];
      },
      'screens.6.measures.0.field: sum needs a number, integer or money field',
    ],
    [
      'analytics dimension on a text field',
      (bp: Mutable) => {
        screen(bp, 'analytics').dimensions = ['title'];
      },
      'screens.6.dimensions.0: dimension "title" must be an enum, relation, persona or boolean field of "project"',
    ],
    [
      'detail related tab without a relation back',
      (bp: Mutable) => {
        screen(bp, 'detail').tabs = ['related:client'];
      },
      'screens.1.tabs.0: "client" has no relation field to "project"',
    ],
    [
      'detail related tab to an unknown entity',
      (bp: Mutable) => {
        screen(bp, 'detail').tabs = ['related:ghost'];
      },
      'screens.1.tabs.0: unknown entity "ghost"',
    ],
    [
      'detail activity tab without audit',
      (bp: Mutable) => {
        screen(bp, 'detail').entity = 'task';
        screen(bp, 'detail').tabs = ['activity'];
      },
      'screens.1.tabs.0: the activity tab needs features.audit on "task"',
    ],
    [
      'detail files tab without files',
      (bp: Mutable) => {
        screen(bp, 'detail').entity = 'task';
        screen(bp, 'detail').tabs = ['files'];
      },
      'screens.1.tabs.0: the files tab needs features.files on "task"',
    ],
    [
      'detail duplicate tabs',
      (bp: Mutable) => {
        screen(bp, 'detail').tabs = ['overview', 'overview'];
      },
      'screens.1.tabs: duplicate tab "overview"',
    ],
    [
      'detail malformed tab',
      (bp: Mutable) => {
        screen(bp, 'detail').tabs = ['comments'];
      },
      'screens.1.tabs.0: tabs are overview, activity, files, audit or related:<entity>',
    ],
    [
      'settings notifications without a notifying entity',
      (bp: Mutable) => {
        (bp.entities[1] as Record<string, unknown>).features = { audit: true, files: true };
      },
      'screens.8.sections: the notifications section needs an entity with features.notifications',
    ],
    [
      'settings duplicate sections',
      (bp: Mutable) => {
        screen(bp, 'settings').sections = ['profile', 'profile'];
      },
      'screens.8.sections: duplicate section "profile"',
    ],
    [
      'nav icon outside the allow-list',
      (bp: Mutable) => {
        screen(bp, 'board').nav = { icon: 'rocket-ship' };
      },
      'screens.3.nav.icon: Invalid option: expected one of "activity"|"bell"|"book-open"|"briefcase"|"building"|"calendar"|"calendar-days"|"chart-bar"|"chart-gantt"|"chart-line"|"chart-pie"|"clock"|"cpu"|"database"|"dollar-sign"|"file-text"|"folder"|"globe"|"graduation-cap"|"heart-pulse"|"house"|"inbox"|"kanban"|"layout-dashboard"|"list"|"map"|"map-pin"|"message-square"|"package"|"receipt"|"settings"|"shopping-cart"|"star"|"table"|"tag"|"ticket"|"truck"|"users"|"wallet"|"wrench"|"zap"',
    ],
    [
      'legacy metric sum on a text field (path stays on metrics)',
      (bp: Mutable) => {
        screen(bp, 'dashboard').metrics = [
          { label: 'Bad', entity: 'project', aggregate: 'sum', field: 'title' },
        ];
      },
      'screens.7.metrics.0.field: sum needs a number, integer or money field',
    ],
    [
      'widget on an unknown entity',
      (bp: Mutable) => {
        widgets(bp)[0] = { kind: 'kpi', label: 'X', entity: 'ghost' };
      },
      'screens.7.widgets.0.entity: unknown entity "ghost"',
    ],
    [
      'count with a field',
      (bp: Mutable) => {
        widgets(bp)[0] = { kind: 'kpi', label: 'X', entity: 'project', field: 'hours' };
      },
      'screens.7.widgets.0.field: count does not take a field',
    ],
    [
      'avg on a date',
      (bp: Mutable) => {
        widgets(bp)[0] = {
          kind: 'kpi',
          label: 'X',
          entity: 'project',
          aggregate: 'avg',
          field: 'startOn',
        };
      },
      'screens.7.widgets.0.field: avg needs a number, integer or money field',
    ],
    [
      'max on text',
      (bp: Mutable) => {
        widgets(bp)[0] = {
          kind: 'kpi',
          label: 'X',
          entity: 'project',
          aggregate: 'max',
          field: 'title',
        };
      },
      'screens.7.widgets.0.field: max needs a number, integer, money, date or datetime field',
    ],
    [
      'filter on an unknown field',
      (bp: Mutable) => {
        (widgets(bp)[1] as Record<string, unknown>).filter = { field: 'ghost', op: 'eq', value: 1 };
      },
      'screens.7.widgets.1.filter.field: unknown field "ghost" on "project"',
    ],
    [
      'filter value not an enum value',
      (bp: Mutable) => {
        (widgets(bp)[1] as Record<string, unknown>).filter = {
          field: 'stage',
          op: 'eq',
          value: 'won',
        };
      },
      'screens.7.widgets.1.filter.value: "won" is not one of lead, active, done',
    ],
    [
      'filter "in" with a single value',
      (bp: Mutable) => {
        (widgets(bp)[1] as Record<string, unknown>).filter = { field: 'hours', op: 'in', value: 3 };
      },
      'screens.7.widgets.1.filter.value: op "in" needs an array value',
    ],
    [
      'filter "gte" with an array',
      (bp: Mutable) => {
        (widgets(bp)[1] as Record<string, unknown>).filter = {
          field: 'hours',
          op: 'gte',
          value: [3],
        };
      },
      'screens.7.widgets.1.filter.value: op "gte" needs a single value',
    ],
    [
      'line chart without a bucket',
      (bp: Mutable) => {
        delete widgets(bp)[2]?.bucket;
      },
      'screens.7.widgets.2.bucket: a line chart needs a date bucket',
    ],
    [
      'bucket on a non-date field',
      (bp: Mutable) => {
        (widgets(bp)[2] as Record<string, unknown>).bucket = { field: 'hours', unit: 'day' };
      },
      'screens.7.widgets.2.bucket.field: bucket field "hours" must be a date or datetime field of "project" (or createdAt / updatedAt)',
    ],
    [
      'donut without groupBy',
      (bp: Mutable) => {
        delete widgets(bp)[3]?.groupBy;
      },
      'screens.7.widgets.3.chart: a donut chart needs groupBy and no bucket',
    ],
    [
      'chart groupBy on a text field',
      (bp: Mutable) => {
        (widgets(bp)[3] as Record<string, unknown>).groupBy = 'title';
      },
      'screens.7.widgets.3.groupBy: groupBy "title" must be an enum, relation, persona or boolean field of "project"',
    ],
    [
      'bar chart without groupBy or bucket',
      (bp: Mutable) => {
        delete widgets(bp)[4]?.bucket;
      },
      'screens.7.widgets.4.chart: a bar chart needs groupBy or a date bucket',
    ],
    [
      'list sort on an unknown field',
      (bp: Mutable) => {
        (widgets(bp)[5] as Record<string, unknown>).sort = { field: 'ghost' };
      },
      'screens.7.widgets.5.sort.field: unknown field "ghost" on "project"',
    ],
    [
      'board summary on a non-enum',
      (bp: Mutable) => {
        (widgets(bp)[6] as Record<string, unknown>).groupBy = 'lead';
      },
      'screens.7.widgets.6.groupBy: groupBy "lead" must be an enum field of "project"',
    ],
  ])('rejects %s with a path-specific message', (_label, mutate, expected) => {
    expect(issuesAfter(mutate)).toContain(expected);
  });

  it('rejects unknown screen keys (strict shapes)', () => {
    const issues = issuesAfter((bp) => {
      screen(bp, 'calendar').startField = 'startOn';
    });
    expect(issues).toContain('screens.4: Unrecognized key: "startField"');
  });
});

describe('entity screen defaults', () => {
  it('materializes only the declared CRUD views and their defaults', () => {
    const input = fixture();
    input.entities[0]!.screenDefaults = {
      views: ['list'],
      list: { columns: ['name'] },
    };
    const blueprint = parseBlueprint(input);
    const clientList = blueprint.screens.find(
      (candidate) => candidate.type === 'list' && candidate.entity === 'client'
    );
    expect(clientList).toMatchObject({ type: 'list', entity: 'client', columns: ['name'] });

    const model = deriveAppModel(blueprint);
    const paths = model.routes.map((route) => route.path);
    expect(paths).toContain('/clients');
    expect(paths).not.toContain('/clients/:id');
    expect(paths).toContain('/projects');
    expect(paths).toContain('/projects/:id');
  });

  it('keeps an explicit top-level route authoritative over entity defaults', () => {
    const input = fixture();
    input.entities[0]!.screenDefaults = { views: ['list', 'detail'] };
    input.screens = [
      ...(input.screens ?? []),
      { type: 'list', entity: 'client', path: '/clients/custom', columns: ['name'] },
    ];
    const blueprint = parseBlueprint(input);
    expect(
      blueprint.screens.filter(
        (candidate) =>
          'entity' in candidate && candidate.entity === 'client' && candidate.type === 'list'
      )
    ).toHaveLength(1);
    const paths = deriveAppModel(blueprint).routes.map((route) => route.path);
    expect(paths).toContain('/clients/custom');
    expect(paths).not.toContain('/clients');
    expect(paths).toContain('/clients/:id');
  });

  it.each([
    [
      'unknown list column',
      { views: ['list'], list: { columns: ['missing'] } },
      'entities.0.screenDefaults.list.columns.0: unknown field "missing" on "client"',
    ],
    [
      'unrelated detail section',
      { views: ['detail'], detail: { tabs: ['related:task'] } },
      'entities.0.screenDefaults.detail.tabs.0: "task" has no relation field to "client"',
    ],
    [
      'detail config without detail view',
      { views: ['list'], detail: { tabs: ['overview'] } },
      'entities.0.screenDefaults.detail: detail defaults require "detail" in views',
    ],
  ])('reports a path-specific error for %s', (_label, defaults, expected) => {
    expect(
      issuesAfter((bp) => {
        (bp.entities[0] as Record<string, unknown>).screenDefaults = defaults;
      })
    ).toContain(expected);
  });

  it('rejects duplicate standard views and duplicate detail tabs', () => {
    const duplicateViewIssues = issuesAfter((bp) => {
      (bp.entities[0] as Record<string, unknown>).screenDefaults = {
        views: ['list', 'list'],
      };
    });
    expect(duplicateViewIssues).toContain('entities.0.screenDefaults.views: duplicate view "list"');

    const duplicateTabIssues = issuesAfter((bp) => {
      (bp.entities[0] as Record<string, unknown>).screenDefaults = {
        views: ['detail'],
        detail: { tabs: ['overview', 'overview'] },
      };
    });
    expect(duplicateTabIssues).toContain(
      'entities.0.screenDefaults.detail.tabs: duplicate tab "overview"'
    );
  });
});

describe('screens in the JSON Schema', () => {
  it('lists every screen type for editors', async () => {
    const text = JSON.stringify(await blueprintJsonSchema());
    for (const type of SCREEN_TYPES) {
      expect(text).toContain(`"const":"${type}"`);
    }
  });
});
