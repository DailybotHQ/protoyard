# @protoyard/gamification

Framework-agnostic **gamification engine** for Protoyard prototypes: a points
ledger (provisional and reverted entries), levels from thresholds, badges with
progress, missions (accept, progress/goal, optional deadline, reward), ISO-week
streaks and a leaderboard with a privacy opt-out. Pure TypeScript and zod — no
Svelte, no product branding.

A generic, product-agnostic engine (ADR-041).

## Install

```json
{
  "dependencies": {
    "@protoyard/gamification": "workspace:*"
  }
}
```

```ts
import {
  acceptMission,
  badgeProgress,
  levelFor,
  pointsTotals,
  rankLeaderboard,
  streakWeeks,
} from '@protoyard/gamification';
```

## Surface

| Area | API |
| --- | --- |
| Ledger | `PointsEntrySchema`, `pointsTotals`, `appendPointsEntry`, `confirmProvisionalEntry`, `revertPointsBySource` |
| Levels | `DEFAULT_LEVEL_THRESHOLDS`, `levelFor(verified, thresholds?)` |
| Time | `isoWeek`, `streakWeeks`, `isPastDeadline` |
| Badges | `BadgeDefSchema`, `badgeProgress(defs, counts, earnedIds)` |
| Missions | `MissionDefSchema`, `missionProgress`, `acceptMission`, `missionsFor` |
| Leaderboard | `LeaderboardMemberSchema`, `rankLeaderboard`, `verifiedPointsInWindow`, `rankingOptInFromChoice` |

Callers own catalogs (badge and mission defs) and how domain events become
counts. Service helpers are pure state transitions meant to run inside a
prototype service (`session.assert` → zod → `environment.run` →
`db.transaction`); this package never opens IndexedDB.

### Ledger rules

- **Verified** points: `provisional === false` and `reverted === false`.
- **Provisional** points: live provisional rows only (shown as in-progress).
- Reverting a source marks matching live rows `reverted: true` (idempotent).
- Confirming a provisional row clears `provisional` on that id.

### Levels

`levelFor(140)` on the default thresholds is level 3 (floor 100, next 225,
missing 85). The top level has `next: null` and `missing: 0`.

### Streaks

`streakWeeks(actionDates, now)` counts consecutive ISO weeks (`YYYY-Www`,
Monday-start, UTC) that contain at least one action, ending this week or last
week when the current week is empty.

### Leaderboard privacy

Only members with `rankingOptIn: true` appear. Rankings use verified points,
optionally filtered to a `YYYY-MM` month on `entry.at`. Ties break on
`subjectId` ascending.

## Honesty

This is **simulated** progress for prototypes. It is not a security boundary,
not real currency and not a live multiplayer ranking service.

## Development

```bash
pnpm --filter @protoyard/gamification typecheck
pnpm vitest run packages/gamification
```
