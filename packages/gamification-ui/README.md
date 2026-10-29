# @protoyard/gamification-ui

Svelte 5 UI for the pure [`@protoyard/gamification`](../gamification/README.md)
engine: level, points and streak chips, achievement badges with a progress ring,
mission cards (accept with pending feedback) and a privacy-aware leaderboard.
Texuli components and `--tx-*` tokens provide the shared UI. Lucide glyphs are
rendered through Texuli's `LucideIcon` bridge. Generic English labels — no
product branding.

## Install

```json
{
  "dependencies": {
    "@protoyard/gamification-ui": "workspace:*"
  }
}
```

```css
@import 'tailwindcss';
@import '@protoyard/themes/base.css';
@import '@protoyard/ui/styles.css';
@import '@protoyard/gamification-ui/styles.css';
```

```svelte
<script lang="ts">
  import {
    AchievementBadge,
    Leaderboard,
    LevelChip,
    MissionCard,
    PointsChip,
    StreakChip,
  } from '@protoyard/gamification-ui';
</script>

<LevelChip level={3} />
<PointsChip points={140} provisional={10} />
<StreakChip weeks={4} />
```

## Components

| Component | Role |
| --- | --- |
| `LevelChip` | `level`, optional `href` |
| `PointsChip` | verified `points`, optional `provisional` (spoken only) |
| `StreakChip` | `weeks` from `streakWeeks` |
| `AchievementBadge` | `name`, `description?`, `earned`, `progress`/`goal`, optional `icon`, `onclick` |
| `MissionCard` | `mission: MissionProgress`, `onAccept(id) => Promise` for pending Button |
| `Leaderboard` | `rows: LeaderboardRow[]` (already filtered by opt-in), `currentSubjectId`, `rankingOptIn`, `onRankingOptInChange` |

Wire mutations through prototype services that call the engine helpers
(`acceptMission`, `rankingOptInFromChoice`, ledger writes). Components never
open IndexedDB.

## Honesty

Simulated progress for prototypes. Leaderboard privacy is a UX control, not
security.

## Development

```bash
pnpm --filter @protoyard/gamification-ui typecheck
pnpm vitest run packages/gamification-ui
```
