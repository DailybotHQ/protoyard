# @protoyard/gamification-ui

Svelte 5 UI for the pure [`@protoyard/gamification`](../gamification/README.md)
engine: level, points and streak chips, achievement badges with a progress ring,
mission cards (accept with pending feedback) and a privacy-aware leaderboard.
Texuli components and `--tx-*` tokens provide the shared UI. Lucide glyphs are
rendered through Texuli's `LucideIcon` bridge. English labels by default, translatable
through the prototype's dictionary (`protoyard.gamification.*` ids, see
[docs/TEXULI.md](../../docs/TEXULI.md#protoyard-kit-ids)). No product branding.

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
| `PointsChip` | verified `points`, optional `provisional` (spoken only), optional `icon` (default `Sparkles`), `href` |
| `StreakChip` | `weeks` from `streakWeeks`, optional `icon` (default `Flame`) |
| `AchievementBadge` | `name`, `description?`, `earned`, `progress`/`goal`, optional `icon`, `earnedAt` (ISO, shown as "Earned <date>" in the active locale), `href` (renders a link), `onclick` |
| `MissionCard` | `mission: MissionProgress`, `onAccept(id) => Promise` for pending Button; no Accept button when `requiresAcceptance` is false |
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
