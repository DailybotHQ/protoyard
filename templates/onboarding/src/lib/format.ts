const dateFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

export const formatDate = (iso: string) => dateFormat.format(new Date(iso));

export const TEAM_SIZE_LABELS: Record<string, string> = {
  '1': 'Just me',
  '2-10': '2–10 people',
  '11-50': '11–50 people',
  '51-200': '51–200 people',
  '201+': '201+ people',
};

export const USE_CASE_LABELS: Record<string, { label: string; description: string }> = {
  projects: { label: 'Project management', description: 'Plan work, track tasks and deadlines.' },
  support: { label: 'Customer support', description: 'Answer requests and keep customers happy.' },
  sales: { label: 'Sales pipeline', description: 'Follow leads from first call to close.' },
  internal: { label: 'Internal tools', description: 'Run approvals, requests and checklists.' },
  other: { label: 'Something else', description: "We'll keep things general." },
};

export const DIGEST_LABELS: Record<string, string> = {
  daily: 'Every morning',
  weekly: 'Every Monday',
  never: 'Never',
};

export const timezoneLabel = (tz: string) => tz.replace(/_/g, ' ').replace('/', ' / ');
