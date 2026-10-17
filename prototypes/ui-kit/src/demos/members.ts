/** Deterministic fictional people shared by the data demos (no randomness, no real persons). */
export interface Member {
  id: string;
  name: string;
  email: string;
  role: 'Owner' | 'Admin' | 'Editor' | 'Viewer';
  status: 'active' | 'invited' | 'suspended';
  projects: number;
  joined: Date;
}

const FIRST = ['Ana', 'Omar', 'Kai', 'Priya', 'Lena', 'Tomás', 'Mia', 'Leo', 'Ivy', 'Noah'];
const LAST = ['Lee', 'Diaz', 'Moreno', 'Shah', 'Novak', 'Ruiz', 'Okafor', 'Berg', 'Tanaka'];
const ROLES: Member['role'][] = ['Admin', 'Editor', 'Editor', 'Viewer', 'Editor', 'Viewer'];
const STATUSES: Member['status'][] = [
  'active',
  'active',
  'active',
  'invited',
  'active',
  'suspended',
];

export function makeMembers(count: number): Member[] {
  return Array.from({ length: count }, (_, index) => {
    const first = FIRST[index % FIRST.length] ?? 'Sam';
    const last = LAST[(index * 7) % LAST.length] ?? 'Example';
    return {
      id: `m-${index + 1}`,
      name: `${first} ${last}`,
      email: `${first.toLowerCase().replace('á', 'a')}.${last.toLowerCase()}@example.com`,
      role: index === 0 ? 'Owner' : (ROLES[index % ROLES.length] ?? 'Viewer'),
      status: STATUSES[(index * 5) % STATUSES.length] ?? 'active',
      projects: (index * 13) % 17,
      joined: new Date(Date.UTC(2025, index % 12, ((index * 11) % 27) + 1)),
    };
  });
}

export const PEOPLE = [
  { id: 'u-ana', name: 'Ana Lee', subtitle: 'ana@example.com · Design' },
  { id: 'u-omar', name: 'Omar Diaz', subtitle: 'omar@example.com · Engineering' },
  { id: 'u-kai', name: 'Kai Moreno', subtitle: 'kai@example.com · Support' },
  { id: 'u-priya', name: 'Priya Shah', subtitle: 'priya@example.com · Product' },
  { id: 'u-lena', name: 'Lena Novak', subtitle: 'lena@example.com · Marketing' },
  { id: 'u-tomas', name: 'Tomás Ruiz', subtitle: 'tomas@example.com · Finance' },
];
